import { describe, expect, it } from "vitest";
import {
  normalizeFamilyFatherTerms,
  normalizeFamilyFatherText,
} from "./family-terminology";

describe("family father terminology", () => {
  it("uses Bố for clear references to the father", () => {
    expect(
      normalizeFamilyFatherText(
        "Ba ơi, ba dậy chở tụi con đi học. Mẹ gọi ba nhưng ba vẫn ngủ.",
      ),
    ).toBe("Bố ơi, bố dậy chở tụi con đi học. Mẹ gọi bố nhưng bố vẫn ngủ.");
    expect(normalizeFamilyFatherText("Ba mẹ vẫn đang ngủ.")).toBe(
      "Bố mẹ vẫn đang ngủ.",
    );
  });

  it("keeps the number three and words that merely contain ba", () => {
    const text =
      "Ba cảnh đầu có ba người, bố đếm ba rồi giơ ba ngón tay; Bánh Bao đeo ba lô.";
    expect(normalizeFamilyFatherText(text)).toBe(text);
  });

  it("normalizes nested story and storyboard fields without changing ids", () => {
    const value = {
      id: "099b7b3d-ba00-4a64-967b-390bfc7a1429",
      story: { dialogue: [{ text: "Ba ơi", action: "gọi ba dậy" }] },
      scenes: [{ imagePrompt: "Ba đang nằm ngủ", durationSeconds: 15 }],
    };
    expect(normalizeFamilyFatherTerms(value)).toEqual({
      id: value.id,
      story: { dialogue: [{ text: "Bố ơi", action: "gọi bố dậy" }] },
      scenes: [{ imagePrompt: "Bố đang nằm ngủ", durationSeconds: 15 }],
    });
  });
});
