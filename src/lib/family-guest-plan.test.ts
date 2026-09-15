import { describe, expect, it } from "vitest";
import { validateCreativeAssist } from "./creative-assist";
import { buildFamilyEditorialPrompt } from "./creative-assist";
import { storyResponseSchema, compileStoryShots } from "./family-ai-contract";
import {
  familyProfile,
  normalizeStoryGuests,
  assertDeclaredGuests,
  type Story,
} from "./family-catalogue";

const core = [
  { id: "core-1", name: "Bánh Bao", description: "Chị lớn", personality: "" },
  { id: "core-2", name: "Đậu Đỏ", description: "Em nhỏ", personality: "" },
];
const guest = {
  key: "guest-1",
  name: "Ông phi công",
  description: "Phi công già đeo kính đen",
  personality: "Điềm tĩnh",
};
const extendedContext = {
  projectName: "Bánh Bao & Đậu Đỏ",
  characters: [
    ...core,
    { id: guest.key, name: guest.name, description: guest.description, personality: guest.personality },
  ],
  recentContent: [],
};

describe("per-video guest characters", () => {
  it("accepts guest ids in a planned scene when the context carries the guest", () => {
    const result = validateCreativeAssist(
      "video_plan",
      {
        title: "Tập có khách",
        summary: "...",
        scenes: [
          {
            characterIds: ["core-1", guest.key],
            speakerCharacterId: guest.key,
            dialogue: "Chào cháu, chú là phi công.",
            action: "Ông phi công cúi chào",
            setting: "Sân bay",
            camera: "cận cảnh",
            durationSeconds: 5,
            imagePrompt: "Ông phi công trong sân bay",
            motionPrompt: "cúi chào rồi giơ tay",
            followsPrevious: false,
          },
          {
            characterIds: ["core-1"],
            speakerCharacterId: "core-1",
            dialogue: "Chú bay máy bay to không ạ?",
            action: "Bánh Bao ngước lên",
            setting: "Sân bay",
            camera: "cận cảnh",
            durationSeconds: 5,
            imagePrompt: "Bánh Bao ngước lên",
            motionPrompt: "ngước lên và hỏi",
            followsPrevious: false,
          },
          {
            characterIds: ["core-1"],
            speakerCharacterId: null,
            dialogue: "",
            action: "Bánh Bao nhìn theo ông",
            setting: "Sân bay",
            camera: "toàn cảnh",
            durationSeconds: 4,
            imagePrompt: "Bánh Bao nhìn theo",
            motionPrompt: "nhìn theo ông phi công",
            followsPrevious: false,
          },
        ],
      },
      extendedContext,
      15,
    );
    expect(result.kind).toBe("video_plan");
    if (result.kind === "video_plan")
      expect(result.scenes[0].characterIds).toEqual(["core-1", guest.key]);
  });

  it("drops an unknown guest id like any unknown character id", () => {
    const result = validateCreativeAssist(
      "video_plan",
      {
        title: "Tập lạ",
        summary: "...",
        scenes: [
          {
            characterIds: ["core-1", "guest-không-tồn-tại"],
            speakerCharacterId: "core-1",
            dialogue: "Ai đây?",
            action: "Nhìn quanh",
            setting: "Nhà",
            camera: "cận cảnh",
            durationSeconds: 5,
            imagePrompt: "Nhìn quanh",
            motionPrompt: "nhìn quanh",
            followsPrevious: false,
          },
          {
            characterIds: ["core-1"],
            speakerCharacterId: "core-1",
            dialogue: "Chắc là mơ.",
            action: "Lắc đầu",
            setting: "Nhà",
            camera: "cận cảnh",
            durationSeconds: 5,
            imagePrompt: "Lắc đầu",
            motionPrompt: "lắc đầu",
            followsPrevious: false,
          },
          {
            characterIds: ["core-1"],
            speakerCharacterId: null,
            dialogue: "",
            action: "Ngồi xuống",
            setting: "Nhà",
            camera: "toàn cảnh",
            durationSeconds: 4,
            imagePrompt: "Ngồi xuống",
            motionPrompt: "ngồi xuống",
            followsPrevious: false,
          },
        ],
      },
      extendedContext,
      15,
    );
    expect(result.kind).toBe("video_plan");
    if (result.kind === "video_plan")
      expect(result.scenes[0].characterIds).toEqual(["core-1"]);
  });

  it("lists the guest in the editorial review context", () => {
    const prompt = buildFamilyEditorialPrompt(
      {
        kind: "video_plan",
        context: {
          projectName: "Bánh Bao & Đậu Đỏ",
          characters: core,
          recentContent: [],
          channelProfile: familyProfile([]),
        },
        selectedCharacterIds: ["core-1"],
        guestCharacters: [guest],
      },
      {
        series: "Liên minh bí mật",
        situation: "Gia đình gặp ông phi công",
        mechanism: "Khách mời một tập",
        outcome: "Hai bé hỏi chuyện máy bay",
        setup: "",
        payoff: "",
        caption: "",
        profileVersion: 10,
        wants: [
          { characterId: "core-1", want: "Hỏi chuyện" },
          { characterId: guest.key, want: "Kể chuyện bay" },
        ],
        beats: [],
        dialogue: [
          { characterId: guest.key, text: "Chào cháu.", action: "Cúi chào" },
        ],
      } as unknown as Story,
    );
    expect(prompt).toContain(guest.key);
    expect(prompt).toContain(guest.name);
  });

  it("allows guest keys in the story response schema enum", () => {
    const schema = storyResponseSchema(
      familyProfile([]),
      ["core-1", guest.key],
    );
    expect(
      JSON.stringify(schema).includes(guest.key),
    ).toBe(true);
  });

  it("compiles shots with the guest name in the speaker constraint", () => {
    const story = {
      series: "Liên minh bí mật",
      situation: "Gặp ông phi công",
      mechanism: "Khách một tập",
      outcome: "Hỏi chuyện bay",
      wants: [],
      beats: [
        { purpose: "hook", description: "Mở" },
        { purpose: "payoff", description: "Chốt" },
      ],
      dialogue: [
        { characterId: guest.key, text: "Chào cháu.", action: "Cúi chào" },
        { characterId: "core-1", text: "Cháu chào chú.", action: "Vẫy tay" },
      ],
    } as unknown as Story;
    const compiled = compileStoryShots(
      {
        shots: {
          shot1: {
            action: "Cúi chào",
            setting: "Sân bay",
            camera: "cận cảnh",
            imagePrompt: "Ông phi công",
            motionPrompt: "cúi chào",
            durationSeconds: 5,
          },
          shot2: {
            action: "Vẫy tay",
            setting: "Sân bay",
            camera: "cận cảnh",
            imagePrompt: "Bánh Bao",
            motionPrompt: "vẫy tay",
            durationSeconds: 5,
          },
        },
      },
      story,
      [...core, { id: guest.key, name: guest.name }],
    );
    expect(compiled.scenes[0].speakerCharacterId).toBe(guest.key);
    expect(compiled.scenes[0].imagePrompt).toContain(guest.name);
  });

  it("normalizes a declared guest and rejects undeclared guest keys", () => {
    const guests = normalizeStoryGuests([
      {
        key: "guest-1",
        name: "Ông phi công",
        description: "Người đàn ông đeo kính đen, mặc áo phi công trắng",
        personality: "Điềm tĩnh",
      },
    ]);
    expect(guests[0].key).toBe("guest-1");
    expect(() =>
      normalizeStoryGuests([{ key: "guest-9", name: "X", description: "Mô tả rất dài đủ điều kiện" }]),
    ).toThrow("STORY_GUEST_KEY_INVALID");
    expect(() =>
      normalizeStoryGuests([{ key: "guest-1", name: "", description: "" }]),
    ).toThrow("STORY_GUEST_DESCRIPTION_REQUIRED");
    expect(() =>
      assertDeclaredGuests({
        guests: [],
        dialogue: [{ characterId: "guest-1", text: "X", action: "Y" }],
        wants: [],
      }),
    ).toThrow("STORY_GUEST_UNDECLARED");
  });
});
