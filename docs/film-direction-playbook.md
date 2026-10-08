# Sổ tay đạo diễn hài đời thường

Rút từ 19 video của kênh @쭌이의일상생활 (08/10/2026). Mỗi video được xem
từng cảnh (20–40 khung), đọc lại phụ đề và ghi: nơi quay, trang phục, máy,
hành động, lời, chức năng hài. Ghi chú từng video nằm ngoài repo; đây là phần
luật dùng lại được. Bản đưa vào prompt nằm ở `src/lib/film-camera-language.ts`
(`FORMAT_WRITING_RULES`, `COMEDY_CRAFT_RULES`, `CAMERA_PRESETS`).

## 1. Ba dạng phim

| Dạng | Video | Nhịp | Trang phục |
|---|---|---|---|
| Bé nói với người xem | 12/19 | 8 cảnh × ~7,5 s, mỗi cảnh một nơi, 1–4 câu | đồng phục nhận diện |
| Bé vào bếp | 4/19 | studio phông đen, đổi góc thay vì đổi nơi | đồ đầu bếp |
| Tiểu phẩm / vlog hai vai | 3/19 | cảnh 2–3 s, phần lớn diễn câm | đồ theo vai, tách màu |

## 2. Tiền đề

- Một nỗi khổ người lớn ai cũng gặp, do một em bé nói: lương vừa về đã hết,
  ăn quá no, sáng thứ Hai, "ăn gì cũng được", đầu tư theo hội, giới trẻ bây giờ.
- Hoặc em bé đóng vai bố mẹ/sếp/đàn anh mắng thẳng người xem. Người xem là
  người bị mắng hoặc bị nhờ.
- Hài đến từ chênh lệch (chuyện người lớn × thân hình và cảm xúc em bé), được
  đẩy lên bằng lặp và leo thang. Không giảng đạo, không chơi chữ.
- Hình trái với lời và để người xem tự phát hiện: nói "trải mỏng" mà đắp cơm
  thành núi; chê người khác chỉ nhìn điện thoại trong khi tay đang cầm điện thoại.

## 3. Cấu trúc 60 giây

1. **0–1 s hook:** câu buộc tội, mệnh lệnh hoặc cái tít, kèm hành vi mạnh (nằm
   vật ra sàn gào, chỉ thẳng vào máy). Có khi hình là hook trước lời.
2. **Mỗi 15 s một nấc:** một luận điểm hoặc một bậc leo thang, hay đếm
   "Một… Hai… Cuối cùng".
3. **Giây 30–40 đổi tông:** tủi thân, ngồi quay lưng, im lặng — rồi bùng lại.
4. **Trước câu chốt:** 2–5 giây im, bé nhìn chằm chằm vào máy.
5. **Kết**, chọn một:
   - mẹo người lớn có thật, có số, làm được ngay, nói sau một câu nhượng bộ;
   - đảo ngược làm lộ tẩy;
   - đổi giọng sang lễ phép ("…được không ạ?");
   - nói với người còn đang xem / mồi bình luận;
   - lặp nguyên văn câu mở để video tự vòng.
   Câu cuối ngắn, nhỏ giọng, mặt lạnh.

## 4. Trang phục

- Một **đồng phục nhận diện** cho lúc bé "nói chuyện thật".
- **Đồ theo vai** cho cả tập khi bé đóng vai: vest đi phỏng vấn, đồ ngủ, mũ đầu
  bếp, đồ thú bông, kính râm + dây chuyền khi làm màu, ria mép dán khi làm sếp.
- Bộ đồ càng dễ thương thì lời càng phải ngược với nó.
- Phụ kiện thêm/bỏ đúng lúc làm cú chốt (tháo kính khi bị lộ).
- Hai vai cùng khung thì tách màu rõ.

Trong AIDA: `story.wardrobe` → lúc lưu kịch bản server vẽ một ảnh toàn thân
mặc bộ đó từ ảnh cận mặt (`src/lib/short-film/wardrobe.ts`).

## 5. Bối cảnh

- Mỗi câu ở đúng nơi chuyện đó xảy ra, và bé đang làm đúng việc mình nói.
- Nơi công cộng nhận ra ngay; ở Việt Nam: chợ, cầu vượt, hẻm, tiệm tạp hoá,
  quán ốc, bãi giữ xe, hành lang chung cư, trạm xe buýt.
- Phần lời khuyên chuyển sang nơi yên tĩnh.
- Ánh sáng theo cảm xúc: ngày khi la hét → hoàng hôn khi tủi thân → đêm khi nói
  thật lòng.
- Toàn cảnh rất xa với em bé tí xíu cho lúc gào bất lực.
- Hài nằm ở đạo cụ thì giữ một nơi, đổi cỡ cảnh.

## 6. Máy quay

Điện thoại của bố mẹ, không phải máy điện ảnh: 0.5x đặt thấp, bé đi thẳng vào
ống kính tới khi mặt méo; fisheye/mắt thần; tay người lớn ở mép khung (micro,
đồ ăn); máy đặt trong tủ lạnh nhìn ra; cận tay bé; góc cao người lớn nhìn
xuống; cận cực sát im lặng ngay trước câu chốt. Người lớn không bao giờ lộ mặt.

## 7. Lời

- Câu 2–8 tiếng, mỗi câu một ý, mỗi câu một dòng phụ đề.
- Câu hỏi tu từ bắt quả tang; trích câu bào chữa rồi đập lại; con số nhỏ cụ thể;
  nhân cách hoá; liệt kê ba vế; lặp với cường độ tăng; câu cửa miệng người lớn;
  phá nhịp bằng "Ủa?".
- Mức xưng hô là trò đùa (nhân viên "dạ… ạ", sếp nói trống).
- Giọng em bé Việt: "hông", "nè", "chớ", "nha"; xưng "tui" với người xem, "con"
  khi xin, "em" khi tán chị.

## 8. Diễn

Biên độ rộng trong 60 giây: gào há miệng sát ống kính, nằm lăn, khoanh tay dạng
chân, chỉ vào máy, quỳ chắp tay, ngồi quay lưng, liếc ngang, khóc oà rồi tắt
ngay. Tỉnh bơ khi ra vẻ chuyên gia; câu chốt luôn mặt lạnh.
