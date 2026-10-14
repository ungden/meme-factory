import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const state = vi.hoisted(() => ({
  uploadError: null as unknown,
  insufficient: false,
  refunds: 0,
  uploads: [] as string[],
  poses: [] as Record<string, unknown>[],
  avatarUpdates: [] as unknown[],
  // Sổ điểm và job giả: trừ theo mã như RPC thật, job trùng khoá thì báo trùng.
  charges: 0,
  payments: new Set<string>(),
  jobs: new Map<string, string>(),
  hold: null as Promise<void> | null,
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
  type Filters = Record<string, unknown>;
  const chain = (result: { data: unknown } | ((filters: Filters) => unknown)) => {
    const filters: Record<string, unknown> = {};
    const node: Record<string, unknown> = {};
    node.select = () => node;
    node.eq = (column: string, value: unknown) => {
      filters[column] = value;
      return node;
    };
    node.maybeSingle = async () => (typeof result === "function" ? result(filters) : result);
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
      if (table === "generation_jobs")
        return chain((f: Filters) => ({ data: state.jobs.has(String(f.id)) ? { status: state.jobs.get(String(f.id)) } : null }));
      if (table === "project_transactions")
        return chain((f: Filters) => ({ data: state.payments.has(String(f.request_id)) ? { created_at: new Date().toISOString() } : null }));
      return {
        ...chain((f: Filters) => ({ data: state.poses.find((pose) => pose.image_url === f.image_url) ?? null })),
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              const pose = { id: `pose${state.poses.length + 1}`, ...row };
              state.poses.push(pose);
              return { data: pose, error: null };
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
  class DuplicateRequestError extends Error {}
  return {
    InsufficientPointsError,
    DuplicateRequestError,
    chargedCharacterImage: async ({ generate, requestId }: { generate: () => Promise<unknown>; requestId?: string }) => {
      if (state.insufficient) throw new InsufficientPointsError(5, 2);
      const id = requestId ?? `r${state.jobs.size + 1}`;
      if (!state.payments.has(id)) {
        state.payments.add(id);
        state.charges += 1;
      }
      if (state.jobs.has(id)) throw new DuplicateRequestError();
      state.jobs.set(id, "running");
      try {
        if (state.hold) await state.hold;
        const result = await generate();
        state.jobs.set(id, "completed");
        return { result, requestId: id, cost: 5 };
      } catch (error) {
        state.refunds += 1;
        state.jobs.set(id, "failed");
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
    state.charges = 0;
    state.payments = new Set();
    state.jobs = new Map();
    state.hold = null;
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

  describe("bấm hai lần cùng một mã", () => {
    const requestId = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";

    it("hai yêu cầu chạy cùng lúc chỉ trừ một lần, yêu cầu sau báo đang vẽ", async () => {
      let release!: () => void;
      state.hold = new Promise<void>((resolve) => (release = resolve));
      const first = call({ note: "cười", request_id: requestId });
      const second = call({ note: "cười", request_id: requestId });
      const secondResponse = await second;
      release();
      const firstResponse = await first;
      expect(firstResponse.status).toBe(200);
      expect(secondResponse.status).toBe(409);
      expect(await secondResponse.json()).toMatchObject({ code: "DRAW_IN_PROGRESS" });
      expect(state.charges).toBe(1);
      expect(state.uploads).toHaveLength(1);
      expect(state.refunds).toBe(0);
    });

    it("gửi lại sau khi xong thì trả đúng ảnh cũ, không trừ thêm", async () => {
      const firstResponse = await call({ request_id: requestId });
      const first = await firstResponse.json();
      const againResponse = await call({ request_id: requestId });
      const again = await againResponse.json();
      expect(againResponse.status).toBe(200);
      expect(again).toMatchObject({ replayed: true, pointsUsed: 0 });
      expect(again.pose.id).toBe(first.pose.id);
      expect(state.charges).toBe(1);
      expect(state.uploads).toHaveLength(1);
      expect(state.uploads[0]).toContain(`extra-${requestId}`);
    });

    it("mã của lần đã hỏng thì không dùng lại, để lần mới không thành miễn phí", async () => {
      state.uploadError = new Error("storage down");
      expect((await call({ request_id: requestId })).status).toBe(500);
      state.uploadError = null;
      const again = await call({ request_id: requestId });
      expect(again.status).toBe(409);
      expect(await again.json()).toMatchObject({ code: "REQUEST_USED" });
      expect(state.charges).toBe(1);
      expect(state.refunds).toBe(1);
    });

    it("hai lần bấm khác mã là hai ảnh, hai lần trừ", async () => {
      await call({ request_id: requestId });
      await call({ request_id: "7a1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b" });
      expect(state.charges).toBe(2);
      expect(state.uploads).toHaveLength(2);
    });
  });
});
