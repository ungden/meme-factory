import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("./admin", () => ({ getSupabaseAdmin: () => ({ from }) }));

import { resolveClipDubbing } from "./clip-dubbing";

type Row = { data: unknown; error: unknown };

/** One canned result per table the resolver reads. */
function database(rows: Record<string, Row>) {
  from.mockImplementation((table: string) => {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      not: () => builder,
      order: () => builder,
      limit: () => builder,
      single: async () => rows[table] ?? { data: null, error: "missing" },
      maybeSingle: async () => rows[table] ?? { data: null, error: null },
    };
    return builder;
  });
}

const approved = {
  projects: { data: { workspace_version: 3 }, error: null },
  characters: { data: { id: "character-1" }, error: null },
  character_voice_versions: {
    data: {
      id: "voice-version-1",
      voice_id: "Aoede",
      model: "gemini-3.1-flash-tts-preview",
      settings: { direction: "Nói nhẹ nhàng." },
    },
    error: null,
  },
};

beforeEach(() => {
  from.mockReset();
});

describe("resolveClipDubbing input guards", () => {
  it("returns null when no dubbing was requested", async () => {
    expect(await resolveClipDubbing("project-1", null, 10)).toBeNull();
  });

  it.each([
    ["missing text", { characterId: "character-1" }],
    ["blank text", { text: "   ", characterId: "character-1" }],
    ["missing speaker", { text: "Xin chào" }],
  ])("rejects %s", async (_label, input) => {
    database(approved);
    await expect(resolveClipDubbing("project-1", input, 10)).rejects.toThrow(
      /Nhập lời lồng tiếng/,
    );
  });

  // The budget is (duration - 0.5) * 2.6 words: speech has to fit the clip,
  // because the pipeline never speeds up or trims a line to make it fit.
  it("accepts a line that fits the clip's word budget", async () => {
    database(approved);
    const words = Array.from({ length: 24 }, () => "từ").join(" ");
    await expect(
      resolveClipDubbing("project-1", { text: words, characterId: "c" }, 10),
    ).resolves.toMatchObject({ voice: "Aoede" });
  });

  it("rejects a line that overruns the clip's word budget", async () => {
    database(approved);
    const words = Array.from({ length: 26 }, () => "từ").join(" ");
    await expect(
      resolveClipDubbing("project-1", { text: words, characterId: "c" }, 10),
    ).rejects.toThrow(/quá dài/);
  });

  it("rejects text beyond the hard character cap", async () => {
    database(approved);
    await expect(
      resolveClipDubbing(
        "project-1",
        { text: "a".repeat(701), characterId: "c" },
        600,
      ),
    ).rejects.toThrow(/quá dài/);
  });
});

describe("resolveClipDubbing voice resolution", () => {
  it("returns the approved voice version and a positive price", async () => {
    database(approved);
    const result = await resolveClipDubbing(
      "project-1",
      { text: "Con chào bố", characterId: "character-1" },
      10,
    );
    expect(result).toMatchObject({
      characterId: "character-1",
      voiceProfileVersion: "voice-version-1",
      voice: "Aoede",
      direction: "Nói nhẹ nhàng.",
    });
    expect(result?.points).toBeGreaterThan(0);
  });

  it("refuses a speaker from another project", async () => {
    database({ ...approved, characters: { data: null, error: "not found" } });
    await expect(
      resolveClipDubbing("project-1", { text: "Chào", characterId: "c" }, 10),
    ).rejects.toThrow(/không thuộc dự án/);
  });

  it("refuses when the character has no approved voice", async () => {
    database({
      ...approved,
      character_voice_versions: { data: null, error: null },
    });
    await expect(
      resolveClipDubbing("project-1", { text: "Chào", characterId: "c" }, 10),
    ).rejects.toThrow(/Duyệt một giọng Gemini/);
  });

  it("refuses an approved voice that is not a Gemini TTS model", async () => {
    database({
      ...approved,
      character_voice_versions: {
        data: {
          id: "voice-version-2",
          voice_id: "Wise_Woman",
          model: "minimax/speech-2.6-hd",
          settings: {},
        },
        error: null,
      },
    });
    await expect(
      resolveClipDubbing("project-1", { text: "Chào", characterId: "c" }, 10),
    ).rejects.toThrow(/Duyệt một giọng Gemini/);
  });

  it("falls back to a neutral direction when the voice has none", async () => {
    database({
      ...approved,
      character_voice_versions: {
        data: {
          id: "voice-version-3",
          voice_id: "Leda",
          model: "gemini-3.1-flash-tts-preview",
          settings: {},
        },
        error: null,
      },
    });
    const result = await resolveClipDubbing(
      "project-1",
      { text: "Chào", characterId: "c" },
      10,
    );
    expect(result?.direction).toBe("Nói tiếng Việt tự nhiên.");
  });
});
