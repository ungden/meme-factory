# Xoá metadata của ảnh đầu ra

Cập nhật: 2026-08-07. Mọi ảnh rời khỏi hệ thống đều được gỡ metadata trước, bằng `src/lib/image-metadata.ts`.

## Vì sao

Ảnh do model sinh ra không chỉ có pixel. File còn kèm được cả một "hồ sơ nguồn gốc" nằm ngoài phần ảnh:

- **EXIF / XMP / IPTC** — phần mềm tạo ảnh, thời gian, và với ảnh người dùng upload thì có cả toạ độ GPS, model máy ảnh.
- **C2PA / Content Credentials** — chuẩn provenance ghi rõ ảnh được tạo hoặc chỉnh sửa bằng hệ thống AI nào. Trong PNG nó nằm ở chunk riêng, trong JPEG nằm ở segment JUMBF (APP11).
- **Text chunk** — nhiều tool nhét thẳng prompt gốc vào `tEXt`/`iTXt`.

Với một xưởng meme thì hai vấn đề thực tế là: prompt và quy trình nội bộ bị lộ theo file, và ảnh người dùng upload lên bucket public còn nguyên GPS.

## Cái này KHÔNG làm được gì

Nói thẳng để khỏi kỳ vọng sai: **xoá metadata không đảm bảo Facebook/Instagram thôi gắn nhãn "AI info"**. Meta đọc nhiều tầng tín hiệu, metadata chỉ là một:

1. **Metadata / Content Credentials trong file** — tầng duy nhất mà module này gỡ được.
2. **Watermark ẩn** — SynthID của Google (Gemini, tức model đang dùng ở đây) và watermark của Meta AI được mã hoá vào chính tín hiệu pixel. Nó tồn tại độc lập với metadata, và module này cố tình **không** đụng vào pixel nên không ảnh hưởng gì tới nó.
3. **Classifier phát hiện ảnh AI** — chạy trên nội dung ảnh, không cần metadata.
4. **Người đăng tự khai báo**.

Muốn phá watermark ẩn thì phải re-encode/biến đổi pixel — vừa làm giảm chất lượng ảnh, vừa không chắc ăn, và về bản chất là tìm cách vô hiệu hoá cơ chế minh bạch nguồn gốc nội dung của nền tảng, có thể vi phạm điều khoản của Meta lẫn của chính provider ảnh. Module này dừng ở phạm vi vệ sinh file, không đi theo hướng đó.

## Gỡ những gì

Nguyên tắc: **whitelist** — chỉ giữ lại phần cần để ảnh render đúng, mọi thứ còn lại bỏ.

| Định dạng | Giữ lại | Gỡ đi |
| --- | --- | --- |
| PNG | `IHDR`, `PLTE`, `tRNS`, `IDAT`, `IEND`, và `acTL`/`fcTL`/`fdAT` (APNG) | Toàn bộ chunk còn lại: `tEXt`/`zTXt`/`iTXt`, `eXIf`, `caBX` (C2PA), `iCCP`/`sRGB`/`gAMA`, chunk riêng của từng tool, và mọi byte nhét sau `IEND` |
| JPEG | `APP0` khi là JFIF/JFXX, các segment giải mã (`DQT`, `SOF`, `DHT`, `SOS`, `DRI`) và entropy-coded data | `APP1`–`APP15` (EXIF, XMP, ICC, Photoshop/IPTC, JUMBF/C2PA, MPF), `COM`, và mọi byte sau `EOI` |
| WebP | `VP8`/`VP8L`/`VP8X`/`ALPH`/`ANIM`/`ANMF` | `EXIF`, `XMP `, `ICCP` (kèm tắt cờ tương ứng trong `VP8X` và tính lại kích thước RIFF) |
| Khác | — | Không đụng tới, trả nguyên file |

Hai đặc điểm đáng lưu ý:

- **Không re-encode.** Module chỉ bỏ nguyên khối các chunk/segment metadata rồi ghép lại phần còn lại. Pixel không đổi một bit, chất lượng ảnh không giảm, CRC của chunk giữ lại vẫn đúng. Có test dựng PNG thật rồi giải nén lại để kiểm điều này.
- **Không bao giờ throw.** Gặp file dị dạng hay định dạng lạ thì trả về đúng bytes đầu vào. Thà giữ metadata còn hơn làm hỏng ảnh của người dùng.

Hệ quả của whitelist: color profile (`iCCP`/ICC) cũng bị bỏ, ảnh sẽ được hiểu là sRGB. Đúng với đầu ra của các model đang dùng và đúng với môi trường hiển thị trên social.

## Gỡ ở đâu

Ba chốt chặn, phủ hết mọi đường ảnh ra khỏi hệ thống:

| Vị trí | Chặn được gì |
| --- | --- |
| `src/lib/gemini-image.ts` → `extractImageFromResponse` | Mọi ảnh vừa nhận từ provider (meme, character pose, background). Vì làm ngay tại điểm này nên phần trả về client, nút tải xuống, và ảnh gửi đi lưu đều dùng chung một bản đã sạch. |
| `src/app/api/meme/save/route.ts` | Ảnh ghép từ canvas trên web và ảnh gửi thẳng từ mobile app, ngay trước khi ghi vào bucket `memes`. Đây chính là file public người dùng tải về rồi đăng lên. |
| `src/lib/use-store.ts` → `addPose` | Ảnh nhân vật người dùng chọn từ máy, trước khi upload lên bucket `character-poses` (bucket public — đây là chỗ GPS trong EXIF dễ rò nhất). |

Tải ZIP hàng loạt ở Thư viện lấy file trực tiếp từ storage nên đã sạch sẵn, không cần xử lý thêm.

## Test

`src/lib/image-metadata.test.ts` — chạy bằng `npm test`. Phủ: whitelist từng định dạng, dữ liệu nhét sau `IEND`/`EOI`, byte stuffing `FF 00` trong entropy data của JPEG, cờ `VP8X` và kích thước RIFF của WebP, file hỏng/định dạng lạ, và một round-trip trên PNG thật (CRC đúng, IDAT nén zlib) để chắc chắn ảnh vẫn decode được và pixel bit-identical sau khi gỡ.
