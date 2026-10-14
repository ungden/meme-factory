import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  uploadError: null as null | { message: string },
  uploads: [] as string[],
  poses: [] as unknown[],
  charged: vi.fn(),
  refunded: vi.fn(),
}));

const CHARACTER = "11111111-1111-4111-8111-111111111111";
const FACE = `project/film-pack/${CHARACTER}/face-22222222-2222-4222-8222-222222222222.png`;

vi.mock("@/lib/short-film/server", () => ({
  FilmError: class FilmError extends Error {
    constructor(message: string, public status = 400) {
      super(message);
    }
  },
  fail: (error: { message?: string; status?: number }) =>
    Response.json({ error: error.message }, { status: error.status || 500 }),
  latestChannelProfile: vi.fn(async () => null),
  access: vi.fn(async () => ({
    project: { id: "project", user_id: "owner", workspace_version: 2 },
    user: { id: "owner" },
    admin: {
      from: (table: string) => {
        const builder = {
          select: () => builder,
          eq: () => builder,
          insert: async (row: unknown) => {
            state.poses.push(row);
            return { error: null };
          },
          update: () => builder,
          maybeSingle: async () =>
            table === "characters"
              ? { data: { id: CHARACTER, name: "Bánh Bao", description: "cậu bé", avatar_url: null } }
              : { data: { art_direction: "soft_3d" } },
          then: (resolve: (value: unknown) => unknown) => resolve({ error: null }),
        };
        return builder;
      },
      storage: {
        from: () => ({
          upload: async (path: string) => {
            if (state.uploadError) return { error: state.uploadError };
            state.uploads.push(path);
            return { error: null };
          },
          getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn/${path}` } }),
        }),
      },
    },
  })),
}));

vi.mock("@/lib/admin", () => ({
  getSupabaseAdmin: () => ({
    storage: {
      from: () => ({
        download: async () => ({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null }),
        list: async () => ({ data: [] }),
      }),
    },
  }),
}));

vi.mock("@/lib/point-pricing.server", () => ({ getPointCost: async () => 10 }));
vi.mock("@/lib/ai-pricing", () => ({ estimateImageGenerationPrice: () => ({ providerCostUsd: 0.01 }) }));
vi.mock("@/lib/gemini-image", () => ({
  IMAGE_MODEL: "image-model",
  compileCharacterPosePrompt: () => "prompt",
  generateCharacterPose: async () => ({ image: "aW1n" }),
  generateFilmReferenceView: async () => ({ image: "aW1n" }),
}));

// Giữ đúng hợp đồng của chargedCharacterImage: trừ điểm trước, lỗi trong
// `generate` thì hoàn rồi ném tiếp.
vi.mock("@/lib/charged-image", () => ({
  InsufficientPointsError: class InsufficientPointsError extends Error {},
  chargedCharacterImage: async (input: { generate: () => Promise<unknown> }) => {
    state.charged();
    try {
      return { result: await input.generate(), requestId: "request", cost: 10 };
    } catch (error) {
      state.refunded();
      throw error;
    }
  },
}));

import { POST } from "./route";

const post = (body: Record<string, unknown>) =>
  POST(
    new Request("http://local/api/projects/project/film-setup", {
      method: "POST",
      body: JSON.stringify({ workspaceVersion: 2, characterId: CHARACTER, ...body }),
    }) as never,
    { params: Promise.resolve({ id: "project" }) },
  );

describe("film-setup POST", () => {
  beforeEach(() => {
    state.uploadError = null;
    state.uploads = [];
    state.poses = [];
    state.charged.mockClear();
    state.refunded.mockClear();
  });

  it("refunds a pack image when saving it to storage fails", async () => {
    state.uploadError = { message: "storage down" };
    const response = await post({ action: "generate", view: "body", facePath: FACE });
    expect(response.status).toBe(500);
    expect(state.charged).toHaveBeenCalledTimes(1);
    expect(state.refunded).toHaveBeenCalledTimes(1);
  });

  it("refunds the origin image when saving it fails, and records no pose", async () => {
    state.uploadError = { message: "storage down" };
    const response = await post({ action: "origin" });
    expect(response.status).toBe(500);
    expect(state.refunded).toHaveBeenCalledTimes(1);
    expect(state.poses).toEqual([]);
  });

  it("returns the stored image when everything succeeds", async () => {
    const response = await post({ action: "generate", view: "body", facePath: FACE });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.path).toMatch(new RegExp(`^project/film-pack/${CHARACTER}/body-[0-9a-f-]{36}\\.png$`));
    expect(body.url).toBe(`https://cdn/${body.path}`);
    expect(state.uploads).toEqual([body.path]);
    expect(state.refunded).not.toHaveBeenCalled();
  });

  it("speaks the channel's language when the channel changed", async () => {
    const response = await post({ action: "generate", view: "body", facePath: FACE, workspaceVersion: 1 });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("Kênh vừa thay đổi");
  });
});
