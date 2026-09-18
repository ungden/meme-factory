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

`check:migrations` đối chiếu `supabase/migrations` với sổ migration trên
database. Supabase nhớ migration bằng con số timestamp: áp SQL ngoài
`supabase db push` sẽ ghi con số của lúc bấm, và lần push sau chạy lại migration
đó. Ngày 16/09/2026 có 20 migration lệch kiểu này cùng lúc.

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
