# Đạo diễn phim v2 — học từ kênh @쭌이의일상생활

Ngày 08/10/2026. Nguồn: 19 video của kênh Hàn @쭌이의일상생활 (người dùng gửi),
đo bằng ffmpeg (cắt cảnh, cao độ giọng) và xem khung hình từng 2,5 giây.

## 1. Kênh mẫu làm gì

### Định dạng

| Đo được | Giá trị |
|---|---|
| Khung | 1080×1920, 30 fps |
| Thời lượng | 15/19 video dài 60–61 s; 3 video vlog dài 79–102 s |
| Mốc cắt cứng | 60 s = 4 khối × 15 s: cắt ở 15,0 / 30,1 / 44,9 s gần như ở mọi video |
| Trong mỗi khối 15 s | thường 2 cảnh ~7,5 s (cắt ở 7,5 / 22,5 / 37,5 / 52,5 s) |
| Vlog (v01, v03, v05) | cắt mỗi ~2,5 s, 30–45 cảnh |
| Giọng | F0 trung vị 320–470 Hz → giọng trẻ 1–3 tuổi thật, không phải người lớn giả giọng |
| Phụ đề | chữ trắng nhỏ, giữa khung, 1 dòng ngắn; watermark tên kênh ở trên |

Kết luận kỹ thuật: mỗi khối 15 s là **một lần gọi model** (đúng trần 15 s của
Seedance 2.0, hoặc 2.5 đặt 15 s), bên trong model tự cắt 1 lần. Giọng do model
sinh cùng hình (khớp môi, có tiếng môi trường), không lồng sau.

### Ba series

1. **Bé nói với máy (12/19 video)** — một bé trai bụ bẫm ~15 tháng, đầu cạo,
   luôn mặc **một bộ đồng phục nhận diện**: áo varsity đen chữ K trắng, áo thun
   trắng, quần jean rộng, giày boot vàng. Bé độc thoại thẳng vào ống kính về
   chuyện người lớn: tiền lương bay sau 3 ngày, ăn kiêng, cổ phiếu, đi phỏng vấn,
   sáng thứ Hai, "giới trẻ bây giờ", tán "chị gái". Hài đến từ **tương phản**:
   nội dung người lớn × giọng và mặt em bé.
2. **Bé đầu bếp (4/19)** — phông đen, đèn softbox, mũ đầu bếp, dạy nấu món
   thật (tteokbokki, kimbap, thịt nướng, trái cây). Cảnh xen kẽ: toàn thân
   đứng bếp ↔ top-down tay bé làm ↔ cận mặt nếm. Kết: bé cay đỏ mặt, xin sữa.
3. **Vlog hai chị em (3/19)** — du lịch (Jeju, Jeonju, sân golf), ống tele xoá
   phông, nắng chiều, cắt nhanh 2,5 s, ít lời.

### Ngữ pháp máy quay (thứ làm nó "thật")

Không phải máy điện ảnh. Đây là **điện thoại của bố mẹ**:

- **0.5x góc rộng đặt thấp**: máy ngang tầm mắt bé, bé đứng gần ống kính nên
  đầu to, chân nhỏ, hậu cảnh rộng (chợ, ga tàu, hành lang). Chiếm phần lớn
  thời lượng.
- **Dí sát mặt**: bé tiến lại, mặt lấp đầy khung, hơi méo góc rộng — dùng cho
  câu chốt hoặc la hét.
- **POV tay người lớn**: tay đưa micro lông, đưa kem, đổ sốt — người quay là
  nhân vật ẩn.
- **Mắt thần / fisheye** viền tối, **máy đặt trên bàn**, **toàn cảnh xa** bé tí
  giữa bãi đỗ xe, **theo sau lưng**.
- Bối cảnh **đổi mỗi cảnh** (giặt là → chợ → hành lang → cầu vượt → sân
  thượng): mỗi cảnh một nơi thật ở Hàn, ánh sáng có sẵn (đèn huỳnh quang, hoàng
  hôn, đèn đường).
- Hook 0–1 s: bé khóc thét / chỉ thẳng vào máy / nằm vật ra sàn. Kết: cận mặt
  bình tĩnh, nói nhỏ câu chốt.

### Ảnh chuẩn nhân vật

Nhận diện giữ rất chặt suốt 60 s và qua nhiều video: cùng khuôn mặt, cùng đồng
phục (cả hình in sau lưng áo). Họ gần như chắc chắn có bộ ảnh mặt + toàn thân +
sau lưng, ở ánh sáng thật, không phải ảnh catalogue.

## 2. AIDA hiện tại lệch ở đâu

| | Kênh mẫu | AIDA (trước v2) |
|---|---|---|
| Ảnh chuẩn | mặt + thân + sau lưng, ánh sáng thật | **1 ảnh toàn thân**, nền xám studio, dáng đứng nghiêm, mặt nhỏ |
| Look | điện thoại, 0.5x, ánh sáng tại chỗ | "35–50 mm, ánh sáng cửa sổ mềm" — ra chất ảnh dàn dựng |
| Máy quay | menu cố định ~10 kiểu điện thoại | chữ tự do do LLM viết |
| Bối cảnh trong clip | đổi mỗi cảnh | **cấm** đổi trong cùng clip |
| Nhìn camera | bắt buộc (nói với máy) | **cấm** "nhìn camera chờ" |
| Cấu trúc | độc thoại 1 bé, 1–2 câu ngắn/cảnh | đối thoại gia đình 2–4 người, shot–reverse-shot |
| Giọng | model tự sinh, giọng trẻ thật | Gemini TTS giọng người lớn, lồng sau |

## 3. Thiết kế v2

### 3.1 Bộ ảnh chuẩn (photoreal-v2)

Mỗi nhân vật 3 ảnh, gen bằng Codex (gpt-image) từ ảnh v1 để giữ nhận diện, ảnh
sau dùng ảnh mặt vừa gen làm chuẩn:

| File | Vai trò (`referenceRoles`) | Nội dung |
|---|---|---|
| `face.png` | `identity_face` | cận vai, nhìn thẳng ống kính, 4:5 |
| `body.png` | `identity_body` | toàn thân đứng tự nhiên, 9:16 |
| `back.png` | `look` | toàn thân 3/4 sau lưng, thấy tóc gáy và lưng áo |

Look chung: ảnh iPhone do người nhà chụp trong căn hộ Việt, ánh sáng cửa sổ,
da có lỗ chân lông, HDR điện thoại, không retouch. Bỏ bột trên má (đó là trạng
thái theo cảnh, không phải nhận diện) và bỏ hình in hoạt hình trên tạp dề.
Script gen: `artifacts/banh-bao-dau-do/photoreal-v2/gen.sh`.

### 3.2 Ngôn ngữ máy quay có tên (`src/lib/film-camera-language.ts`)

Đạo diễn chọn `cameraPreset` cho từng panel từ menu cố định; server ghép câu
chỉ đạo chuẩn vào đầu `camera`. LLM vẫn viết phần riêng (hướng di chuyển, ai lọt
khung). Lý do: câu chữ tự do cho ra "máy quay điện ảnh" chung chung; một menu
có câu lệnh đã thử ổn định hơn và kiểm được (preset nào thấy chân, preset nào
nhìn ống kính).

### 3.3 Định dạng phim (`filmFormat`)

| Format | Khi nào | Luật chính |
|---|---|---|
| `family_scene` | mặc định cũ | giữ nguyên luật hiện tại |
| `talk_to_camera` | một bé nói với người xem | nhìn thẳng ống kính; mỗi panel ≤2 câu ngắn; được đổi bối cảnh giữa các panel kể cả trong cùng clip; hook 0–1 s; kết cận mặt nói nhỏ |
| `cooking_show` | bé dạy nấu | phông đen softbox; xen kẽ toàn thân / top-down tay / cận mặt nếm |
| `phone_vlog` | đi chơi, nhiều cảnh | cắt nhanh, ít lời, ống tele/xoá phông hoặc 0.5x |

### 3.4 Âm thanh

- **Đường chính: Seedance 2.5 tự nói tiếng Việt** (2.5 hỗ trợ tiếng Việt và
  `reference_audios`). Mỗi nhân vật có một **giọng mẫu** (audio ≤8 s); gửi kèm
  mọi clip để giữ cùng một giọng — lý do native bị tắt hồi 10/09 là giọng đổi
  giữa các clip.
- **Dự phòng: lồng tiếng** như hiện tại. Nếu clip native nói sai/thiếu câu (soát
  bằng Whisper), lồng TTS đè lên chính clip đó, bỏ tiếng gốc — không gen lại
  video. Khẩu hình không khớp không chặn (CLAUDE.md).
- Seedance 2.0 Fast vẫn chỉ đi đường lồng tiếng.

### 3.5 Còn phải đo trước khi bật mặc định

Theo CLAUDE.md, chạy thật một tập trước khi đổi pipeline:

1. 1 tập `talk_to_camera` 60 s (4 clip × 15 s) với Đậu Đỏ trên **Seedance 2.5
   native** + giọng mẫu: đo điểm, thời lượng, tỉ lệ clip nói đúng nguyên văn,
   giọng có giữ qua 4 clip không.
2. Cùng tập trên **2.0 Fast + lồng tiếng** để so giá/chất lượng.
3. Giọng mẫu: thử (a) cắt 6–8 s từ clip native đầu tiên được chủ kênh duyệt,
   (b) giọng trẻ thật có quyền sử dụng.

## 4. Trạng thái (08/10/2026)

Đã làm:

- `src/lib/film-camera-language.ts`: 16 preset máy + `free`, 4 định dạng, luật
  viết theo định dạng, `COMEDY_CRAFT_RULES` (trang phục, bối cảnh, lời, diễn —
  xem `docs/film-direction-playbook.md`), khối LOOK, mục tiêu 60 giây.
- Studio có lựa chọn "Cách quay"; dấu `[AIDA_FORMAT=…]` đi cùng ý tưởng và khoá
  `filmFormat` ở bước viết.
- Người viết chọn `filmFormat` và khai `wardrobe`; đạo diễn storyboard chọn
  `cameraPreset` từng panel; storyboard mang `filmFormat` và `setting` theo
  nhịp; sửa lại một đoạn giữ cả hai.
- Trang phục theo tập: lúc lưu kịch bản, server vẽ ảnh toàn thân mặc bộ đồ từ
  ảnh cận mặt; ảnh này thay ảnh thân/lưng trong cast của tập đó.
- Âm thanh: 2.5 + dự án được bật (`SHORT_FILM_NATIVE_VOICE_PROJECT_IDS` hoặc
  `SHORT_FILM_NATIVE_VOICE_ENABLED`) mặc định tự nói; còn lại lồng tiếng.
  `cast.nativeVoice` tách khỏi `cast.voice` (TTS) để nhánh lồng tiếng không
  nhận nhầm giọng mẫu.
- Giọng mẫu: `POST /api/projects/[id]/voices/native` nhận file tải lên hoặc một
  đoạn trong clip native (task + giây). Worker tự cắt đoạn đó bằng ffmpeg và
  gửi `reference_audios`. Studio có ô "Giọng của các bé" với nút "Dùng giọng
  câu này" trên từng câu đã quay.
- Bộ ảnh chuẩn v2 (12 ảnh) và script cài `scripts/install-family-photoreal-assets.cjs`.

Chưa làm, có chủ đích:

- Tự lồng tiếng thay cho clip native nói sai lời. Chế độ âm thanh đang là của
  cả phim; tách theo từng cảnh đụng máy trạng thái và đường trừ điểm, nên đợi
  lần chạy thật cho biết tỉ lệ sai rồi mới thiết kế. Hiện clip đó dừng ở bước
  kiểm cho người xem.
- Chưa chạy thật tập thử ở mục 3.5.
