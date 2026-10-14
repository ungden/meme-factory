import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const state = vi.hoisted(() => ({
  uploadError: null as unknown,
  insufficient: false,
  refunds: 0,
  uploads: [] as string[],
  rows: [] as Record<string, unknown>[],
  updates: [] as Array<{ table: string; patch: unknown; filters: Array<[string, unknown]> }>,
  downloads: [] as string[],
  references: [] as unknown[],
}));

vi.mock("@/lib/short-film/server", () => {
  class FilmError extends Error {
    constructor(
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  }
  const read = (result: unknown) => {
    const node: Record<string, unknown> = {};
    for (const key of ["select", "eq"]) node[key] = () => node;
    node.maybeSingle = async () => result;
    return node;
  };
  const update = (table: string) => (patch: unknown) => {
    const entry = { table, patch, filters: [] as Array<[string, unknown]> };
    state.updates.push(entry);
    const node = {
      eq: (column: string, value: unknown) => {
        entry.filters.push([column, value]);
        return node;
      },
      then: (resolve: (value: unknown) => void) => resolve({ error: null }),
    };
    return node;
  };
  const admin = {
    from: (table: string) => {
      if (table === "characters")
        return { ...read({ data: { id: "c1", name: "Bò", description: "Bò vàng", personality: "", avatar_url: null } }), update: update(table) };
      if (table === "projects") return read({ data: { style_prompt: "" } });
      if (table === "layout_presets") return read({ data: { default_safe_zones: { "1:1": { caption: {} } }, recommended_chars: 40 } });
      return {
        ...read({ data: { storage_bucket: "base-images", storage_path: "u1/c1/anchor.png" } }),
        update: update(table),
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              state.rows.push(row);
              return { data: { id: "b1", ...row }, error: null };
            },
          }),
        }),
      };
    },
    storage: {
      from: () => ({
        upload: async (path: string) => {
          state.uploads.push(path);
          return { error: state.uploadError };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://kho/${path}` } }),
        download: async (path: string) => {
          state.downloads.push(path);
          return { data: new Blob([Buffer.from("anchor")], { type: "image/png" }) };
        },
      }),
    },
  };
  return {
    FilmError,
    access: async () => ({ admin, user: { id: "u1" }, project: { id: "p1", user_id: "u1", name: "Kênh" } }),
    fail: (error: { message?: string; status?: number }) =>
      NextResponse.json({ error: error.message ?? "lỗi" }, { status: error.status ?? 500 }),
  };
});
vi.mock("@/lib/gemini-image", () => ({
  IMAGE_MODEL: "model",
  compileCharacterPosePrompt: () => "prompt",
  generateCharacterPose: async (input: { existingPoseImages?: unknown[] }) => {
    state.references.push(input.existingPoseImages);
    return { image: Buffer.from("png").toString("base64") };
  },
}));
vi.mock("@/lib/ai-pricing", async (load) => ({
  ...(await load<typeof import("@/lib/ai-pricing")>()),
  estimateImageGenerationPrice: () => ({ providerCostUsd: 0 }),
}));
// Giống chargedCharacterImage thật ở chỗ cần kiểm: trừ trước, hoàn khi generate ném lỗi.
vi.mock("@/lib/charged-image", () => {
  class InsufficientPointsError extends Error {
    constructor(
      readonly required: number,
      readonly available: number,
    ) {
      super(`Không đủ điểm. Mỗi ảnh cần ${required} điểm, bạn đang có ${available} điểm.`);
    }
  }
  return {
    InsufficientPointsError,
    chargedCharacterImage: async ({ generate }: { generate: () => Promise<unknown> }) => {
      if (state.insufficient) throw new InsufficientPointsError(5, 2);
      try {
        return { result: await generate(), requestId: "job-1", cost: 5 };
      } catch (error) {
        state.refunds += 1;
        throw error;
      }
    },
  };
});

const { POST } = await import("./route");

const call = (body: Record<string, unknown> = {}) =>
  POST(
    new NextRequest("https://aida.vn/api/meme/base-pack", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectRef: "p1", characterId: "c1", recipeId: "neutral", aspectRatio: "1:1", ...body }),
    }),
  );

describe("vẽ bộ ảnh ghép chữ", () => {
  beforeEach(() => {
    state.uploadError = null;
    state.insufficient = false;
    state.refunds = 0;
    state.uploads = [];
    state.rows = [];
    state.updates = [];
    state.downloads = [];
    state.references = [];
  });

  it("lưu ảnh đầu thành mẫu meme ngay trong bước tính tiền", async () => {
    const response = await call({ sketch: { base64: "c2tldGNo", mimeType: "image/png" } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(state.uploads[0]).toMatch(/^u1\/c1\/.+-neutral\.png$/);
    expect(state.rows[0]).toMatchObject({ project_id: "p1", character_id: "c1", status: "ready", expression_slug: "neutral" });
    expect(body).toMatchObject({ pointsUsed: 5, baseImage: { id: "b1", generation_job_id: "job-1" } });
    expect(state.references[0]).toEqual([{ base64: "c2tldGNo", mimeType: "image/png" }]);
    // Nhân vật chưa có ảnh đại diện thì lấy luôn ảnh này.
    expect(state.updates.some((entry) => entry.table === "characters")).toBe(true);
    expect(state.refunds).toBe(0);
  });

  it("ảnh sau đọc ảnh đầu từ kho của kênh, không nhận base64 từ trình duyệt", async () => {
    const response = await call({ recipeId: "happy", anchorBaseImageId: "b0", sketch: { base64: "bad", mimeType: "image/png" } });
    expect(response.status).toBe(200);
    expect(state.downloads).toEqual(["u1/c1/anchor.png"]);
    expect(state.references[0]).toEqual([{ base64: Buffer.from("anchor").toString("base64"), mimeType: "image/png" }]);
  });

  it("vẽ lại ảnh đầu thì ẩn ảnh cũ chứ không xoá", async () => {
    await call({ replacesBaseImageId: "old" });
    const archived = state.updates.find((entry) => (entry.patch as { status?: string }).status === "archived");
    expect(archived?.filters).toEqual(
      expect.arrayContaining([
        ["id", "old"],
        ["project_id", "p1"],
      ]),
    );
  });

  it("lưu hỏng thì hoàn điểm như vẽ hỏng", async () => {
    state.uploadError = new Error("storage down");
    const response = await call();
    expect(response.status).toBe(500);
    expect(state.refunds).toBe(1);
    expect(state.rows).toHaveLength(0);
  });

  it("hết điểm thì trả mã để mở hộp nạp", async () => {
    state.insufficient = true;
    const response = await call();
    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ code: "INSUFFICIENT_POINTS", required: 5, current: 2 });
  });

  it("từ chối biểu cảm không có trong danh sách", async () => {
    const response = await call({ recipeId: "nope" });
    expect(response.status).toBe(400);
    expect(state.uploads).toHaveLength(0);
  });
});
