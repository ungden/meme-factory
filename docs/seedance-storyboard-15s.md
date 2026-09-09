# Storyboard 15 giây cho phim ngắn

Phim family catalogue mới do AI viết dùng các đoạn video 15 giây, mỗi đoạn chứa nhiều lượt đối đáp/hành động. Bộ chia nhóm giữ thứ tự và nguyên câu/người nói; không chia một câu thành hai clip. Phim có thể gồm 1, 2, 3 hoặc nhiều đoạn tuỳ lượng thoại, không ép số giây thành phẩm bằng cách kéo giãn.

- Planner viết câu chuyện và kiểm tra nội dung trước, sau đó thiết kế panel cho từng nhịp. Nhóm nhịp được xác định trước bước thiết kế để giữ bối cảnh, trục nhìn và bố cục trong đoạn.
- Mỗi đoạn chỉ sinh một ảnh đầu sạch chứa cast của đoạn từ các ảnh chuẩn đã khóa. Panel/beat sau là chỉ dẫn diễn xuất và camera. Không đưa lưới storyboard, chữ hoặc mũi tên vào ảnh đầu.
- Seedance image-to-video nhận `image`, `prompt`, `duration: 15`, `resolution`, `generate_audio: true`. Tỷ lệ lấy từ ảnh đầu (mặc định 16:9). Không gửi `reference_images` của text-to-video sang endpoint này.
- Prompt định danh người nói riêng từng beat, thoại nguyên văn, hành động, camera, nhịp cuối để cắt nối; nhạc vui nhẹ dưới tiếng nói. Native không phải cam kết khóa giọng tuyệt đối.
- Thời gian beat là dự kiến. ASR vẫn chép audio thực; không biến timeline dự kiến thành SRT. Render giữ nguyên đoạn storyboard, không dùng cắt đệm theo một câu để mất phản ứng cuối.
- QA nhận cả storyboard và video; phải kiểm tra từng lượt và đúng người thực sự nói. Quá lớn/không đủ bằng chứng vẫn cần xem lại. Không tự sinh trả phí lại khi QA không đạt.
- Storyboard được lưu trong `video_plan_scenes.storyboard`, vào hash phiên bản và payload task. Đổi storyboard vô hiệu hóa kết quả hiện hành; task/clip cũ vẫn tồn tại. Migration không chuyển nội dung cũ.
- UI chỉnh mỗi lượt riêng; tùy chọn gom kịch bản cũ chỉ cập nhật draft, phải lưu và báo giá mới. Nhánh lồng tiếng một giọng/cảnh chưa áp dụng cho storyboard nhiều người nói.

Nguồn đọc ngày 10/09/2026:
- https://www.seedance.tv/blog/seedance-2-5-storyboard-to-video — hướng dẫn bên thứ ba: panel sạch, continuity, camera/action, ghép các shot. Bài không bắt buộc 15 giây; đây là lựa chọn sản xuất của AIDA theo yêu cầu người dùng.
- https://wavespeed.ai/docs/docs-api/bytedance/bytedance-seedance-2.5-image-to-video — hợp đồng I2V, duration 4–30 giây và hướng dẫn prompt theo nhịp thời gian.

Kiểm chứng: unit/integration kiểm tra nhóm, nguyên câu/ID, cast lạ, timeline lỗi, round-trip, phân phiên bản; SQL transaction chạy rollback, không tạo job media. Chất lượng diễn xuất thực tế của đoạn 15 giây vẫn cần canary có người xem/nghe; test hoặc triển khai không chứng minh chất lượng model.
