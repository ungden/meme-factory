import { describe, expect, it } from "vitest";
import {
  channelFilmMedium,
  filmMediumFor,
  filmPackReady,
  filmReferencePrompt,
} from "./channel-setup";
import { filmMediumOfProfile, formatLook } from "../film-camera-language";

describe("thiết lập kênh phim", () => {
  it("nhân vật người thật lên phim người thật, mascot 3D lên phim hoạt hình", () => {
    expect(filmMediumFor("photoreal_human")).toBe("photoreal");
    expect(filmMediumFor("soft_3d")).toBe("animated");
    expect(filmMediumFor(undefined)).toBe("animated");
    expect(channelFilmMedium(["photoreal_human", "photoreal_human", "soft_3d"])).toBe("photoreal");
    expect(channelFilmMedium(["soft_3d", "photoreal_human"])).toBe("animated");
  });

  it("đủ lên phim khi có cận mặt và toàn thân; ảnh lưng là thêm", () => {
    expect(filmPackReady(["identity_face", "identity_body"])).toBe(true);
    expect(filmPackReady(["identity_body", "look"])).toBe(false);
  });

  it("prompt mỗi góc giữ đúng chất liệu của nhân vật", () => {
    const mascot = filmReferencePrompt("face", { name: "Mèo Mập", description: "mèo cam" }, "animated");
    expect(mascot).toContain("Render 3D");
    expect(mascot).not.toContain("lỗ chân lông");
    expect(filmReferencePrompt("back", { name: "Bé", description: "" }, "photoreal")).toContain("3/4 phía sau");
  });

  // Gửi look "da người thật" cho kênh mascot là biến nhân vật 3D thành người.
  it("look của định dạng mới đổi theo chất liệu kênh", () => {
    expect(formatLook("talk_to_camera", "animated")).toContain("hoạt hình 3D");
    expect(formatLook("talk_to_camera", "photoreal")).toContain("điện thoại thật");
    expect(formatLook("family_scene", "animated")).toBe("");
    expect(filmMediumOfProfile({ id: "family-phone-real-v2" })).toBe("photoreal");
    expect(filmMediumOfProfile({ id: "x", medium: "animated" })).toBe("animated");
    expect(filmMediumOfProfile(undefined)).toBe("animated");
  });
});
