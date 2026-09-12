/** Research-backed direction; timing is a production constraint, not a speed filter. */
export const FILM_MOTION_PROMPT_VERSION = "interaction-2026-09-12";

export const FILM_INTERACTION_POLICY = `ĐẠO DIỄN CHUYỂN ĐỘNG:
- Real-time motion, diễn ở tốc độ sinh hoạt thật. Nhanh nhẹn đến từ hành động có mục đích và phản ứng đúng lúc; không tăng tốc toàn phim, không slow motion trừ khi người dùng yêu cầu.
- Mỗi nhịp chỉ một hành động chính có nhân quả: ai làm gì với ai/vật nào, điểm tiếp xúc, kết quả nhìn thấy. Mắt nhìn mục tiêu trước khi tay chạm; vật đổi tay sau tiếp xúc; trọng lượng, tóc và áo theo chuyển động rồi ổn định. Không thêm đạo cụ để đủ chuyển động.
- Hành động tay/thân người diễn NGAY TRONG câu thoại. Người nghe vẫn làm việc đang làm và phản ứng với một từ/cử chỉ cụ thể của người nói; không đợi nói xong rồi mới quay đầu, nhướng mày và trả lời theo ba công đoạn tách biệt.
- Một chỉ đạo camera chính cho mỗi shot. Máy đứng yên vẫn hợp lệ khi diễn viên có hành động; không thêm dolly/orbit/handheld cho mọi câu. Cắt khi đổi người chủ động, nhìn thấy vật hoặc hoàn tất hành động; giữ trục nhìn, bên trái/phải và vị trí đạo cụ. Không bắt mỗi lượt thoại có một trò hài hoặc cú cắt riêng.
- Phân biệt điểm kết panel với điểm kết phim. revealOrCut ở panel là nối đúng nhịp sau, chỉ kết phim ở điểm đã được duyệt. Nhịp diễn mục tiêu 2–4 giây khi nội dung cho phép, không ép cắt câu dài hay mua clip riêng cho mỗi shot.
- imagePrompt: tư thế sẵn sàng thực hiện hành động, vật ở trong tầm tay, lối đi và vị trí người nghe rõ. Chỉ mô tả người/bối cảnh thực sự có trong kịch bản.
- motionPrompt: 1–2 câu chỉ đạo dễ thực hiện, chỉ rõ hành động chính + phản ứng người nghe diễn đồng thời + camera/điểm nối. Tránh lặp lại toàn bộ mô tả ngoại hình, liệt kê nhiều góc máy hoặc các tính từ chung chung.
- pauseAfterSeconds là nghỉ có lý do sau câu, mặc định 0.15; có thể 0–2 giây cho một hành động/reaction rõ. Không dùng durationSeconds để kéo dài một ánh nhìn hoặc nụ cười. Nhịp thoại cuối được tính lại từ audio thật trước khi gửi video.`;

export const REALTIME_MOTION_DIRECTION = "REAL-TIME MOTION: tốc độ sinh hoạt thật, hành động dứt khoát có đà và điểm dừng. Tay/thân người làm việc trong khi nói; người nghe phản ứng ngay với người hoặc đạo cụ đang tác động. Chuyển động mắt dẫn hướng tay; tiếp xúc rồi mới trao vật, trọng lượng và vải theo đà. Không đứng chờ lần lượt, không kéo một cử chỉ suốt câu, không slow motion hoặc speed ramp tự phát.";
