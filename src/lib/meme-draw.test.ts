import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decideDrawReplay, drawStoragePath, isDrawRequestId, persistDrawnMeme, readDrawSave } from "./meme-draw";

const ID = "6f1c2b8e-3d4a-4f5b-9c6d-7e8f9a0b1c2d";

describe("decideDrawReplay", () => {
  it("returns the saved meme instead of drawing again", () => {
    expect(decideDrawReplay({ meme: { id: "m", image_url: "https://x/a.png" }, job: { status: "completed" }, paid: true })).toBe("replay");
  });

  it("waits while the same draw is still running", () => {
    expect(decideDrawReplay({ meme: null, job: { status: "running" }, paid: true })).toBe("busy");
    expect(decideDrawReplay({ meme: null, job: { status: "queued" }, paid: false })).toBe("busy");
  });

  it("refuses an id that was charged or ran before, so a redraw cannot ride on an old payment", () => {
    expect(decideDrawReplay({ meme: null, job: { status: "failed" }, paid: true })).toBe("used");
    expect(decideDrawReplay({ meme: null, job: null, paid: true })).toBe("used");
    expect(decideDrawReplay({ meme: null, job: { status: "completed" }, paid: true })).toBe("used");
  });

  it("draws when the id is new", () => {
    expect(decideDrawReplay({ meme: null, job: null, paid: false })).toBe("fresh");
  });
});

describe("readDrawSave", () => {
  it("is absent when the client does not ask the server to save", () => {
    expect(readDrawSave({ format: "1:1" })).toBeNull();
  });

  it("keeps only the library fields and falls back to a safe format", () => {
    const save = readDrawSave({
      format: "3:2",
      source_meme_id: "not-a-uuid",
      save: {
        original_idea: "x".repeat(3000),
        generated_content: { headline: "Sếp nhắn lúc 10 giờ tối" },
        selected_characters: Array.from({ length: 12 }, (_, index) => ({ character_id: String(index) })),
        has_watermark: "yes",
        image_url: "https://evil.example/a.png",
      },
    });
    expect(save).toEqual({
      original_idea: "x".repeat(2000),
      generated_content: { headline: "Sếp nhắn lúc 10 giờ tối" },
      selected_characters: Array.from({ length: 8 }, (_, index) => ({ character_id: String(index) })),
      has_watermark: false,
      format: "1:1",
      source_meme_id: null,
    });
  });

  it("keeps a valid format and source meme", () => {
    const save = readDrawSave({ format: "9:16", source_meme_id: ID, save: { has_watermark: true, generated_content: [] } });
    expect(save?.format).toBe("9:16");
    expect(save?.source_meme_id).toBe(ID);
    expect(save?.has_watermark).toBe(true);
    expect(save?.generated_content).toEqual({});
  });
});

describe("isDrawRequestId", () => {
  it("accepts only uuids", () => {
    expect(isDrawRequestId(ID)).toBe(true);
    expect(isDrawRequestId("123")).toBe(false);
    expect(isDrawRequestId(undefined)).toBe(false);
  });
});

function fakeAdmin(options: { uploadError?: string; insertError?: string } = {}) {
  const calls: Array<{ table: string; op: string; payload?: unknown; filters?: Array<[string, unknown]>; options?: unknown }> = [];
  const admin = {
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _body: unknown, opts: unknown) => {
          calls.push({ table: `storage:${bucket}`, op: "upload", payload: path, options: opts });
          return { error: options.uploadError ? { message: options.uploadError } : null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${bucket}/${path}` } }),
      }),
    },
    from: (table: string) => {
      const entry: (typeof calls)[number] = { table, op: "", filters: [] };
      calls.push(entry);
      const builder = {
        insert(payload: unknown) {
          entry.op = "insert";
          entry.payload = payload;
          return builder;
        },
        upsert(payload: unknown, opts: unknown) {
          entry.op = "upsert";
          entry.payload = payload;
          entry.options = opts;
          return Promise.resolve({ error: null });
        },
        update(payload: unknown) {
          entry.op = "update";
          entry.payload = payload;
          return builder;
        },
        select() {
          return builder;
        },
        eq(column: string, value: unknown) {
          entry.filters!.push([column, value]);
          return builder;
        },
        single: async () =>
          options.insertError
            ? { data: null, error: { message: options.insertError } }
            : { data: { id: "meme-1", image_url: "ignored" }, error: null },
        then(resolve: (value: { error: null }) => void) {
          resolve({ error: null });
        },
      };
      return builder;
    },
  };
  return { admin: admin as unknown as SupabaseClient, calls };
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");
const SAVE = {
  original_idea: "Sếp nhắn",
  generated_content: { headline: "Em rảnh không?" },
  selected_characters: [],
  has_watermark: true,
  format: "4:5" as const,
  source_meme_id: null,
};

describe("persistDrawnMeme", () => {
  it("stores the image under the draw id, then the library row, then the job output", async () => {
    const { admin, calls } = fakeAdmin();
    const saved = await persistDrawnMeme(admin, {
      projectId: "p1",
      actorUserId: "u1",
      requestId: ID,
      imageBase64: PNG,
      save: SAVE,
    });

    expect(saved).toEqual({ id: "meme-1", image_url: `https://cdn.test/memes/${drawStoragePath("p1", ID)}` });
    expect(calls.map((call) => `${call.table}:${call.op}`)).toEqual([
      "storage:memes:upload",
      "memes:insert",
      "generation_outputs:upsert",
      "project_transactions:update",
    ]);
    // Gửi lại cùng mã thì ghi đè đúng file cũ chứ không thêm file mới.
    expect(calls[0].options).toMatchObject({ upsert: true });
    expect(calls[1].payload).toMatchObject({
      project_id: "p1",
      generation_job_id: ID,
      format: "4:5",
      has_watermark: true,
      status: "completed",
    });
    expect(calls[3].payload).toMatchObject({ output_kind: "meme", output_id: "meme-1", output_title: "Em rảnh không?" });
    expect(calls[3].filters).toContainEqual(["request_id", ID]);
  });

  it("fails before writing a library row when the upload fails", async () => {
    const { admin, calls } = fakeAdmin({ uploadError: "bucket full" });
    await expect(
      persistDrawnMeme(admin, { projectId: "p1", actorUserId: "u1", requestId: ID, imageBase64: PNG, save: SAVE }),
    ).rejects.toThrow("MEME_UPLOAD_FAILED");
    expect(calls.some((call) => call.table === "memes")).toBe(false);
  });

  it("does not record a job output when the library row fails", async () => {
    const { admin, calls } = fakeAdmin({ insertError: "rls" });
    await expect(
      persistDrawnMeme(admin, { projectId: "p1", actorUserId: "u1", requestId: ID, imageBase64: PNG, save: SAVE }),
    ).rejects.toThrow("MEME_INSERT_FAILED");
    expect(calls.some((call) => call.table === "generation_outputs")).toBe(false);
  });
});
