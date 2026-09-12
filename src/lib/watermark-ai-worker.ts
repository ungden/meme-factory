import { createHash } from "node:crypto";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOpenAiApiKey } from "@/lib/server-secrets";
import { validateWatermarkImage } from "@/lib/watermark-image";
import { watermarkProviderInput, watermarkUsageCost, watermarkPoints, type WatermarkAiMode } from "@/lib/watermark-ai";

type Job = {
  id: string; project_id: string; user_id: string; workspace_version: number; mode: WatermarkAiMode;
  prompt: string; model: string; input_image: string | null; output_image: string | null;
  status: string; request_id: string | null; max_points: number; provider_cost_usd: number | null; lease_owner: string;
};

export async function processWatermarkJob(admin: SupabaseClient, job: Job) {
  const controller = new AbortController();
  let lost = false;
  const update = async (patch: Record<string, unknown>) => {
    const { data, error } = await admin.from("watermark_ai_jobs").update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", job.id).eq("lease_owner", job.lease_owner).gt("lease_expires_at", new Date().toISOString()).select("id");
    if (error || !data?.length) { lost = true; controller.abort(); throw new Error("WATERMARK_LEASE_LOST"); }
  };
  const heartbeat = setInterval(() => {
    void update({ lease_expires_at: new Date(Date.now() + 90_000).toISOString() }).catch(() => {});
  }, 30_000);
  const finish = async (status: string, points: number, url: string | null, message: string | null) => {
    const { data, error } = await admin.rpc("finish_watermark_ai", {
      p_id: job.id, p_owner: job.lease_owner, p_status: status, p_points: points, p_url: url, p_error: message,
    });
    if (error || !data) throw new Error("WATERMARK_SETTLEMENT_PENDING");
  };
  try {
    const { data: project, error: projectError } = await admin.from("projects").select("user_id,workspace_version").eq("id", job.project_id).maybeSingle();
    if (projectError) throw projectError;
    if (!project || project.user_id !== job.user_id || project.workspace_version !== job.workspace_version) {
      await finish("failed", 0, null, "Dự án đã thay đổi. Đã hoàn điểm giữ cho watermark."); return;
    }
    if (job.status === "processing") {
      let key: string;
      try { key = await getOpenAiApiKey(); }
      catch { await finish("failed", 0, null, "AI watermark chưa sẵn sàng. Đã hoàn điểm."); return; }
      const settings = watermarkProviderInput(job.mode, job.prompt);
      const form = new FormData();
      for (const [name, value] of Object.entries(settings)) form.append(name, String(value));
      if (job.input_image) form.append("image[]", new Blob([new Uint8Array(Buffer.from(job.input_image, "base64"))], { type: "image/png" }), "logo.png");
      await update({ provider_started_at: new Date().toISOString() });
      let response: Response;
      try {
        response = await fetch(`https://api.openai.com/v1/images/${job.mode === "remove_background" ? "edits" : "generations"}`, {
          method: "POST", headers: { Authorization: `Bearer ${key}`, ...(job.mode === "generate" ? { "Content-Type": "application/json" } : {}) },
          body: job.mode === "remove_background" ? form : JSON.stringify(settings),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(180_000)]),
        });
      } catch {
        if (!lost) await update({ status: "needs_review", error: "Chưa xác định AI đã xử lý xong hay chưa. Điểm đang được đối soát; không tạo lại tự động.", lease_owner: null, lease_expires_at: null });
        return;
      }
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500 && response.status !== 408) {
          await finish("failed", 0, null, "AI chưa tạo được watermark từ đầu vào này. Đã hoàn điểm. Hãy kiểm tra ảnh hoặc mô tả trước khi thử lượt mới.");
        } else {
          await update({ status: "needs_review", request_id: response.headers.get("x-request-id"), error: "Nhà cung cấp trả lỗi chưa rõ kết quả. Đang đối soát điểm, không gửi lại tự động.", lease_owner: null, lease_expires_at: null });
        }
        return;
      }
      const body = await response.json();
      const image = body.data?.[0]?.b64_json;
      const cost = watermarkUsageCost(body.usage);
      if (typeof image !== "string" || image.length > 16 * 1024 * 1024) throw new Error("WATERMARK_PROVIDER_OUTPUT_INVALID");
      await update({ status: cost === null ? "needs_review" : "saving", output_image: image, input_image: null, usage: body.usage || null,
        provider_cost_usd: cost, request_id: response.headers.get("x-request-id"),
        ...(cost === null ? { error: "Đã nhận ảnh nhưng thiếu dữ liệu tính phí. Đang đối soát, không sinh ảnh lại.", lease_owner: null, lease_expires_at: null } : {}),
      });
      if (cost === null) return;
      job.output_image = image; job.provider_cost_usd = cost; job.status = "saving";
    }
    if (!job.output_image || job.provider_cost_usd === null) throw new Error("WATERMARK_CHECKPOINT_MISSING");
    let normalized: Awaited<ReturnType<typeof validateWatermarkImage>>;
    try {
      const png = await sharp(Buffer.from(job.output_image, "base64"), { limitInputPixels: 16_777_216 }).png({ compressionLevel: 9 }).toBuffer();
      normalized = await validateWatermarkImage(png);
    } catch {
      await finish("failed", 0, null, "Ảnh AI chưa đạt yêu cầu nền trong suốt. Đã hoàn điểm; không tự chạy lại."); return;
    }
    await update({ error: null });
    const bucket = admin.storage.from("watermarks");
    const path = `${job.user_id}/${job.project_id}/${job.workspace_version}/ai-${job.id}.png`;
    const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
    const existing = await bucket.download(path);
    if (existing.error) {
      const code = String((existing.error as unknown as { statusCode?: string }).statusCode);
      // Only a missing object allows an upload. Permission/network errors must not overwrite it.
      if (code !== "404" && !/not found/i.test(existing.error.message)) throw existing.error;
      const { error } = await bucket.upload(path, normalized.bytes, { contentType: "image/png", cacheControl: "31536000", upsert: false });
      if (error) throw error;
    } else if (hash(Buffer.from(await existing.data.arrayBuffer())) !== hash(normalized.bytes)) {
      throw new Error("WATERMARK_OBJECT_CONFLICT");
    }
    const verified = await bucket.download(path);
    if (verified.error || hash(Buffer.from(await verified.data.arrayBuffer())) !== hash(normalized.bytes)) throw new Error("WATERMARK_UPLOAD_UNVERIFIED");
    // Recheck reset/ownership after a potentially long provider/upload operation.
    const { data: current } = await admin.from("projects").select("user_id,workspace_version").eq("id", job.project_id).maybeSingle();
    if (!current || current.user_id !== job.user_id || current.workspace_version !== job.workspace_version) {
      await finish("failed", 0, null, "Dự án đã thay đổi. Watermark chưa được áp dụng; đã hoàn điểm."); return;
    }
    await finish("completed", watermarkPoints(job.provider_cost_usd, job.max_points), bucket.getPublicUrl(path).data.publicUrl, null);
  } catch {
    if (!lost) {
      // Persisted output is safe to retry; an uncertain provider call is never retried.
      await update(job.status === "saving"
        ? { error: "Đã có ảnh; đang thử lưu lại. Không gọi AI hoặc trừ điểm thêm.", next_poll_at: new Date(Date.now() + 30_000).toISOString(), lease_owner: null, lease_expires_at: null }
        : { status: "needs_review", error: "Tác vụ cần đối soát trước khi tiếp tục. Bản watermark hiện tại vẫn được giữ.", lease_owner: null, lease_expires_at: null }).catch(() => {});
    }
  } finally { clearInterval(heartbeat); }
}
