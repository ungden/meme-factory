import { describe, expect, it } from "vitest";
import {
  assertMediaCoherent,
  coherenceMessage,
} from "./media-coherence";
import { familyProfile, type ChannelProfile } from "../family-catalogue";
import type { FilmPlan } from "./contracts";

const profile: ChannelProfile = familyProfile([
  { characterId: "banh", name: "Bánh Bao", personality: "" },
  { characterId: "dau", name: "Đậu Đỏ", personality: "" },
  { characterId: "me", name: "Mẹ", personality: "" },
  { characterId: "bo", name: "Bố", personality: "" },
]);

const scene = (overrides: Record<string, unknown>) =>
  ({
    id: "s1",
    scene_index: 0,
    dialogue: "Mẹ ơi, hồi nhỏ mẹ đi học được mấy điểm ạ?",
    speaker_character_id: "banh",
    action: "Bánh Bao chống cằm hỏi Mẹ",
    setting: "Phòng khách",
    camera: "cận cảnh",
    image_prompt: "Bánh Bao (ID banh) và Mẹ (ID me) trong phòng khách",
    motion_prompt: "Bánh Bao hỏi, Mẹ khựng lại",
    duration_seconds: 4,
    cast_snapshot: [
      {
        characterId: "banh",
        name: "Bánh Bao",
        description: "",
        personality: "",
        imageUrl: "ref",
        referenceImages: ["ref"],
        assetVersionId: "v1",
        assetVersion: 1,
      },
      {
        characterId: "me",
        name: "Mẹ",
        description: "",
        personality: "",
        imageUrl: "ref",
        referenceImages: ["ref"],
        assetVersionId: "v2",
        assetVersion: 1,
      },
    ],
    ...overrides,
  }) as unknown as FilmPlan["video_plan_scenes"][number];

const plan = (scenes: unknown[]) =>
  ({ video_plan_scenes: scenes }) as unknown as FilmPlan;

describe("media coherence gate", () => {
  it("passes a coherent scene", () => {
    expect(() => assertMediaCoherent(plan([scene({})]), profile)).not.toThrow();
  });

  it("blocks a speaker outside the scene cast", () => {
    const stale = scene({
      speaker_character_id: "me",
      cast_snapshot: [
        {
          characterId: "banh",
          name: "Bánh Bao",
          imageUrl: "ref",
          referenceImages: ["ref"],
        },
        {
          characterId: "dau",
          name: "Đậu Đỏ",
          imageUrl: "ref",
          referenceImages: ["ref"],
        },
      ],
    });
    expect(() => assertMediaCoherent(plan([stale]), profile)).toThrow(
      "PLAN_MEDIA_INCOHERENT",
    );
  });

  it("blocks stale prompts referencing a character outside the cast", () => {
    const stale = scene({
      image_prompt:
        "Bánh Bao (ID banh) tiến sát, ngón tay chỉ vào má Đậu Đỏ (ID dau), trên má em có vụn bánh quy.",
      motion_prompt: "Bánh Bao tiến tới, Đậu Đỏ quẹt má nhanh.",
      cast_snapshot: [
        {
          characterId: "banh",
          name: "Bánh Bao",
          imageUrl: "ref",
          referenceImages: ["ref"],
        },
        {
          characterId: "me",
          name: "Mẹ",
          imageUrl: "ref",
          referenceImages: ["ref"],
        },
      ],
    });
    let error: Error | null = null;
    try {
      assertMediaCoherent(plan([stale]), profile);
    } catch (e) {
      error = e as Error;
    }
    expect(error?.message).toContain("PLAN_MEDIA_INCOHERENT");
    expect(coherenceMessage(error!.message)).toContain("nhân vật ngoài cast");
    expect(coherenceMessage(error!.message)).toContain("Cảnh 1");
  });

  it("does not flag ordinary words like a single-token role name without its id", () => {
    const fine = scene({
      cast_snapshot: [
        {
          characterId: "banh",
          name: "Bánh Bao",
          imageUrl: "ref",
          referenceImages: ["ref"],
        },
        {
          characterId: "dau",
          name: "Đậu Đỏ",
          imageUrl: "ref",
          referenceImages: ["ref"],
        },
      ],
      image_prompt:
        "Hai bé ngồi cạnh cửa sổ, ngoài kia bố đang tưới cây trước hiên nhà.",
      motion_prompt: "Hai bé nhìn ra ngoài.",
    });
    expect(() => assertMediaCoherent(plan([fine]), profile)).not.toThrow();
  });

  it("requires a speaker when a scene has dialogue without a storyboard", () => {
    const broken = scene({ speaker_character_id: null, storyboard: null });
    expect(() => assertMediaCoherent(plan([broken]), profile)).toThrow(
      "PLAN_MEDIA_INCOHERENT",
    );
  });
});