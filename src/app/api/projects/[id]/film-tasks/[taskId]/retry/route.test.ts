import { describe, expect, it, vi } from "vitest";

const update = vi.fn();
const task = {
  id: "task",
  project_id: "project",
  workspace_version: 4,
  status: "failed",
  kind: "dub",
  run_id: "run",
  checkpoint: { settled: true, failureCount: 3 },
};

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
    admin: {
      from: () => {
        const builder = {
          select: vi.fn(() => builder),
          update: vi.fn((value) => {
            update(value);
            return builder;
          }),
          eq: vi.fn(() => builder),
          single: vi.fn(async () => ({ data: task, error: null })),
          then: (resolve: (value: unknown) => unknown) =>
            resolve({ error: null }),
        };
        return builder;
      },
    },
  })),
}));

import { POST } from "./route";

describe("film task retry", () => {
  it("retries a deterministic dub without requiring a provider checkpoint", async () => {
    const response = await POST(
      new Request("https://aida.vn/api/projects/project/film-tasks/task/retry", {
        method: "POST",
        body: JSON.stringify({ workspaceVersion: 4 }),
      }) as never,
      { params: Promise.resolve({ id: "project", taskId: "task" }) },
    );
    expect(response.status).toBe(202);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "queued",
        error: null,
        checkpoint: expect.objectContaining({ failureCount: 0 }),
      }),
    );
  });
});
