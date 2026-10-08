import { describe, expect, it } from "vitest";
import {
  CAMERA_PRESETS,
  FORMAT_CAMERA_PRESETS,
  cameraDirection,
  cameraPresetMenu,
  filmFormat,
  presetShowsFeet,
} from "./film-camera-language";
import { framingCanShowFeet } from "./family-ai-contract";

describe("ngôn ngữ máy quay", () => {
  it("đặt câu chuẩn của preset trước phần riêng của đạo diễn", () => {
    expect(
      cameraDirection("phone_face_push", "bé hét vào máy", "talk_to_camera"),
    ).toMatch(/^điện thoại 0\.5x cận mặt.*; bé hét vào máy$/u);
  });

  it("bỏ preset không thuộc định dạng thay vì làm hỏng cả tập", () => {
    expect(cameraDirection("studio_top_down", "tay bé", "talk_to_camera")).toBe("tay bé");
    expect(cameraDirection("free", "máy theo bé", "family_scene")).toBe("máy theo bé");
    expect(cameraDirection("không-có", "máy theo bé")).toBe("máy theo bé");
  });

  it("truyện cũ không có định dạng được dựng như family_scene", () => {
    expect(filmFormat(undefined)).toBe("family_scene");
    expect(filmFormat("talk_to_camera")).toBe("talk_to_camera");
    expect(FORMAT_CAMERA_PRESETS.family_scene).toEqual(CAMERA_PRESETS);
  });

  it("menu chỉ đưa preset của định dạng đang dựng", () => {
    const menu = cameraPresetMenu("cooking_show");
    expect(menu).toContain("studio_top_down");
    expect(menu).not.toContain("vox_pop_mic");
  });

  // Đòi kiểm giày dép trong khung cắt ngang ngực làm cả lượt chạy đỗ lại chờ người.
  it("câu chuẩn của preset khớp với việc khung có thấy chân hay không", () => {
    for (const preset of CAMERA_PRESETS) {
      const feet = presetShowsFeet(preset);
      if (feet === undefined) continue;
      if (!feet) expect(framingCanShowFeet(cameraDirection(preset, ""))).toBe(false);
    }
  });
});
