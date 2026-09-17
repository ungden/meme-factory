import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  update: vi.fn(),
  task: {} as Record<string, unknown>,
}));

vi.mock("@/lib/short-film/server", () => ({
  FilmError: class FilmError extends Error {
    constructor(message: string, public status = 400) {
      super(message);
    }
  },
  checkVersion: vi.fn(),
  fail: (error: { message?: string; status?: number }) =>
    Response.json({ error: error.message }, { status: error.status || 500 }),
  access: vi.fn(async () => ({
    project: { id: "project", workspace_version: 4 },
    user: { id: "user" },
    admin: {
      rpc: vi.fn(async () => ({ error: null })),
      from: () => {
        const builder = {
          select: vi.fn(() => builder),
          update: vi.fn((value) => {
            state.update(value);
            return builder;
          }),
          eq: vi.fn(() => builder),
          single: vi.fn(async () => ({ data: state.task, error: null })),
          then: (resolve: (value: unknown) => unknown) => resolve({ error: null }),
        };
        return builder;
      },
    },
  })),
}));

import { POST } from "./route";

const call = (body: Record<string, unknown>) =>
  POST(
    new Request("https://aida.vn/api/projects/project/film-tasks/task", {
      method: "POST",
      body: JSON.stringify({ workspaceVersion: 4, ...body }),
    }) as never,
    { params: Promise.resolve({ id: "project", taskId: "task" }) },
  );

beforeEach(() => {
  state.update.mockReset();
  state.task = {
    id: "task",
    kind: "image",
    status: "completed",
    approved_at: null,
    auto_accepted_at: null,
    production_run_id: "run",
    checkpoint: { providerCompleted: true },
  };
});

describe("film task regenerate", () => {
  it("detaches a wrong result from its run so the run rebuilds that step", async () => {
    const response = await call({ action: "regenerate", reason: "Bố đi giày, kịch bản chân trần" });
    expect(response.status).toBe(200);
    expect(state.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        production_run_id: null,
        error: "Người duyệt yêu cầu tạo lại: Bố đi giày, kịch bản chân trần",
        checkpoint: expect.objectContaining({ regenerationRequested: true, providerCompleted: true }),
      }),
    );
  });

  it("requires a reason and refuses results that were already accepted", async () => {
    expect((await call({ action: "regenerate", reason: " " })).status).toBe(400);
    state.task.auto_accepted_at = "2026-09-17T00:00:00Z";
    expect((await call({ action: "regenerate", reason: "sai mặt" })).status).toBe(409);
    expect(state.update).not.toHaveBeenCalled();
  });
});
