import { afterEach, describe, it, expect, vi } from "vitest";
import { makeFilmWorker } from "../short-film/worker.mjs";
afterEach(() => vi.unstubAllGlobals());
describe("provider submission checkpoint", () => {
  it("does not send another paid POST when the first response is lost", async () => {
    const task = {
      id: "task",
      project_id: "project",
      kind: "tts",
      status: "running",
      input: {
        model: "minimax/speech-2.6-hd",
        providerInputs: { text: "test" },
      },
      checkpoint: {},
      lease_owner: "owner",
    };
    const db = {
      rpc: vi.fn(async (name, args) => {
        if (name === "claim_film_tasks") return { data: [task] };
        if (name === "checkpoint_film_task") {
          Object.assign(task, args.p_patch);
          task.checkpoint = { ...task.checkpoint, ...args.p_patch.checkpoint };
          return { data: true };
        }
        return { data: true };
      }),
    };
    const fetch = vi.fn(async () => {
      throw new Error("response lost");
    });
    vi.stubGlobal("fetch", fetch);
    const worker = makeFilmWorker(db);
    await worker.tick(false);
    expect(task.status).toBe("reconciling");
    expect(task.checkpoint.submitting).toBe(true);
    task.status = "running";
    await worker.tick(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(task.status).toBe("reconciling");
  });
});

describe("generated image upload recovery", () => {
  it("reuses persisted image bytes after upload failure without calling the model", async () => {
    const task = {
      id: "image-task",
      project_id: "project",
      kind: "image",
      status: "running",
      lease_owner: "owner",
      input: { cast: [] },
      checkpoint: {
        submitting: true,
        generatedImage: {
          data: Buffer.from("generated-image").toString("base64"),
          mimeType: "image/png",
        },
      },
    };
    let uploads = 0;
    const db = {
      rpc: vi.fn(async (name, args) => {
        if (name === "claim_film_tasks") return { data: [task] };
        if (name === "checkpoint_film_task") {
          const previous = task.checkpoint;
          Object.assign(task, args.p_patch);
          task.checkpoint = { ...previous, ...args.p_patch.checkpoint };
        }
        return { data: true };
      }),
      storage: {
        from: () => ({
          info: async () =>
            uploads >= 2
              ? { data: { size: Buffer.byteLength("generated-image") }, error: null }
              : { data: null, error: new Error("missing") },
          upload: async (_path, stream) => {
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            expect(Buffer.concat(chunks).toString()).toBe("generated-image");
            return {
              error: ++uploads === 1 ? new Error("upload unavailable") : null,
            };
          },
        }),
      },
    };
    const fetch = vi.fn(() => {
      throw new Error("No model request allowed");
    });
    vi.stubGlobal("fetch", fetch);
    const worker = makeFilmWorker(db);
    await worker.tick(false);
    expect(task.checkpoint.generatedImage).toBeTruthy();
    expect(task.status).not.toBe("reconciling");
    await worker.tick(false);
    expect(uploads).toBe(2);
    expect(fetch).not.toHaveBeenCalled();
    expect(db.rpc).toHaveBeenCalledWith(
      "complete_film_task",
      expect.objectContaining({ p_id: task.id }),
    );
  });
});
