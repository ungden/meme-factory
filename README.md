# AIDA

Một ý tưởng → đủ nội dung để đăng. AIDA là xưởng nội dung cho chủ fanpage Việt:
tạo ảnh có nhân vật riêng, video ngắn, và phim ngắn nhiều cảnh có lồng tiếng —
tính tiền bằng điểm, nạp qua chuyển khoản ngân hàng.

## Kiến trúc

| Thành phần | Chạy ở đâu | Việc chính |
|---|---|---|
| Web + API | Vercel (Next.js 16, App Router) | Giao diện, route API, cron dự phòng |
| Worker | Railway (`Dockerfile.video-worker`) | Poll provider, dựng phim bằng ffmpeg, heartbeat |
| Dữ liệu | Supabase (Postgres + Storage) | 56 bảng, RLS bật toàn bộ, RPC cho mọi thao tác trừ điểm |
| Provider | WaveSpeed (video), Gemini (kịch bản/QA/TTS), OpenAI (ảnh có chữ) | |
| Thanh toán | SePay (chuyển khoản, webhook) | |

Worker Railway chạy `next start` nội bộ rồi `scripts/wavespeed-worker.mjs`
(xem `scripts/railway-worker-entrypoint.mjs`). Từ tháng 9/2026, cron Vercel
(`vercel.json`) gọi song song `/api/cron/tick` mỗi phút, nên worker chết thì
phim vẫn tiến.

Nguồn sự thật của schema là `supabase/migrations`. Áp bằng `supabase db push`;
đừng sửa tay trên dashboard (xem *Sổ migration* bên dưới).

## Chạy ở máy

Cần Node 22 (`.nvmrc`), npm 11, Supabase CLI, và Docker nếu chạy stack Supabase
local. ffmpeg cần cho các kiểm thử dựng phim.

```bash
nvm use
npm install
cp .env.example .env.local   # điền ít nhất phần Supabase + GEMINI_API_KEY
supabase start && supabase db reset
npm run dev
```

`.env.example` liệt kê đủ biến, kèm ghi chú nơi nào cần biến nào.

## Kiểm tra trước khi đẩy

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
node --test scripts/tests/dubbing.integration.mjs scripts/tests/short-film-edit-range.mjs scripts/tests/short-film-media.mjs scripts/tests/speech-pace.mjs
```

CI (`.github/workflows/ci.yml`) chạy đúng các lệnh này trên mỗi PR.

`npm test` cần binary Rolldown đúng nền tảng; nếu báo
`Cannot find module './rolldown-binding.<platform>.node'`, cài optional
dependency tương ứng, ví dụ `npm install @rolldown/binding-darwin-arm64 --no-save`.

### Kiểm thử SQL và sổ migration

```bash
SUPABASE_DB_URL=postgres://... npm run test:sql
SUPABASE_DB_URL=postgres://... npm run check:migrations
```

`scripts/tests/*.sql` kiểm RPC, quyền và index trên một Postgres thật nên không
nằm trong `npm test`. Mỗi file chạy trong một transaction luôn bị rollback —
vẫn phải trỏ vào database kiểm thử, không phải production. Thiếu
`SUPABASE_DB_URL` thì bỏ qua ở máy cá nhân nhưng **fail trong CI**.

Job `database` trong CI chỉ bật khi repo có một **database kiểm thử riêng**:
đặt variable `HAS_TEST_DATABASE=true` và secret `SUPABASE_DB_URL`. Đừng trỏ vào
production — dù có rollback thì vẫn là ghi tạm lên dữ liệu thật. Chưa có
database kiểm thử thì chạy tay hai lệnh trên trước mỗi lần phát hành.

`check:migrations` đối chiếu `supabase/migrations` với sổ migration trên
database. Supabase nhớ migration bằng con số timestamp: áp SQL ngoài
`supabase db push` sẽ ghi con số của lúc bấm, và lần push sau chạy lại migration
đó. Ngày 16/09/2026 có 20 migration lệch kiểu này cùng lúc.

## Triển khai

Cả hai nơi đều tự động deploy khi `main` được đẩy lên.

| | Vercel (`meme-factory`) | Railway (`aida-video-worker`) |
|---|---|---|
| Nguồn | GitHub `ungden/meme-factory`, nhánh `main` | GitHub `ungden/meme-factory`, nhánh `main` |
| Build | Next.js mặc định | `Dockerfile.video-worker` (`RAILWAY_DOCKERFILE_PATH`) |
| Chạy | Web + API + cron | `next start` nội bộ + `scripts/wavespeed-worker.mjs` |

Container Railway phục vụ chính bộ code Next đó ở `127.0.0.1:$PORT` cho worker
gọi vào, nên nó cần **cả biến của app** (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`) chứ không chỉ biến của worker. Thiếu chúng thì
proxy trả 503 cho mọi lời gọi nội bộ và worker chạy trong vô ích.

`CRON_SECRET` phải có trên Vercel, nếu không cron của Vercel gọi vào
`/api/cron/*` sẽ bị 401 và lưới an toàn khi worker chết không hoạt động — lỗi
này im lặng, chỉ thấy khi đọc log runtime.

Kiểm tra nhanh sau khi deploy:

```bash
npm run smoke
railway logs | tail -20
```

`npm run smoke` mở toàn bộ bề mặt công khai (trang chủ, giá, hỗ trợ, đăng nhập,
điều khoản, robots, sitemap, health) và kiểm cả những route nội bộ **phải** trả
401. Nó kiểm nội dung chứ không chỉ mã trạng thái — một trang trả 200 với nội
dung sai vẫn bị bắt. Thêm địa chỉ khác để kiểm môi trường khác:
`node scripts/smoke.mjs http://localhost:3000`.

## Vận hành

### Sức khoẻ hệ thống

- `GET /api/health` — 200 khi phục vụ được, 503 khi thiếu cấu hình hoặc mất
  database. Công khai, không cache. Thêm `?strict=worker` để 503 cả khi worker
  Railway im lặng quá 5 phút (dùng cho uptime monitor).
- Worker báo nhịp thở mỗi 30 giây vào `system_settings.worker_heartbeat`.
- `GET /api/cron/alerts` (cron 5 phút) báo Telegram khi: worker im lặng > 5
  phút, lượt phim chờ người > 30 phút, > 30% tác vụ provider hỏng trong 1 giờ,
  hoàn điểm bất thường. Luật nằm ở `src/lib/alerts.ts` và có test.
- Lỗi được gửi lên Sentry qua `SENTRY_DSN` (`scripts/observability.mjs`, không
  dùng SDK). Không có DSN thì vẫn in một dòng JSON ra log.

### Runbook sự cố

| Triệu chứng | Xử lý |
|---|---|
| Phim đứng ở một công đoạn | Xem `short_film_production_runs.status`/`error`. `needs_review` là đang chờ người quyết định trong Studio. |
| Worker Railway chết | Cron Vercel vẫn đẩy lượt chạy (chậm hơn). Kiểm log Railway, redeploy. Cảnh báo "worker im lặng" sẽ tới trong 5 phút. |
| Webhook WaveSpeed lỗi | Lỗi đã có trong Sentry kèm `webhook-id`. `/api/internal/wavespeed/reconcile` đối soát lại các job đang chạy. |
| Trừ điểm sai | Mọi thao tác điểm đi qua RPC atomic có `request_id`; tra `project_transactions` theo `request_id` trước khi chỉnh tay. |
| `/api/health` trả 503 | Đọc mảng `checks`: mục `config` liệt kê đúng biến đang thiếu. |

## Sản xuất phim ngắn

Chuỗi công đoạn: `premises → selection → draft → review → shots → script_check →
prepare (ảnh + giọng) → video → finish (lồng tiếng) → transcript → render`.
Mỗi công đoạn có lease 90 giây, heartbeat, và `request_id` chống làm hai lần.
Công đoạn `shots` chia nhỏ theo nhóm 4 phân cảnh nên dừng giữa chừng vẫn nối
tiếp được.

Model video mặc định là Seedance 2.0 Fast ($0.20/giây, tối đa 15 giây/cảnh);
Seedance 2.5 dành cho cảnh cần dài hơn hoặc nhiều ảnh tham chiếu hơn.

## Tài liệu khác

- `CLAUDE.md` — quy ước khi sửa repo này.
- `.env.example` — toàn bộ biến môi trường kèm ghi chú.
