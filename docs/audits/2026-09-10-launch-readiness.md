# AIDA — audit phát hành ngày 10/09/2026

**Kết luận: chưa nên mở bán đại trà lời hứa “một nút tự ra phim mỗi ngày”.** Đã triển khai giá mới và sửa các lỗi bảo vệ tiền/điểm, đường tải media và hiển thị thư viện. Bản phim 16:9 đã sửa giọng phát được trên production, nhưng pipeline tự động mới chưa có lượt hoàn tất đủ để chứng minh vận hành cho khách hàng.

Phạm vi thực kiểm: source, quyền/RPC và dữ liệu Supabase production, deployment Vercel/Railway, trình duyệt đăng nhập tại aida.vn, kiểm thử tự động và FFmpeg fixture. Không sinh thêm media trả phí, không chuyển tiền ngân hàng, không bật lịch hoặc thay ngân sách của người dùng trong audit.

## Giá bán đã áp dụng

Quyết định người dùng: thống nhất giá trị điểm giữa các gói, giữ số dư và giao dịch cũ.

- Mọi gói mới: **1 điểm = 500đ**.
- Giá AI: **cost USD × tỷ giá cấu hình 26.500 × 1,30**, sau đó làm tròn lên điểm nguyên.
- Gói: 20/100/200/400/1.000 điểm tương ứng 10.000/50.000/100.000/200.000/500.000đ. Bỏ ưu đãi khiến giá trị điểm khác nhau giữa gói.
- Ảnh nhân vật 5 điểm; meme 6 điểm; background 8 điểm. Đây là giá cố định theo cấu hình chi phí dự phòng, không phải quyết toán token thực của từng ảnh.
- Giá video và các bước phim lấy báo giá theo cấu hình qua lớp giá dùng chung; không đổi model, độ phân giải hoặc chất lượng.
- Gói trên tab cũ phải khớp giá và số điểm server trước khi mua; không khớp trả 409 và yêu cầu xem lại bảng giá.

**Giới hạn cần nói đúng:** +30% là hệ số trước làm tròn, không phải mọi giao dịch đều đúng 30% tiền mặt. Các bước TTS nhỏ vẫn tối thiểu một điểm; phần chênh sau làm tròn có thể lớn. “Cost” hiện là chi phí AI theo adapter/bảng giá, chưa phân bổ Railway, storage, thanh toán hoặc thuế. Không tuyên bố đã đạt lợi nhuận ròng 30%.

Nguồn đối chiếu giá: [Google API pricing](https://ai.google.dev/gemini-api/docs/pricing), [WaveSpeed Pricing API](https://wavespeed.ai/docs/pricing-api). Chính sách chi tiết ở [ai-image-pricing.md](/Users/alexle/Documents/memefactory/docs/ai-image-pricing.md).

## Các lỗi nghiêm trọng đã sửa

| Phát hiện có bằng chứng | Sửa và kiểm tra |
|---|---|
| RPC cộng/hoàn điểm, mua điểm, xác nhận nạp cho phép anon/authenticated gọi trực tiếp; các hàm nhận tham số người dùng/số tiền mà không tự xác thực caller | Thu hồi quyền client ở mọi overload, chỉ service_role được gọi; chuyển SECURITY INVOKER. Đọc lại catalog xác nhận quyền; gọi HTTP RPC bằng anon key trả 401/42501. |
| Webhook tìm được mã đơn là cộng tiền, chưa đối chiếu số tiền thực nhận; thiếu khóa sự kiện ngân hàng | Kiểm tra chữ ký API key, chiều tiền vào, số tiền nguyên, ngân hàng nhận, một mã đơn duy nhất. RPC mới khóa sự kiện + đơn, nhận tiền và ghi receipt trong cùng giao dịch; sự kiện lặp không cộng lần hai. Không đoán đơn từ VA + số tiền. |
| Bản ghi output do thành viên sửa được có thể trỏ media_url sang dự án khác, trong khi endpoint dùng admin để ký URL | Kiểm tra namespace project của media và poster, từ chối đường dẫn traversal/URL không hợp lệ; redirect riêng tư no-store. Test cả file và poster khác dự án đều bị từ chối trước khi ký. |
| Thư viện ép video 16:9 vào khung 9:16, dùng path poster như URL công khai, tải metadata tất cả video; đếm “0 đầu ra” dù có phim | Dùng tỷ lệ thực được lưu, cấp poster qua endpoint riêng tư, preload=none, hiển thị số ảnh/video riêng. Xác minh live: phim đúng 1280×720, phát/tua được; ba video còn lại chưa tải metadata khi chỉ phát một phim. |

Migration production: `20260909200627_launch_billing_guard_and_markup_30`. Commit ứng dụng: `28b71e5`; test bổ sung media: `44dadf2`. Không có bằng chứng trong audit để kết luận các lỗ hổng cũ từng bị khai thác hay chưa.

## Hành trình đã kiểm tra

1. **Trang chủ — dùng được, thông điệp chưa hoàn toàn khớp sản phẩm.** Phiên đăng nhập nhận đúng “Mở Studio”; chưa có lối vào phim ngắn rõ như ảnh/video. Copy vẫn nhắc clip/nhiều cảnh. Chưa đo lại chuyển tài khoản hoặc phiên hết hạn.
2. **Danh sách dự án — dùng được, trạng thái thiết lập sai.** Bánh Bao & Đậu Đỏ có 5 nhân vật/4 đầu ra nhưng ảnh bìa vẫn bảo thiết lập nhân vật để bắt đầu. Nhấn mở đưa vào tool ảnh; phim cần thêm thao tác menu.
3. **Tạo ảnh — mở form được, cần gọn thêm.** Form và preview tách hai cột; dropzone và danh sách nhân vật đẩy thao tác chính xuống dưới. Chưa chạy ảnh tính phí trong audit.
4. **Tạo video một clip — mở độc lập được.** Có nhân vật, thông số và lồng tiếng Gemini; chưa chạy clip trả phí để xác minh phiên bản mới từ đầu đến cuối.
5. **Tạo phim ngắn — chưa qua cổng phát hành.** Chọn kịch bản đã lưu → refresh giữ đúng bản; quay về Tập mới giữ ý tưởng cũ. Tuy nhiên lượt hiện tại vẫn needs_review, UI hiển thị mã phase tiếng Anh và mẫu giọng thay vì ưu tiên thành phẩm. Chưa chứng minh một nút đi hết pipeline lồng tiếng mới.
6. **Thư viện — phần phát/xem được sửa và xác minh.** Có bốn phim thật; bản sửa Charon 28,9 giây, 1280×720 phát/tua không báo lỗi. Poster hiện đúng, tải metadata khi người dùng phát. Bộ sưu tập/bộ lọc vẫn chủ yếu theo ảnh; chưa thống nhất một danh sách ảnh/video có cursor.
7. **Ví và thanh toán — giá mới đúng, bảo vệ server đã kiểm thử.** Gói đồng nhất 500đ/điểm; số dư cá nhân 3.000đ/430 điểm và ví dự án 29.425 điểm vẫn giữ. Chưa có giao dịch ngân hàng thật chạy qua webhook mới; chưa chứng minh quy trình hỗ trợ khoản chuyển lệch tiền trên UI quản trị.

![1 — Trang chủ](/tmp/aida-launch-audit-20260910/01-home.png)
![2 — Danh sách dự án](/tmp/aida-launch-audit-20260910/02-projects.png)
![3 — Tool ảnh](/tmp/aida-launch-audit-20260910/03-image.png)
![4 — Clip đơn](/tmp/aida-launch-audit-20260910/04-video.png)
![5 — Màn phim còn trạng thái chặn](/tmp/aida-launch-audit-20260910/05-short-films.png)
![6 — Thư viện sau sửa](/tmp/aida-launch-audit-20260910/11-gallery-fixed.png)
![7 — Bảng giá mới](/tmp/aida-launch-audit-20260910/09-wallet-new-prices.png)

## Việc vẫn chặn mở bán phim tự động

| Mức | Việc còn lại | Bằng chứng và tiêu chí đóng |
|---|---|---|
| P1 | Duyệt thành phẩm phải kết thúc đúng lượt sản xuất | API approve chỉ chèn review và cập nhật output, không cập nhật production run; database không có trigger đóng run. Unique index vẫn giữ slot dự án với needs_review. Cần giao dịch duyệt đúng phiên bản + đóng run, rồi tạo lượt kế tiếp được. Không chỉ đổi status thủ công để gọi là sửa xong. |
| P1 | Tiếp tục khi nâng ngân sách chưa thực hiện đủ | PATCH production run kiểm tra maxPointsPerFilm/maxPointsPerDay nhưng không chuyển chúng vào control RPC. Cần chính sách chủ dự án, cập nhật nguyên tử và test vượt trần/ngày/giữ điểm. |
| P1 | Chưa có canary đầy đủ của pipeline lồng tiếng mới | Production chỉ có một run cancelled và một needs_review; không có completed. Bản thành phẩm hiện có đã qua xử lý bổ sung. Cần ít nhất một lượt mới tự đi hết script → hình → video → giọng → sub → render → lưu/duyệt, rồi thử restart trước khi mở rộng. Ba đầu vào và lịch ba ngày vẫn là tiêu chí đầy đủ đã chốt. |
| P1 | Cảnh nối hành động chưa tự chạy | production.ts vẫn chặn follows_previous bằng AUTO_CONTINUOUS_SCENE_NEEDS_REVIEW. Cần hoàn thiện dependency/khung cuối hoặc giới hạn chức năng rõ trên UI. |
| P1 | Chưa kiểm chứng thanh toán ngân hàng thật và retry mua gói | SQL đã chứng minh nhận tiền đúng/lặp không trùng. Chưa gửi tiền thật qua SePay mới; API mua gói vẫn chưa có idempotency cho retry sau mất response. Phải đóng phần này trước mở thanh toán rộng. |
| P2 | UX và nội dung trước bán | Đưa phim cuối lên đầu màn, Việt hóa phase, readiness/budget rõ; sửa trạng thái cover; thống nhất thư viện và bộ lọc. Rà terms/privacy đang mô tả sản phẩm ảnh cũ và lời hứa tự hoàn điểm cho phù hợp cơ chế đối soát, không tự thay chính sách pháp lý trong audit. |

Điểm source: [approve](/Users/alexle/Documents/memefactory/src/app/api/content-outputs/[id]/approve/route.ts:13), [resume budget](/Users/alexle/Documents/memefactory/src/app/api/projects/[id]/production-runs/[runId]/route.ts:58), [continuous scenes](/Users/alexle/Documents/memefactory/src/lib/short-film/production.ts:370).

## Kiểm thử và giới hạn bằng chứng

- 270 unit/integration test trong 32 file pass, gồm test endpoint ký media. TypeScript, lint và build web pass. Docker Railway build/deploy được xác minh bên dưới.
- FFmpeg fixture: 3 test dubbing, 4 test edit-range pass; fixture ghép 1080×1920, clip có/không audio, AAC và phụ đề tiếng Việt pass. Đây không phải kiểm chứng chất lượng video sinh mới.
- Test Postgres thật trong BEGIN/ROLLBACK: thiếu tiền, sai bank, duplicate event, dùng event cho đơn khác, rejected order; kiểm tra quyền client. Lượt test riêng với role service_role xác nhận quyền mới vẫn nhận tiền đúng và xử lý lặp. Không lưu user/test order hoặc thay số dư thật.
- RLS: tài khoản không thuộc dự án không đọc được output/run được kiểm tra; HTTP chưa đăng nhập tới media, mua điểm, nạp tiền và webhook đều 401. Webhook có API key đúng nhưng không khớp đơn trả matched=false, không cộng tiền.
- Responsive: kiểm tra không tràn ngang ở phim 390/768/1024, gallery 1440 và 1280×720; ví 390 dark mode. Đã trả viewport/theme ban đầu. Đây chưa phải toàn bộ ma trận mọi trang/hai theme/zoom 200%, chưa chứng nhận WCAG.
- Chưa đo Lighthouse/CWV, p75 form-ready, queue latency hoặc profile tải 1.000 media. Không suy hiệu năng từ build pass.
- Supabase `content-media` vẫn riêng tư, 1.073.741.824 byte/file. Không lặp upload >100 MiB hoặc cắt kết nối Railway trong audit này.

## Triển khai và vận hành

- Web: `https://meme-factory-f9a3le6c3-tduong297-gmailcoms-projects.vercel.app`, alias `https://aida.vn`, build hoàn tất; kiểm tra bảng giá/poster/phát video trực tiếp sau deploy.
- Railway: service `aida-video-worker`, deployment `bc3eb4dc-7775-44f4-84ae-8acf158aff9c`. Readback xác nhận SUCCESS; deployment trước đã được thay thế.
- Worker dùng Next listener cục bộ trong Railway; không nên mô tả là đang gọi Vercel để điều phối. Kiểm tra liveness hiện mới chứng minh listener trả HTTP; chưa là readiness cho DB/provider.
- Database hiện có 0 cấu hình lịch; lịch tự động không được bật trong audit. Chưa nên quảng bá “mỗi ngày tự ra phim” hoặc “luôn cố định giọng/mặt” trước các canary tương ứng.

Bước kế tiếp có giá trị nhất: sửa giao dịch duyệt/đóng lượt và ngân sách resume, thêm idempotency mua gói; sau đó chạy một phim canary qua đúng giao diện sản phẩm với ngân sách được duyệt, đối soát từng job/điểm/artifact. Không cần sinh lại các video cũ để kiểm tra giá hoặc thư viện.
