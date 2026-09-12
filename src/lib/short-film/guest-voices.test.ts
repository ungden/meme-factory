import { describe, expect, it } from "vitest";
import {
  automaticGuestVoice,
  isAdultMaleGuest,
} from "./guest-voices";

describe("automatic guest voices", () => {
  it("freezes a stable male Gemini voice and avoids a collision in one film", () => {
    const used = new Set<string>();
    const pilot = automaticGuestVoice({
      projectId: "project",
      workspaceVersion: 3,
      character: {
        id: "pilot",
        name: "Phi Công",
        description: "Phi công nam người Việt trưởng thành",
      },
      usedVoices: used,
    });
    const expert = automaticGuestVoice({
      projectId: "project",
      workspaceVersion: 3,
      character: {
        id: "expert",
        name: "Chuyên Gia",
        description: "Chuyên gia nam người Việt trưởng thành",
      },
      usedVoices: used,
    });
    expect(pilot?.settings.source).toBe("auto_guest");
    expect(expert?.settings.source).toBe("auto_guest");
    expect(expert?.voice_id).not.toBe(pilot?.voice_id);
    expect(
      automaticGuestVoice({
        projectId: "project",
        workspaceVersion: 3,
        character: {
          id: "pilot",
          name: "Phi Công",
          description: "Phi công nam người Việt trưởng thành",
        },
      }),
    ).toEqual(pilot);
  });

  it("does not silently assign a male voice to an unspecified guest", () => {
    expect(isAdultMaleGuest({ name: "Khách mời", description: "" })).toBe(false);
    expect(
      automaticGuestVoice({
        projectId: "project",
        workspaceVersion: 1,
        character: { id: "guest", name: "Khách mời" },
      }),
    ).toBeUndefined();
  });
});
