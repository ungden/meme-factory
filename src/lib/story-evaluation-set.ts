import type { StoryGenre } from "./family-catalogue";
import type { SocialDomain } from "./family-development";

/**
 * Fixed, source-blind benchmark inputs. These are briefs, not golden scripts:
 * acceptance must be recorded by a human reviewer after seeing anonymous
 * outputs from the old and new contracts.
 */
export type StoryEvaluationBrief = {
  id: string;
  genre: StoryGenre;
  domain: SocialDomain;
  brief: string;
  mustKeep: string[];
  rejectIf: string[];
};

export const STORY_EVALUATION_SET: readonly StoryEvaluationBrief[] = [
  { id: "comedy-work-easy", genre: "comedy", domain: "parents_workplace", brief: "Mẹ kể đồng nghiệp nói việc của mẹ dễ, ai làm cũng được, nhưng lần nào cũng nhờ đúng mẹ xử lý.", mustKeep: ["câu ai làm cũng được", "việc vẫn được nhờ đúng người", "câu đáp bám mâu thuẫn ấy"], rejectIf: ["trẻ tự biết chuyện chưa được kể", "chỉ chửi đồng nghiệp"] },
  { id: "comedy-queue-hurry", genre: "comedy", domain: "public_space", brief: "Bố hỏi cách đáp một người lạ xin chen hàng vì họ đang vội trong khi mọi người đều chờ.", mustKeep: ["lý do đang vội", "những người khác cũng đang chờ", "một cách giữ ranh giới dùng được"], rejectIf: ["câu mạng đi dạo", "miệt thị người lạ"] },
  { id: "comedy-teacher-feedback", genre: "comedy", domain: "school", brief: "Mẹ kể một cô giáo góp ý bạn nhỏ trước cả lớp rồi nói làm vậy chỉ vì muốn tốt cho bạn.", mustKeep: ["góp ý trước lớp", "lý do muốn tốt", "cách đáp giữ lễ và chỉ ra chuyện làm bạn mất mặt"], rejectIf: ["bịa rằng bạn khóc vì đau", "trẻ lên lớp cô giáo"] },
  { id: "comedy-shop-return", genre: "comedy", domain: "service_commerce", brief: "Cô bán hàng lúc bán nói món đồ rất bền, lúc khách quay lại lại bảo tại khách dùng nhiều nên hỏng.", mustKeep: ["hai lời nói của cùng người bán", "món đồ đã hỏng", "câu hỏi làm lộ tiêu chuẩn đổi theo lúc"], rejectIf: ["tự thêm bằng chứng không có", "chửi người bán"] },
  { id: "comedy-neighbor-advice", genre: "comedy", domain: "neighborhood", brief: "Hàng xóm liên tục bảo con nhà người ta phải học thêm nhưng khi được hỏi nhờ kèm lại nói mình bận.", mustKeep: ["lời khuyên học thêm", "người khuyên từ chối góp công", "câu đáp không hạ nhục"], rejectIf: ["cãi về điểm số chưa biết", "kết giảng đạo"] },
  { id: "comedy-bus-ticket", genre: "comedy", domain: "family_home", brief: "Hai bé chơi xe buýt bằng ghế nhựa, hành khách duy nhất là bố đang muốn ngồi nghỉ.", mustKeep: ["ghế nhựa", "bố là hành khách", "tương tác đúng format xe buýt"], rejectIf: ["lời thoại người lớn", "bỏ mất bố"] },
  { id: "comedy-laundry-flag", genre: "comedy", domain: "family_home", brief: "Gió thổi bay chiếc tất, hai bé biến việc nhặt tất thành lễ trao cờ.", mustKeep: ["chiếc tất", "gió", "nghi thức do nhân vật tạo ra"], rejectIf: ["cắt trước khi có phản ứng", "đạo đức hóa"] },
  { id: "comedy-noodle-shop", genre: "comedy", domain: "relatives_friends", brief: "Chị mở quán mì bằng nồi đồ chơi cho một người bạn, em gọi món rồi đổi ý liên tục để giữ thể diện.", mustKeep: ["nồi đồ chơi", "em đổi ý", "chị đáp theo tính cách"], rejectIf: ["bài học", "mặc định chị thắng em thua"] },
  { id: "comedy-remote-control", genre: "comedy", domain: "family_home", brief: "Cả nhà tìm điều khiển TV, em dùng điều khiển đồ chơi để ra lệnh cho người thật.", mustKeep: ["điều khiển đồ chơi", "người thật phản ứng", "điểm dừng rõ"], rejectIf: ["khấu hao hoặc tài sản", "không có hành động"] },
  { id: "comedy-sleepy-guard", genre: "comedy", domain: "family_home", brief: "Chị nhờ em canh bánh, em ngủ gật nhưng vẫn nghĩ mình hoàn thành xuất sắc.", mustKeep: ["em ngủ gật", "dấu vết bánh", "lời biện hộ theo tính cách"], rejectIf: ["người kể tự khen hài", "kết thêm câu thừa"] },
  { id: "emotion-sand-eye", genre: "emotion", domain: "family_home", brief: "Ở biển, bố cõng con; bố nhớ ngày xưa ông cõng mình, nói cát bay vào mắt; con thổi cho bố.", mustKeep: ["bố cõng con", "hồi tưởng rõ là hồi tưởng", "cát bay vào mắt do bố nói", "con thổi cho bố"], rejectIf: ["đổi bố hoặc con thành người nói khác", "joke hoặc đảo vai ép buộc"] },
  { id: "emotion-small-sandal", genre: "emotion", domain: "family_home", brief: "Mẹ dọn tủ thấy chiếc dép cũ, con nhận ra đó là dép mình khi mới biết đi rồi tự mang cho mẹ đôi dép mới.", mustKeep: ["chiếc dép cũ", "con nhìn thấy và nhận ra", "hành động mang dép"], rejectIf: ["chỉ nói là xúc động", "hồi tưởng không có nguyên nhân"] },
  { id: "emotion-raincoat", genre: "emotion", domain: "public_space", brief: "Bố đưa áo mưa cho con rồi ướt; con thấy chiếc áo cũ của bố vá nhiều chỗ và che lại cho bố.", mustKeep: ["áo mưa cũ vá", "con thấy chi tiết trước khi đổi hành động", "che cho bố"], rejectIf: ["đạo lý nói thẳng", "câu chốt hài"] },
  { id: "emotion-drawing-wall", genre: "emotion", domain: "family_home", brief: "Chị định xóa hình vẽ nguệch ngoạc, em chỉ ra một nét vẽ của bà đã mất; chị để lại và vẽ cạnh nó.", mustKeep: ["nét vẽ của bà", "em chỉ ra", "chị đổi hành động"], rejectIf: ["khóc không có khoảnh khắc nhận ra", "thêm trò đùa"] },
  { id: "emotion-lunchbox", genre: "emotion", domain: "school", brief: "Con thấy bố để phần trứng cuối trong hộp cơm cho mình, tối con tự để lại miếng trái cây bố thích.", mustKeep: ["phần trứng", "con nhìn thấy", "trái cây cho bố"], rejectIf: ["thuyết minh cảm xúc", "kết giảng bài"] },
  { id: "emotion-broken-kite", genre: "emotion", domain: "family_home", brief: "Em làm rách diều của chị, thấy chị lặng lẽ giữ mẩu giấy bố viết khi làm diều, rồi cùng vá lại.", mustKeep: ["mẩu giấy của bố", "chị lặng đi", "cùng vá"], rejectIf: ["tha thứ vô cớ", "đổ lỗi"] },
  { id: "emotion-grandpa-radio", genre: "emotion", domain: "family_home", brief: "Ông nghe radio cũ, cháu thấy ông xoay núm rất chậm và hỏi; cháu tìm đúng bài hát rồi ngồi nghe cùng.", mustKeep: ["radio", "hành động xoay núm", "cháu chủ động ngồi lại"], rejectIf: ["mơ hồ ai nhận ra gì", "dissolve để che chuyển cảnh"] },
  { id: "emotion-first-bike", genre: "emotion", domain: "public_space", brief: "Mẹ giữ yên xe khi con tập đạp; con nhìn bàn tay mẹ trầy xước rồi nắm lại khi đã tự chạy được.", mustKeep: ["mẹ giữ xe", "bàn tay trầy", "con nắm tay mẹ"], rejectIf: ["thành tích là toàn bộ cảm xúc", "độc thoại dài"] },
  { id: "emotion-night-light", genre: "emotion", domain: "family_home", brief: "Con sợ tối, bố bật chiếc đèn ngủ cũ và kể nó từng ở cạnh bố lúc bé; con tự bật đèn cho em hôm sau.", mustKeep: ["đèn ngủ cũ", "chi tiết tuổi thơ bố", "con làm lại cho em"], rejectIf: ["nhảy qua hành động thay đổi", "cú lật hài"] },
  { id: "emotion-empty-chair", genre: "emotion", domain: "family_home", brief: "Cả nhà dọn bàn, một ghế trống của bà còn khăn tay; bé đặt hoa lên ghế rồi ngồi sát mẹ hơn.", mustKeep: ["ghế trống", "khăn tay", "hoa và ngồi sát mẹ"], rejectIf: ["nói bà mất mà không có chi tiết nhìn thấy", "bi lụy quá mức"] },
] as const;

export function evaluationBriefsFor(genre: StoryGenre) {
  return STORY_EVALUATION_SET.filter((brief) => brief.genre === genre);
}
