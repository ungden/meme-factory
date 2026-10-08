import { describe, expect, it } from "vitest";
import { buildMemeIdea, memeRetryDelaySeconds, normalizeMemeOptions, pickMemeVariation } from "./meme-autopilot";

describe("meme tự làm", () => {
  it("chỉ nhận tuỳ chọn hợp lệ", () => {
    expect(
      normalizeMemeOptions({
        format: "4:5",
        characterIds: ["11111111-1111-1111-1111-111111111111", "x", 3],
        noCharacters: "yes",
      }),
    ).toEqual({ format: "4:5", characterIds: ["11111111-1111-1111-1111-111111111111"] });
    expect(normalizeMemeOptions({ format: "3:2" })).toEqual({});
    expect(normalizeMemeOptions(null)).toEqual({});
  });

  it("giữ nguyên ý tưởng người dùng; để trống thì dựng đề bài theo kênh và tránh ý vừa đăng", () => {
    expect(buildMemeIdea({ intent: " Than tiền điện ", recentHeadlines: ["x"] })).toBe("Than tiền điện");
    const auto = buildMemeIdea({ intent: "", positioning: "đời văn phòng", recentHeadlines: ["Thứ Hai lại tới"] });
    expect(auto).toContain("đời văn phòng");
    expect(auto).toContain('"Thứ Hai lại tới"');
  });

  it("bỏ phương án trùng chữ với meme gần đây, kể cả khác dấu và hoa thường", () => {
    const picked = pickMemeVariation(
      [{ headline: "Thứ Hai lại tới!" }, { headline: "Lương về ba ngày" }],
      ["thu hai lai toi"],
    );
    expect(picked?.headline).toBe("Lương về ba ngày");
    expect(pickMemeVariation([{ headline: "A" }], ["a"])?.headline).toBe("A");
    expect(pickMemeVariation([{ headline: " " }], [])).toBeNull();
  });

  it("chờ lâu dần giữa các lần thử lại, tối đa 15 phút", () => {
    expect(memeRetryDelaySeconds(1)).toBe(120);
    expect(memeRetryDelaySeconds(20)).toBe(900);
  });
});
