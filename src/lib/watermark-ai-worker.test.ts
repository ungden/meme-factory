import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
vi.mock("@/lib/server-secrets", () => ({ getOpenAiApiKey: async () => "fixture-only" }));
import { processWatermarkJob } from "./watermark-ai-worker";

const baseJob = { id: "job", project_id: "project", user_id: "owner", workspace_version: 1, mode: "generate" as const,
  prompt: "A compact test watermark", model: "gpt-image-1.5", input_image: null, output_image: null, status: "processing", request_id: null,
  max_points: 11, provider_cost_usd: 0.15, lease_owner: "lease" };
let logo: Buffer;
beforeEach(async () => {
  logo = await sharp({ create: { width: 48, height: 48, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await sharp({ create: { width: 24, height: 24, channels: 4, background: "red" } }).png().toBuffer() }]).png().toBuffer();
});
afterEach(() => vi.restoreAllMocks());
function fakeAdmin({ failUpload = false, loseLease = false } = {}) {
  const patches: Record<string, unknown>[] = [];
  let object: Buffer | null = null;
  const rpc = vi.fn(async () => ({ data: true }));
  const upload = vi.fn(async (_path: string, bytes: Buffer) => { if (failUpload) return { error: new Error("storage network") }; object = bytes; return { error: null }; });
  const download = vi.fn(async () => object ? { data: new Blob([new Uint8Array(object)]), error: null } : { error: { statusCode: "404", message: "not found" } });
  const admin = {
    from: (table: string) => {
      const query = {
        select: () => table === "projects" ? query : Promise.resolve({ data: loseLease ? [] : [{ id: "job" }] }),
        update: (patch: Record<string, unknown>) => { patches.push(patch); return query; },
        eq: () => query, gt: () => query,
        maybeSingle: async () => ({ data: { user_id: "owner", workspace_version: 1 } }),
      }; return query;
    }, rpc, storage: { from: () => ({ download, upload, getPublicUrl: () => ({ data: { publicUrl: "https://fixture.invalid/mark.png" } }) }) },
  };
  return { admin: admin as unknown as SupabaseClient, rpc, patches, upload };
}
function providerResult(image: Buffer) { return Response.json({ data: [{ b64_json: image.toString("base64") }], usage: { output_tokens: 1563, input_tokens_details: { text_tokens: 200, image_tokens: 0 } } }); }
describe("watermark worker failure boundaries", () => {
  it("calls OpenAI once, checkpoints before upload and settles after verifying storage", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(providerResult(logo));
    const fake = fakeAdmin(); await processWatermarkJob(fake.admin, { ...baseJob });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("https://api.openai.com/v1/images/generations");
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toMatchObject({ background: "transparent", output_format: "png" });
    expect(fake.patches.some(p => p.status === "saving" && p.output_image)).toBe(true);
    expect(fake.rpc).toHaveBeenCalledWith("finish_watermark_ai", expect.objectContaining({ p_status: "completed", p_points: 4, p_url: "https://fixture.invalid/mark.png" }));
  });
  it("retries only storage from a persisted result after restart", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    const job = { ...baseJob, status: "saving", output_image: logo.toString("base64"), provider_cost_usd: 0.05 };
    const failed = fakeAdmin({ failUpload: true }); await processWatermarkJob(failed.admin, { ...job });
    expect(failed.rpc).not.toHaveBeenCalled();
    expect(failed.patches.at(-1)).toMatchObject({ lease_owner: null });
    const recovered = fakeAdmin(); await processWatermarkJob(recovered.admin, { ...job });
    expect(fetcher).not.toHaveBeenCalled();
    expect(recovered.rpc).toHaveBeenCalledWith("finish_watermark_ai", expect.objectContaining({ p_status: "completed" }));
  });
  it("keeps an uncertain provider request for reconciliation without refund or resubmission", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("response lost"));
    const fake = fakeAdmin(); await processWatermarkJob(fake.admin, { ...baseJob });
    expect(fetcher).toHaveBeenCalledTimes(1); expect(fake.rpc).not.toHaveBeenCalled();
    expect(fake.patches.at(-1)).toMatchObject({ status: "needs_review" });
  });
  it("does not send provider work after losing lease", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch"); const fake = fakeAdmin({ loseLease: true });
    await processWatermarkJob(fake.admin, { ...baseJob }); expect(fetcher).not.toHaveBeenCalled(); expect(fake.rpc).not.toHaveBeenCalled();
  });
  it("refunds an opaque result rather than applying it or regenerating", async () => {
    const opaque = await sharp({ create: { width: 32, height: 32, channels: 3, background: "white" } }).png().toBuffer();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(providerResult(opaque)); const fake = fakeAdmin();
    await processWatermarkJob(fake.admin, { ...baseJob });
    expect(fake.upload).not.toHaveBeenCalled();
    expect(fake.rpc).toHaveBeenCalledWith("finish_watermark_ai", expect.objectContaining({ p_status: "failed", p_points: 0 }));
  });
});
