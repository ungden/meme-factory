# Kênh tự vận hành

AIDA là nơi cung cấp media bằng AI cho các kênh. Mỗi project là một kênh
(fanpage) xoay quanh một nhóm nhân vật cố định. Kênh được thiết lập một lần, rồi
ra phim ngắn và meme theo hai cách: bấm làm từng cái, hoặc để tự sản xuất theo
lịch. Ở cả hai cách, AI tự quyết mặc định; người dùng chỉ chỉnh trong mục
"Tự chọn" nếu muốn.

## Thiết lập kênh (một lần)

| Bước | Ở đâu | Ghi chú |
|---|---|---|
| Hồ sơ kênh | Studio phim, khi chưa có hồ sơ | Gắn mọi nhân vật; look phim tự chọn theo chất liệu nhân vật (người thật → quay điện thoại, 3D → hoạt hình 3D). Lưu lại thì gộp vào hồ sơ cũ, không làm rơi quan hệ, cách nói, tham chiếu. |
| Bộ ảnh chuẩn | "Chuẩn bị nhân vật lên phim" | `POST /api/projects/[id]/film-setup` tạo cận mặt → toàn thân → sau lưng (Gemini), khoá bằng RPC `lock_film_reference_pack`. Ảnh đã tạo được dùng lại khi làm tiếp; có mặt + thân là khoá được. |
| Giọng tự nói | Tự động | Sau tập tự nói đầu tiên, AI lấy đoạn một bé nói liền mạch dài nhất trong clip chỉ có một người nói (mốc từ bản chép lời) làm giọng chuẩn. |

Khâu quay chỉ cần một phiên bản ảnh đã khoá có ảnh chính; bộ ba góc là nâng cấp
được gợi ý chứ không chặn kênh cũ.

## Phim ngắn

- Bấm làm: màn "Tập mới" — ý tưởng (được để trống) + một nút.
- Tự sản xuất: thẻ "Tự làm phim mỗi ngày", 1–6 phim/ngày, nối tiếp nhau
  (`schedule_due_film_automations`).
- Chi tiết đạo diễn: `docs/film-direction-v2.md`, `docs/film-direction-playbook.md`.

## Meme

- Bấm làm: khối "AI làm meme" đầu trang Tạo ảnh. Luồng làm từng bước cũ vẫn ở
  nút "Tự làm từng bước".
- Tự sản xuất: thẻ "Tự làm meme mỗi ngày", 1–10 meme/ngày, từng cái một
  (`schedule_due_meme_automations`).
- Mỗi meme là một lượt `meme_production_runs` chạy hẳn ở server
  (`src/lib/meme-production.ts`): viết chữ (giữ trong checkpoint) → trừ điểm →
  vẽ (cùng hàm `planMemeImage` với trang Tạo ảnh) → lưu vào thư viện kèm caption
  và hashtag. Đóng trình duyệt không mất ảnh.
- Lượt có lease 4 phút; cron mỗi phút (`/api/internal/meme-production/advance`)
  nhận lượt chờ hoặc lượt bỏ dở; hỏng 3 lần thì dừng.

## Tiền

- Mọi ảnh tính điểm qua `spendProjectPoints` (RPC có `request_id`), ghi
  `generation_jobs` ngay sau khi trừ; lỗi thì hoàn ngay (`chargedCharacterImage`,
  `processMemeRun`).
- Tiến trình chết sau khi ghi job: `settle_stale_image_generation_job` hoàn.
- Tiến trình chết giữa lúc trừ và lúc ghi job: `settle_orphan_image_payments`
  hoàn (chỉ khoản ảnh từ 08/10/2026 trở đi). Lượt meme còn tự hoàn khoản dở dang
  của lần thử trước dựa vào `checkpoint.charge`.

## Kiểm thử SQL

CI chưa có database test (`HAS_TEST_DATABASE`). Trước khi đẩy migration, chạy
`npm run test:sql` trên một Postgres tạm (image `public.ecr.aws/supabase/postgres`
có sẵn trên máy, thêm schema `storage` giả, áp toàn bộ migration, một user + một
project mẫu), rồi xoá container.
