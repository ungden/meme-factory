import { describe, expect, it } from "vitest";
import { PERFORMANCE_LANES, lintPerformanceDirection } from "./performance-direction";

describe("performance direction Vietnamese actions", () => {
  it("allows a cinematic emotional performance lane", () => {
    expect(PERFORMANCE_LANES).toContain("cinematic_emotion");
  });

  it("recognizes concrete verbs that end with Vietnamese diacritics", () => {
    const issues = lintPerformanceDirection({
      version: 1,
      lane: "deadpan_reversal",
      comicObjective: "Đứa trẻ bẻ tình huống bằng một quan sát đơn giản.",
      statusBefore: "Mẹ đang giữ quyền chủ động.",
      statusAfter: "Đậu Đỏ giành quyền giải thích.",
      hook: "Đậu Đỏ gỡ tay Mẹ và chỉ vào hai túi dù.",
      beats: [
        {
          physicalAction: "Đậu Đỏ gỡ tay Mẹ.",
          expressionChange: "Mặt chuyển sang tỉnh bơ.",
          gesture: "Giơ hai ngón tay.",
          reactionTarget: "Mẹ nhìn theo ngón tay con.",
          cameraMove: "Rack focus sang túi dù.",
        },
        {
          physicalAction: "Mẹ buông vai và lau nước mắt.",
          expressionChange: "Nét bi thương tắt ngay.",
          gesture: "Hất cằm về cửa.",
          reactionTarget: "Đậu Đỏ nhìn Mẹ chờ câu chốt.",
          cameraMove: "Push-in ngắn.",
        },
      ],
      revealOrCut: "Hard cut ngay sau câu chốt.",
    });
    expect(issues).toEqual([]);
  });

  // Lượt chạy thật từng bị chặn vì "vươn" không có trong danh sách động từ.
  it("counts a body part in motion as a physical action but not a feeling", () => {
    const direction = {
      version: 1 as const,
      lane: "cinematic_emotion" as const,
      comicObjective: "Đậu Đỏ hứa sẽ cõng lại Bố.",
      statusBefore: "Bố đang giấu nước mắt.",
      statusAfter: "Con chủ động dỗ Bố.",
      hook: "Đậu Đỏ ngẩng đầu nhìn Bố.",
      beats: [
        { physicalAction: "Đậu Đỏ ngẩng đầu và nhìn thẳng vào mắt Bố.", expressionChange: "Mắt mở to.", gesture: "Tay buông xuôi.", reactionTarget: "Bố", cameraMove: "Máy đứng yên." },
        { physicalAction: "Đậu Đỏ vươn hai tay về phía trước hướng lên Bố.", expressionChange: "Cười tươi.", gesture: "Kiễng chân.", reactionTarget: "Bố", cameraMove: "Push-in ngắn." },
      ],
      revealOrCut: "Hard cut khi Bố bế con lên.",
    };
    expect(lintPerformanceDirection(direction)).toEqual([]);
    expect(
      lintPerformanceDirection({ ...direction, hook: "Lời hứa ngây ngô nhưng chứa đựng tình cảm to lớn." }).map((issue) => issue.field),
    ).toEqual(["hook"]);
  });

  it("accepts short cast names as reaction targets and everyday gestures as actions", () => {
    const issues = lintPerformanceDirection({
      version: 1,
      lane: "cinematic_emotion",
      comicObjective: "Đứa trẻ nhường phần bánh cho Mẹ.",
      statusBefore: "Mẹ định chia bánh cho con.",
      statusAfter: "Con từ chối như người lớn.",
      hook: "Đậu Đỏ đẩy đĩa bánh về phía Mẹ.",
      beats: [
        {
          physicalAction: "Xua tay",
          expressionChange: "Mím môi kiên quyết.",
          gesture: "Lắc đầu nhẹ",
          reactionTarget: "Mẹ",
          cameraMove: "Máy đứng yên.",
        },
        {
          physicalAction: "Lắc đầu nhẹ",
          expressionChange: "Mắt nhìn xuống.",
          gesture: "Tay đặt lên bàn.",
          reactionTarget: "Bố",
          cameraMove: "Push-in ngắn.",
        },
      ],
      revealOrCut: "Hard cut khi Mẹ khựng lại.",
    });
    expect(issues).toEqual([]);
  });
});
