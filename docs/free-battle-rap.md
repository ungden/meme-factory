# Free Battle Rap trong AIDA

Catalogue **Rap đối kháng** nằm ở `/projects/[id]/battle-rap`, trong menu của từng kênh. Người dùng nhập một ý tưởng; tên hai nhân vật cũng đủ. Các tuỳ chọn về nhân vật, người dẫn, người chơi nhạc, sân khấu, chất nhạc và hình ảnh đều có thể bỏ trống để bộ viết tự chọn một lần cho cả bài.

## Luồng làm bài

1. Bộ viết riêng cho rap tạo concept, mâu thuẫn, bốn vai A/B/MC/DJ, sân khấu đông khán giả, các lượt phản đòn và ba trường Suno: Title, Lyrics, Style. Lời được tạo trực tiếp từ các câu đã gắn người nói; nhãn biểu diễn dùng tiếng Anh, lời dùng tiếng Việt hoặc tiếng Anh theo lựa chọn.
2. Adapter nhạc gửi bài ở chế độ custom, đợi hoàn thành rồi chọn biến thể gần thời lượng mong muốn nhất. Worker tải và lưu bản master, đo thời lượng thật bằng ffprobe.
3. Lời có thời gian được lấy theo đúng track đã chọn. Bộ căn lời gán người rap bằng đối chiếu văn bản; khi không đủ căn cứ, bài chờ kiểm tra thay vì tự ước lượng thời gian. Đây không phải nhận diện danh tính giọng hát.
4. Toàn bài được chia thành các đoạn theo giới hạn 15/30 giây của model hiện có trong app. Điểm chia ưu tiên cuối câu gần giới hạn và nằm trên lưới 30 fps. Phần cuối ngắn hơn độ dài tối thiểu của provider được tạo dư rồi cắt.
5. Bộ đạo diễn viết các shot phủ toàn bộ timeline thật, gồm sân khấu, người rap, đối thủ, khán giả, MC và DJ. Cận cảnh người rap không đi qua thời điểm đổi người. Mỗi shot có mô tả tiếng Việt cho giao diện và chỉ dẫn hình ảnh tiếng Anh.
6. Vẽ ảnh nhận diện A/B/MC/DJ, ảnh master sân khấu và ảnh bố cục cho từng đoạn. Các ảnh sau nhận lại ảnh nền tảng làm reference; không tự thiết kế lại khuôn mặt giữa các đoạn.
7. Worker cắt audio excerpt. Các đoạn video dùng cùng sáu ảnh với vai trò cố định. Model 2.5 nhận thêm audio excerpt; 2.0 Fast dùng chỉ dẫn diễn và hình ảnh. Nhạc từ video không được dùng thay master.
8. Worker tải từng clip về kho riêng ngay sau khi hoàn thành, chuẩn hoá hình và bỏ audio. Sau cùng ghép clip, thêm title và lời có tên/màu người rap, ghép master liên tục, kiểm tra video/audio/thời lượng rồi lưu MP4, SRT và JSON nội dung.

Việc dùng tag phân vai và audio reference không bảo đảm đúng giọng hoặc khớp khẩu hình. Chất lượng biểu diễn, giọng và độ sắc của lời cần được xem/nghe ở lần test idea thật. Không có bước tự bắt tạo lại chỉ vì môi lệch từng chữ.

## Cấu hình trước khi chạy thật

Áp migration `supabase/migrations/20261017100759_free_battle_rap_pipeline.sql` theo quy trình migration của repo. Chỉ chạy `supabase db push` sau khi chọn đúng môi trường đích. Build thành công không có nghĩa migration đã được áp.

Web/API cần cấu hình Supabase, Gemini, WaveSpeed và `VIDEO_WORKER_TOKEN` hiện có. `AIDA_PUBLIC_BASE_URL`, hoặc một biến URL công khai sẵn có được dùng thay thế, phải là HTTPS có thể nhận callback. URL callback gắn chữ ký theo từng công đoạn; dữ liệu media trong callback không được tin trực tiếp, server luôn đọc lại kết quả qua API provider.

Worker hiện tại (`npm run video-worker`) đã có vòng xử lý rap. Luồng rap cần worker ở direct mode: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WAVESPEED_API_KEY`, `AIDA_BASE_URL`, `VIDEO_WORKER_TOKEN`. FFmpeg cần libass và font hỗ trợ tiếng Việt; Dockerfile hiện tại đã cài FFmpeg và Noto. Worker chỉ giữ file tạm trong một công đoạn và xoá thư mục tạm khi xong.

Để tự động làm nhạc, đặt thêm:

| Biến | Mục đích |
| --- | --- |
| `SUNO_API_KEY` | Khoá của dịch vụ trung gian SunoAPI, không phải API chính thức của Suno |
| `SUNO_API_BASE_URL` | Mặc định `https://apibox.erweima.ai` |
| `SUNO_MODEL` | Mặc định `V6`, theo hợp đồng adapter đã đọc |
| `SUNO_GENERATION_COST_USD` | Chi phí thật của một request, gồm các biến thể; phải lớn hơn 0 |

Giá nhạc được đổi theo công thức markup/điểm đang dùng trong app. Giá video được hỏi trước mỗi lần gửi mới. Giá ảnh được tính theo model, số ảnh đầu vào và nội dung chỉ dẫn.

Khi thiếu khoá hoặc giá dịch vụ nhạc, bài chờ ở bước thêm nhạc. Giao diện cho sao chép hoặc tải Title/Lyrics/Style để dùng trên Suno, rồi tải audio tối đa 30 MB và SRT lên. Audio được tải trực tiếp vào Storage qua URL upload có chữ ký, không đi qua body lớn của Vercel. SRT có thể thêm sau; nó phải khớp lời thực hát và bao gồm phần MC. Nhạc/SRT chỉ được gắn trong đúng trạng thái chờ và đúng bài, rồi tự chạy tiếp.

## Tiến độ và điểm

`battle_rap_runs` lưu input bất biến, phase, state, mức chi và lease. `battle_rap_steps` lưu từng lần viết, vẽ và gọi provider. Các bảng bật RLS; người dùng chỉ có quyền đọc theo kênh, quyền ghi và RPC điều phối chỉ dành cho service role. Route dùng service role kiểm quyền vào kênh và phiên bản kênh.

Mức chi tối đa được giữ trước bằng RPC cùng giao dịch tạo run. Mỗi công đoạn giữ phần chi phí của nó trước khi gọi provider, không vượt tổng mức chi. Công đoạn đã hoàn thành được dùng lại khi làm tiếp. Thất bại được provider xác nhận giải phóng chi phí công đoạn; xong hoặc dừng bài thì hoàn phần mức chi còn dư bằng mã hoàn duy nhất. Có thể tăng mức chi khi bài chạm giới hạn.

Một lần gửi chưa rõ đã đến provider hay chưa chuyển sang chờ đối chiếu, không tự gửi lại. Callback có chữ ký có thể khôi phục mã theo dõi và cho chạy tiếp. Ảnh đã upload nhưng chưa ghi kết quả có thể được nhận lại khi bấm làm tiếp. Công đoạn văn bản không tính điểm có thể thử lại sau khi worker chết. Những lần gửi có trả tiền chưa xác nhận được vẫn được giữ để đối chiếu, không đổi thành lần gửi mới.

Heartbeat gia hạn lease; mọi checkpoint quan trọng kiểm chủ lease. Vòng quét ở worker và refund sweeper đóng việc quá 24 giờ không tiến triển hoặc đã mất quyền vào kênh, đồng thời hoàn phần chưa thực hiện. Tệp đã có kết quả được giữ trong state để tiếp tục sau lỗi; phần đã làm xong vẫn tính điểm. Việc không còn kết quả sau thời hạn đối chiếu không giữ phí công đoạn chưa hoàn thành.

## Kiểm tra trước lần test idea

```sh
npm run test:battle-rap
npm run lint
npx tsc --noEmit
npm test
npm run test:node
npm run build
```

`test:battle-rap` chạy các kiểm thử hợp đồng, adapter, điều phối có provider giả, PostgreSQL trong bộ nhớ và FFmpeg thật với tín hiệu media tổng hợp. PGlite chỉ là dependency kiểm thử, không thay thế Supabase của app và không tạo container hay stack mới. Kiểm thử PostgreSQL chạy migration mới cùng các RPC ví thực tế của repo và kiểm tra RLS, trừ/hoàn điểm, tính lặp an toàn, lease, mức chi và giữ checkpoint.

`npm run test:sql` chạy thêm trên database kiểm thử đầy đủ khi có `SUPABASE_DB_URL`; thiếu biến thì runner hiện tại bỏ qua. Không dùng chuỗi kết nối production để chạy bộ SQL.

Giao diện đã được thử ở 375px bằng API giả: nhập idea, chọn chất lượng, ghi đè MC, nhận bộ chữ cho Suno, tải phần chữ và modal thiếu điểm. Các kiểm tra này chưa gọi tạo nhạc, ảnh hoặc video thật. Migration, cấu hình provider và lần chạy có trả tiền là các bước riêng trước khi xác nhận cả luồng hoạt động trong môi trường triển khai.

Hợp đồng adapter nhạc tham khảo: [Generate Music](https://docs.sunoapi.org/suno-api/generate-music), [Generation Details](https://docs.sunoapi.org/suno-api/get-music-generation-details), [Timestamped Lyrics](https://docs.sunoapi.org/suno-api/get-timestamped-lyrics). Khả năng 15/30 giây của video dùng cấu hình hiện tại trong `src/lib/video-models.ts`; lần test thật sẽ kiểm chứng endpoint đang chạy.
