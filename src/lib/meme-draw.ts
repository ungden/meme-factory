/**
 * Lưu meme "Chỉnh tay" ngay ở máy chủ, trước khi trả ảnh về trình duyệt.
 *
 * Trước đây route vẽ chỉ trả base64; trình duyệt tự gọi /api/meme/save sau đó.
 * Đóng tab trong 10–30 giây chờ là điểm đã trừ mà ảnh không nằm ở đâu cả.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { stripImageMetadata } from "@/lib/image-metadata";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORMATS = ["1:1", "4:5", "9:16", "16:9"] as const;

export function isDrawRequestId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export type DrawSave = {
  original_idea: string;
  generated_content: Record<string, unknown>;
  selected_characters: unknown[];
  has_watermark: boolean;
  format: (typeof FORMATS)[number];
  source_meme_id: string | null;
};

/** Chỉ nhận đúng các trường thư viện cần; mọi thứ khác trong body bị bỏ. */
export function readDrawSave(body: Record<string, unknown>): DrawSave | null {
  const save = body.save;
  if (!save || typeof save !== "object") return null;
  const raw = save as Record<string, unknown>;
  const content =
    raw.generated_content && typeof raw.generated_content === "object" && !Array.isArray(raw.generated_content)
      ? (raw.generated_content as Record<string, unknown>)
      : {};
  return {
    original_idea: typeof raw.original_idea === "string" ? raw.original_idea.slice(0, 2000) : "",
    generated_content: content,
    selected_characters: Array.isArray(raw.selected_characters) ? raw.selected_characters.slice(0, 8) : [],
    has_watermark: raw.has_watermark === true,
    format: FORMATS.includes(body.format as (typeof FORMATS)[number]) ? (body.format as DrawSave["format"]) : "1:1",
    source_meme_id: isDrawRequestId(body.source_meme_id) ? body.source_meme_id : null,
  };
}

export type DrawPrior = {
  meme: { id: string; image_url: string | null } | null;
  job: { status: string } | null;
  paid: boolean;
};

/**
 * Trình duyệt gửi lại cùng mã khi mạng rớt giữa chừng. Mã đó có thể đã:
 * - vẽ xong và lưu → trả lại đúng meme, không trừ thêm;
 * - đang vẽ → báo chờ, không vẽ song song;
 * - từng trừ điểm hoặc từng chạy rồi hỏng → không dùng lại: hàm trừ điểm coi
 *   mã cũ là "đã trừ" nên lần vẽ mới sẽ miễn phí, trong khi khoản cũ đã hoặc
 *   sẽ được hoàn.
 */
export function decideDrawReplay(prior: DrawPrior): "replay" | "busy" | "used" | "fresh" {
  if (prior.meme?.image_url) return "replay";
  if (prior.job && (prior.job.status === "running" || prior.job.status === "queued")) return "busy";
  if (prior.job || prior.paid) return "used";
  return "fresh";
}

export async function readDrawPrior(admin: SupabaseClient, projectId: string, requestId: string): Promise<DrawPrior> {
  const [meme, job, payment] = await Promise.all([
    admin
      .from("memes")
      .select("id,image_url")
      .eq("project_id", projectId)
      .eq("generation_job_id", requestId)
      .maybeSingle(),
    admin.from("generation_jobs").select("status").eq("id", requestId).maybeSingle(),
    admin
      .from("project_transactions")
      .select("id")
      .eq("request_id", requestId)
      .eq("type", "payment")
      .maybeSingle(),
  ]);
  return {
    meme: (meme.data as DrawPrior["meme"]) ?? null,
    job: (job.data as DrawPrior["job"]) ?? null,
    paid: Boolean(payment.data),
  };
}

/** Đường dẫn cố định theo mã vẽ: ghi lại lần hai chỉ đè đúng file đó. */
export function drawStoragePath(projectId: string, requestId: string) {
  return `${projectId}/draw-${requestId}.png`;
}

/**
 * Ghi ảnh, dòng thư viện, và đầu ra của job. Gọi TRƯỚC khi đánh dấu job xong:
 * sweeper hoàn điểm cho job còn "running" mà chưa có đầu ra, nên chết giữa
 * chừng thì người dùng được hoàn chứ không mất cả điểm lẫn ảnh.
 */
export async function persistDrawnMeme(
  admin: SupabaseClient,
  input: { projectId: string; actorUserId: string; requestId: string; imageBase64: string; save: DrawSave },
): Promise<{ id: string; image_url: string }> {
  const stripped = stripImageMetadata(new Uint8Array(Buffer.from(input.imageBase64, "base64")));
  const path = drawStoragePath(input.projectId, input.requestId);
  const { error: uploadError } = await admin.storage
    .from("memes")
    .upload(path, Buffer.from(stripped.bytes), { contentType: "image/png", upsert: true });
  if (uploadError) throw new Error(`MEME_UPLOAD_FAILED:${uploadError.message}`);
  const imageUrl = admin.storage.from("memes").getPublicUrl(path).data.publicUrl;

  const { data: meme, error: memeError } = await admin
    .from("memes")
    .insert({
      project_id: input.projectId,
      original_idea: input.save.original_idea,
      generated_content: input.save.generated_content,
      selected_characters: input.save.selected_characters,
      format: input.save.format,
      has_watermark: input.save.has_watermark,
      image_url: imageUrl,
      status: "completed",
      source_meme_id: input.save.source_meme_id,
      generation_job_id: input.requestId,
    })
    .select("id,image_url")
    .single();
  if (memeError || !meme) throw new Error(`MEME_INSERT_FAILED:${memeError?.message ?? "no row"}`);

  await admin.from("generation_outputs").upsert(
    {
      generation_job_id: input.requestId,
      variant_index: 0,
      object_url: imageUrl,
      metadata: { meme_id: meme.id, format: input.save.format, has_watermark: input.save.has_watermark },
      review_status: "unreviewed",
    },
    { onConflict: "generation_job_id,variant_index" },
  );
  const headline = input.save.generated_content.headline;
  await admin
    .from("project_transactions")
    .update({
      output_kind: "meme",
      output_id: meme.id,
      output_url: imageUrl,
      output_title: typeof headline === "string" && headline ? headline : input.save.original_idea,
    })
    .eq("project_id", input.projectId)
    .eq("actor_user_id", input.actorUserId)
    .eq("request_id", input.requestId)
    .eq("type", "payment");
  return { id: String(meme.id), image_url: imageUrl };
}
