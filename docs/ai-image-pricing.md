# Chính sách giá AIDA

Chính sách bán cập nhật ngày 10/09/2026. Giá AI trước làm tròn:

`giá bán VND = giá provider USD × 26.500 × 1,30`

Mọi gói nạp mới dùng **500đ/điểm**. Các gói lần lượt 10.000đ/20 điểm, 50.000đ/100 điểm, 100.000đ/200 điểm, 200.000đ/400 điểm và 500.000đ/1.000 điểm. Không thay đổi số dư, giao dịch hoặc báo giá đã được chấp nhận trước đó.

Số điểm thu là `ceil(giá bán VND / 500)`. Vì làm tròn lên điểm nguyên, số tiền thanh toán có thể cao hơn cost +30%; sai số dưới 500đ cho mỗi lần quy đổi. Phim gồm nhiều task có thể có nhiều lần làm tròn, đặc biệt TTS giá nhỏ. Không quảng cáo mức chênh lệch chính xác 30% sau làm tròn. Cộng 30% vào cost không phải biên lợi nhuận 30%; chưa bao gồm thanh toán, thuế hoặc chi phí hạ tầng chưa được đo/phân bổ.

## Nguồn cost

- Ảnh và TTS Google: catalog `src/lib/ai-pricing.ts`, giá Standard API. Usage thực ghi riêng khi provider trả về; điểm ảnh legacy là giá cố định dự phòng đầu vào, không quyết toán token chính xác.
- Video và model WaveSpeed: Pricing API với đúng model và input, ưu tiên `discounted_price` khi có; báo giá gắn phiên bản và không tự định giá lại job đã nhận.
- Soạn chữ miễn phí cho khách theo chính sách sản phẩm; chi phí này hiện là chi phí vận hành, chưa phân bổ riêng vào từng bộ phim.

| Tác vụ ảnh legacy | Điểm mới | Giá trị |
| --- | ---: | ---: |
| Nhân vật 1K | 5 | 2.500đ |
| Ảnh meme/cảnh 1K, dự phòng 14 refs và 4.000 token | 6 | 3.000đ |
| Background 2K | 8 | 4.000đ |
| Soạn nội dung | 0 | Miễn phí |

Bảng giá động ảnh/TTS/video dùng chung hệ số 1,30 và giá trị điểm. Override quản trị trong `system_settings.point_costs` chỉ áp dụng các tác vụ legacy; phải rà lại khi đổi catalog.

Nguồn đối chiếu: [Google pricing](https://ai.google.dev/gemini-api/docs/pricing), [WaveSpeed Pricing API](https://wavespeed.ai/docs/pricing-api), [OpenAI image pricing](https://developers.openai.com/api/docs/guides/image-generation#calculating-costs).
