import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { writeBodyWithLimit } from "../short-film/media.mjs";
import {
  assertMediaSize,
  sha256File,
  STANDARD_UPLOAD_MAX_BYTES,
  uploadMedia,
  VIDEO_MAX_BYTES,
} from "../short-film/storage.mjs";

const dirs = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("media size ceiling", () => {
  it("accepts exactly 1 GiB of video and rejects the next byte", () => {
    expect(() => assertMediaSize(VIDEO_MAX_BYTES, "video/mp4")).not.toThrow();
    expect(() => assertMediaSize(VIDEO_MAX_BYTES + 1, "video/mp4")).toThrow(
      "Video vượt giới hạn 1 GiB.",
    );
    expect(() => assertMediaSize(100 * 1024 ** 2 + 1, "image/png")).toThrow(
      "Media không phải video vượt giới hạn 100 MiB.",
    );
  });

  it("stops a body without Content-Length at the real byte limit", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "aida-limit-test-"));
    dirs.push(dir);
    const body = Readable.toWeb(Readable.from([Buffer.alloc(5), Buffer.alloc(6)]));
    await expect(writeBodyWithLimit(body, path.join(dir, "media"), 10)).rejects.toThrow(
      "Media vượt giới hạn thực đọc.",
    );
  });
});

describe("Supabase resumable upload", () => {
  it("resumes from a saved TUS offset and verifies the stored object", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "aida-tus-test-"));
    dirs.push(dir);
    const file = path.join(dir, "video.mp4");
    const size = STANDARD_UPLOAD_MAX_BYTES + 17;
    await writeFile(file, Buffer.alloc(size, 7));
    const sha256 = await sha256File(file);
    const storagePath = `project/task/${sha256.slice(0, 16)}-video.mp4`;
    const uploadUrl = "https://project.storage.supabase.co/storage/v1/upload/resumable/id";
    let offset = STANDARD_UPLOAD_MAX_BYTES;
    const checkpoints = [];
    const storage = {
      info: vi.fn(async () =>
        offset === size ? { data: { size }, error: null } : { data: null, error: new Error("missing") },
      ),
      upload: vi.fn(),
    };
    const fetchImpl = vi.fn(async (_url, options) => {
      if (options.method === "HEAD")
        return new Response(null, { status: 200, headers: { "upload-offset": String(offset) } });
      if (options.method === "PATCH") {
        expect(Number(options.headers["upload-offset"])).toBe(offset);
        offset += options.body.length;
        return new Response(null, { status: 204, headers: { "upload-offset": String(offset) } });
      }
      throw new Error(`Unexpected ${options.method}`);
    });
    const result = await uploadMedia({
      db: { storage: { from: () => storage } },
      prefix: "project/task",
      file,
      name: "video.mp4",
      mime: "video/mp4",
      previous: { uploadUrl, storagePath, sha256, size, offset },
      onCheckpoint: async (state) => checkpoints.push(state),
      supabaseUrl: "https://project.supabase.co",
      serviceRoleKey: "service-role-test",
      fetchImpl,
    });
    expect(result).toMatchObject({ storagePath, size, sha256, completed: true });
    expect(storage.upload).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(checkpoints.at(-1)).toMatchObject({ offset: size, completed: true });
  });
});
