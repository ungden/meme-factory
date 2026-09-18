# Quy ước khi sửa AIDA

## Ngôn ngữ

- Mọi chữ người dùng thấy: tiếng Việt, không thuật ngữ kỹ thuật. Người dùng là
  chủ fanpage, không phải kỹ sư — không "prompt", "storyboard", "Seedance",
  "TTS", "workspace", không UUID.
- Chú thích trong code viết bằng tiếng Việt và giải thích **vì sao**, không mô
  tả lại dòng code. Chú thích chỉ xuất hiện ở chỗ có một quyết định đáng ngạc
  nhiên, một cái bẫy đã mắc, hoặc một ràng buộc bên ngoài.

## Tiền và điểm

- Mọi thay đổi số dư phải đi qua RPC atomic trong `supabase/migrations`, kèm
  `request_id` để gọi hai lần không trừ hai lần. Không `select` rồi `update` từ
  route.
- Hoàn điểm khi thất bại là bắt buộc, và phải chịu được việc tiến trình chết
  giữa chừng (sweeper, không phải `finally` trong request).
- Thêm hoặc sửa RPC tiền thì thêm test SQL tương ứng trong `scripts/tests/*.sql`.

## Database

- Schema chỉ đổi bằng file mới trong `supabase/migrations`, áp bằng
  `supabase db push`. Không bấm SQL trên dashboard: sổ migration sẽ lệch và lần
  push sau chạy lại migration cũ.
- RLS bật cho mọi bảng. Route dùng service role phải tự kiểm quyền.

## Pipeline phim

- Mỗi công đoạn phải nối lại được sau khi dừng: lease, heartbeat, và checkpoint
  đủ để chạy tiếp thay vì làm lại từ đầu (một lần chạy lại tốn tiền thật).
- Khẩu hình: video phải nói đủ câu được yêu cầu, nhưng môi không khớp lời
  **không** được chặn hay bắt tạo lại. Phim AI không cần khớp từng chữ.
- Trước khi đổi pipeline, chạy thật một tập trên Seedance 2.0 Fast và đo điểm,
  thời lượng, kết quả QA. Không suy đoán về ffmpeg — chạy nó.

## Kiểm thử

- `npm test` (vitest) cho `src/**`; `node --test` cho `scripts/**/*.mjs`;
  `npm run test:sql` cho RPC.
- Logic đáng test thì tách ra khỏi route/React thành hàm thuần rồi test hàm đó
  (xem `src/lib/alerts.ts`, `src/lib/health.ts`).
- Sửa xong chạy đủ: `npm run lint`, `npx tsc --noEmit`, `npm test`,
  `npm run build`.

## Giao diện

- Một việc chính mỗi màn hình. Mẫu chuẩn là Studio phim
  (`src/app/(dashboard)/projects/[id]/short-films/_components/`): ý tưởng → AI
  tự làm → chỉ hỏi khi cần → kết quả tải được.
- Dùng token màu `th-*` và component trong `src/components/ui`. Không class màu
  thô, không `alert()`/`confirm()`.
- Kiểm ở 375px trước khi coi là xong.

## Môi trường

- Node 22 (`nvm use`), npm 11 (npm 10 vấp lỗi `edgesOut` với cây phụ thuộc này).
- Thêm biến môi trường mới thì cập nhật `.env.example` và, nếu thiếu nó là hỏng
  một luồng chính, thêm vào `REQUIRED_ENV` trong `src/lib/health.ts`.
