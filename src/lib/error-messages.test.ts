import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ERROR_MESSAGES,
  INTERNAL_ONLY_CODES,
  errorCode,
  humanizeError,
  kindLabel,
  messageForCode,
  stageLabel,
  KIND_LABELS,
  STAGE_LABELS,
} from "./error-messages";

const SCREAMING = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/;

describe("errorCode", () => {
  it("pulls a code out of a plain string", () => {
    expect(errorCode("FAMILY_EDITORIAL_NEEDS_REVIEW")).toBe(
      "FAMILY_EDITORIAL_NEEDS_REVIEW",
    );
  });

  it("pulls a code out of an Error", () => {
    expect(errorCode(new Error("RUN_LEASE_LOST"))).toBe("RUN_LEASE_LOST");
  });

  it("pulls a code out of a PostgREST-shaped object", () => {
    expect(
      errorCode({ message: "INSUFFICIENT_POINTS", code: "P0001", hint: null }),
    ).toBe("INSUFFICIENT_POINTS");
  });

  it("unwraps a Postgres RAISE prefix", () => {
    expect(errorCode("P0001: PRODUCTION_BUDGET_EXCEEDED")).toBe(
      "PRODUCTION_BUDGET_EXCEEDED",
    );
  });

  it("ignores capitalised words that are not codes", () => {
    expect(errorCode("Không xử lý được phim.")).toBeNull();
    expect(errorCode("AI trả về JSON rỗng")).toBeNull();
  });

  it("returns null for an empty or unusable input", () => {
    expect(errorCode("")).toBeNull();
    expect(errorCode(null)).toBeNull();
    expect(errorCode(undefined)).toBeNull();
  });
});

describe("messageForCode", () => {
  it("resolves an exact code", () => {
    expect(messageForCode("QUOTE_EXPIRED")).toContain("hết hạn");
  });

  it("falls back to the longest matching prefix for a suffixed code", () => {
    // validateStory throws `STORY_WORDS_${words}`.
    expect(messageForCode("STORY_WORDS_87")).toBe(ERROR_MESSAGES.STORY_WORDS);
    // compileStoryShots throws `STORY_SHOT_${n}_INVALID`.
    expect(messageForCode("STORY_SHOT_3_INVALID")).toBe(
      ERROR_MESSAGES.STORY_SHOT,
    );
  });

  it("returns null for an unknown code", () => {
    expect(messageForCode("TOTALLY_MADE_UP_CODE")).toBeNull();
  });
});

describe("humanizeError", () => {
  it("translates a known code", () => {
    expect(humanizeError("INSUFFICIENT_POINTS")).toContain("nạp thêm điểm");
  });

  it("translates a code carrying extra detail", () => {
    expect(humanizeError("STORY_GUEST_UNDECLARED: guest-1,guest-2")).toBe(
      ERROR_MESSAGES.STORY_GUEST_UNDECLARED,
    );
  });

  it("passes an already-Vietnamese message through unchanged", () => {
    const message = "Duyệt giọng của Bánh Bao trước.";
    expect(humanizeError(message)).toBe(message);
  });

  it("keeps the Vietnamese half of a mixed message", () => {
    expect(
      humanizeError("UNKNOWN_INTERNAL_CODE Thoại dài hơn toàn cảnh, hãy rút gọn."),
    ).toContain("Thoại dài hơn toàn cảnh");
  });

  it("never leaks an untranslated code to the user", () => {
    for (const raw of [
      "SOME_BRAND_NEW_CODE",
      "P0001: ANOTHER_UNMAPPED_THING",
      new Error("YET_ANOTHER_UNKNOWN_FAILURE"),
      { message: "PGRST301", code: "PGRST301" },
    ]) {
      expect(humanizeError(raw)).not.toMatch(SCREAMING);
    }
  });

  it("uses the fallback for empty or non-Vietnamese input", () => {
    expect(humanizeError("")).toContain("sự cố kỹ thuật");
    expect(humanizeError("fetch failed")).toContain("sự cố kỹ thuật");
    expect(humanizeError(null, "Riêng biệt.")).toBe("Riêng biệt.");
  });

  it("produces no message that still contains a raw code", () => {
    for (const [code, message] of Object.entries(ERROR_MESSAGES)) {
      expect(message, `${code} leaks a code`).not.toMatch(SCREAMING);
      expect(message.trim().length, `${code} is too terse`).toBeGreaterThan(15);
    }
  });
});

describe("labels", () => {
  it("translates pipeline stages and task kinds", () => {
    expect(stageLabel("prepare")).toBe("chuẩn bị hình và tiếng");
    expect(kindLabel("lip_sync")).toBe("đồng bộ môi");
  });

  it("falls back to the raw value for an unknown key", () => {
    expect(stageLabel("brand_new_stage")).toBe("brand_new_stage");
  });
});

/**
 * Cổng chống mục: mọi mã lỗi thật sự được ném ra phải có câu tiếng Việt, hoặc
 * được khai báo rõ là chỉ dùng nội bộ. Không có test này, từ điển sẽ lạc hậu
 * ngay lần thêm mã tiếp theo.
 */
describe("dictionary coverage", () => {
  const root = path.resolve(__dirname, "../..");

  function filesUnder(dir: string, extensions: string[]): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...filesUnder(full, extensions));
      else if (extensions.some((ext) => entry.endsWith(ext))) out.push(full);
    }
    return out;
  }

  function collect(files: string[], pattern: RegExp) {
    const codes = new Map<string, string>();
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(pattern)) {
        const code = match[1];
        if (SCREAMING.test(code) && !codes.has(code))
          codes.set(code, path.relative(root, file));
      }
    }
    return codes;
  }

  const thrown = collect(
    filesUnder(path.join(root, "src/lib"), [".ts"]).filter(
      (file) => !file.endsWith(".test.ts"),
    ),
    /throw new (?:Error|FilmError)\(\s*"([A-Z][A-Z0-9_]*)/g,
  );
  const raised = collect(
    filesUnder(path.join(root, "supabase/migrations"), [".sql"]),
    /raise exception '([A-Z][A-Z0-9_]*)/gi,
  );

  it("finds the codes it is supposed to scan", () => {
    // Guards the scanner itself: a broken regex would silently pass every case.
    expect(thrown.size).toBeGreaterThan(30);
    expect(raised.size).toBeGreaterThan(30);
  });

  it.each([
    ["thrown in src/lib", () => thrown],
    ["raised in migrations", () => raised],
  ])("translates every code %s", (_label, get) => {
    const missing = [...get()]
      .filter(
        ([code]) => !messageForCode(code) && !INTERNAL_ONLY_CODES.has(code),
      )
      .map(([code, file]) => `${code} (${file})`);
    expect(missing).toEqual([]);
  });
});

/**
 * The studio derives its own phase labels, but the shared stage/kind maps are
 * what server-side sentences interpolate. A label that is already a verb phrase
 * ("Kiểm tra lời") must not be composed into another one.
 */
describe("label composition", () => {
  it("keeps stage labels usable inside a sentence", () => {
    for (const [stage, label] of Object.entries(STAGE_LABELS)) {
      expect(label, stage).not.toMatch(/^Kiểm tra .*kiểm tra/i);
      // Interpolated as `Bước ${stageLabel(stage)} ...`, so lower case reads right.
      expect(label[0], stage).toBe(label[0].toLocaleLowerCase("vi"));
    }
  });

  it("keeps kind labels usable inside a sentence", () => {
    for (const [kind, label] of Object.entries(KIND_LABELS)) {
      expect(label[0], kind).toBe(label[0].toLocaleLowerCase("vi"));
    }
  });

  it("covers every task kind the pipeline can produce", () => {
    for (const kind of [
      "image", "voice_design", "tts", "video", "dub",
      "lip_sync", "transcribe", "render", "frame",
    ])
      expect(KIND_LABELS[kind], kind).toBeTruthy();
  });
});
