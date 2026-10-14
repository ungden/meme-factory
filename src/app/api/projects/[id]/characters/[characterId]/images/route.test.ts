import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const state = vi.hoisted(() => ({
  uploadError: null as unknown,
  insufficient: false,
  refunds: 0,
  uploads: [] as string[],
  poses: [] as Record<string, unknown>[],
  avatarUpdates: [] as unknown[],
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
  const chain = (result: unknown) => {
    const node: Record<string, unknown> = {};
    for (const key of ["select", "eq"]) node[key] = () => node;
    node.maybeSingle = async () => result;
    return node;
  };
  const admin = {
    from: (table: string) => {
      if (table === "characters")
        return {
          ...chain({ data: { id: "c1", name: "Bò", description: "Bò vàng", personality: "", avatar_url: null } }),
          update: (patch: unknown) => ({ eq: async () => state.avatarUpdates.push(patch) }),
        };
      if (table === "character_dna") return chain({ data: null });
      return {
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              state.poses.push(row);
              return { data: { id: "pose1", ...row }, error: null };
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
        download: async () => ({ data: null }),
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
  generateCharacterPose: async () => ({ image: Buffer.from("png").toString("base64") }),
}));
vi.mock("@/lib/ai-pricing", () => ({ estimateImageGenerationPrice: () => ({ providerCostUsd: 0 }) }));
vi.mock("@/lib/mascot-art-direction", () => ({ isArtDirectionId: () => false }));
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
        return { result: await generate(), requestId: "r1", cost: 5 };
      } catch (error) {
        state.refunds += 1;
        throw error;
      }
    },
  };
});

const { POST } = await import("./route");

const call = (body: unknown = {}) =>
  POST(
    new NextRequest("https://aida.vn/api/projects/p1/characters/c1/images", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "p1", characterId: "c1" }) },
  );

describe("vẽ thêm ảnh nhân vật", () => {
  beforeEach(() => {
    state.uploadError = null;
    state.insufficient = false;
    state.refunds = 0;
    state.uploads = [];
    state.poses = [];
    state.avatarUpdates = [];
  });

  it("lưu ảnh vào kho trước khi trả lời, không cần trình duyệt bấm lưu", async () => {
    const response = await call({ note: "đang cười lớn" });
    expect(response.status).toBe(200);
    expect(state.uploads).toHaveLength(1);
    expect(state.poses[0]).toMatchObject({ character_id: "c1", description: "đang cười lớn" });
    expect((await response.json()).pose.image_url).toContain(state.uploads[0]);
    // Nhân vật chưa có ảnh đại diện thì lấy luôn ảnh này.
    expect(state.avatarUpdates).toHaveLength(1);
    expect(state.refunds).toBe(0);
  });

  it("lưu hỏng thì hoàn điểm như vẽ hỏng", async () => {
    state.uploadError = new Error("storage down");
    const response = await call();
    expect(response.status).toBe(500);
    expect(state.refunds).toBe(1);
    expect(state.poses).toHaveLength(0);
  });

  it("hết điểm thì trả mã để mở hộp nạp", async () => {
    state.insufficient = true;
    const response = await call();
    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ code: "INSUFFICIENT_POINTS", required: 5, current: 2 });
  });
});
