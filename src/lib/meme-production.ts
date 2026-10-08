import "server-only";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateMemeContent, type MemeContentResult } from "@/lib/gemini";
import type { GenerateMemeImageParams } from "@/lib/gemini-image";
import { planMemeImage, runMemeImage } from "@/lib/meme-image";
import { buildAutoVisualPrompt } from "@/lib/meme-visual-prompt";
import { spendProjectPoints } from "@/lib/project-points";
import { POINT_LABELS } from "@/lib/point-pricing";
import { assertPriceCoversCost, getPointCost } from "@/lib/point-pricing.server";
import { stripImageMetadata } from "@/lib/image-metadata";
import { suggestHashtags } from "@/lib/post-text";
import { isArtDirectionId } from "@/lib/mascot-art-direction";
import {
  buildMemeIdea,
  memeRetryDelaySeconds,
  normalizeMemeOptions,
  pickMemeVariation,
} from "@/lib/meme-autopilot";

export type MemeRun = {
  id: string;
  project_id: string;
  workspace_version: number;
  source: "manual" | "scheduled";
  intent: string;
  options: Record<string, unknown>;
  status: string;
  checkpoint: {
    copy?: MemeContentResult;
    idea?: string;
    charge?: { requestId: string; settled: boolean };
  };
  attempts: number;
  lease_owner: string | null;
  created_by: string;
};

/** Lỗi người dùng phải tự xử lý (hết điểm, kênh chưa có ảnh nhân vật): thử lại cũng vô ích. */
class FinalMemeError extends Error {}

type Admin = SupabaseClient;

async function inline(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error("MEME_REFERENCE_FETCH_FAILED");
  return {
    mimeType: response.headers.get("content-type") || "image/png",
    base64: Buffer.from(await response.arrayBuffer()).toString("base64"),
  };
}

async function patchRun(admin: Admin, run: MemeRun, patch: Record<string, unknown>) {
  const { error } = await admin
    .from("meme_production_runs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", run.id)
    .eq("lease_owner", run.lease_owner);
  if (error) throw error;
}

/**
 * Lần thử trước có thể chết sau khi trừ điểm mà trước khi ghi job — sweeper chỉ
 * hoàn theo job nên khoản đó sẽ treo mãi. Hoàn nó ở đây, và chỉ khi khoản trừ
 * thật sự tồn tại: hàm hoàn không tự kiểm điều đó.
 */
async function settleStaleCharge(admin: Admin, run: MemeRun) {
  const charge = run.checkpoint.charge;
  if (!charge || charge.settled) return null;
  const { data: saved } = await admin
    .from("memes")
    .select("id")
    .eq("project_id", run.project_id)
    .eq("generation_job_id", charge.requestId)
    .maybeSingle();
  if (saved) return saved.id as string;
  const { data: payment } = await admin
    .from("project_transactions")
    .select("amount")
    .eq("request_id", charge.requestId)
    .eq("type", "payment")
    .maybeSingle();
  if (payment)
    await admin.rpc("atomic_refund_project_points", {
      _project_id: run.project_id,
      _actor_user_id: run.created_by,
      _cost: Math.abs(Number(payment.amount)),
      _description: `Hoàn ${Math.abs(Number(payment.amount))} điểm — lượt làm meme không hoàn tất`,
      _request_id: charge.requestId,
      _ai_action: "meme",
      _metadata: { reason: "meme_run_retry" },
    });
  await admin
    .from("generation_jobs")
    .update({ status: "failed", error: { code: "ABANDONED" }, completed_at: new Date().toISOString() })
    .eq("id", charge.requestId)
    .in("status", ["queued", "running"]);
  run.checkpoint = { ...run.checkpoint, charge: { ...charge, settled: true } };
  return null;
}

/**
 * Làm trọn một meme cho một lượt đã được nhận (có lease): ý tưởng → chữ → ảnh →
 * lưu vào thư viện. Mọi thứ chạy ở server nên đóng trình duyệt không mất ảnh.
 */
export async function processMemeRun(admin: Admin, run: MemeRun): Promise<"completed" | "retry" | "failed"> {
  try {
    const alreadySaved = await settleStaleCharge(admin, run);
    if (alreadySaved) {
      await patchRun(admin, run, {
        status: "completed",
        phase: "completed",
        meme_id: alreadySaved,
        checkpoint: { ...run.checkpoint, charge: { ...run.checkpoint.charge!, settled: true } },
        completed_at: new Date().toISOString(),
        lease_expires_at: null,
      });
      return "completed";
    }
    const { data: project } = await admin
      .from("projects")
      .select("id,user_id,name,style_prompt,brand_voice,audience,content_guidelines,default_format,watermark_url,creator_handle,workspace_version")
      .eq("id", run.project_id)
      .single();
    if (!project || project.workspace_version !== run.workspace_version) throw new FinalMemeError("Dự án vừa thay đổi; lượt này dừng.");
    const options = normalizeMemeOptions(run.options);
    const { data: profileRow } = await admin
      .from("channel_profiles")
      .select("profile")
      .eq("project_id", project.id)
      .eq("workspace_version", project.workspace_version)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const profile = (profileRow?.profile || null) as {
      positioning?: string;
      audience?: string;
      tone?: string;
      roles?: Array<{ characterId: string }>;
    } | null;

    const { data: allCharacters } = await admin
      .from("characters")
      .select("id,name,description,personality,avatar_url,character_poses(id,emotion,name,image_url)")
      .eq("project_id", project.id);
    const roleIds = (profile?.roles || []).map((role) => role.characterId);
    const wanted = options.characterIds?.length ? options.characterIds : roleIds;
    const characters = options.noCharacters
      ? []
      : (allCharacters || []).filter((c) => !wanted.length || wanted.includes(c.id)).slice(0, 4);

    // 1. Chữ: viết một lần rồi giữ trong checkpoint.
    let copy = run.checkpoint.copy;
    if (!copy) {
      await patchRun(admin, run, { phase: "copy" });
      const { data: recent } = await admin
        .from("memes")
        .select("original_idea,generated_content")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false })
        .limit(20);
      const recentHeadlines = (recent || []).map(
        (m) => String((m.generated_content as { headline?: string } | null)?.headline || m.original_idea || ""),
      );
      const idea = buildMemeIdea({
        intent: run.intent,
        positioning: profile?.positioning,
        audience: profile?.audience || project.audience || undefined,
        tone: profile?.tone || project.brand_voice || undefined,
        recentHeadlines,
      });
      const editorial = [
        project.style_prompt,
        project.brand_voice && `Giọng viết: ${project.brand_voice}`,
        project.audience && `Đối tượng đọc: ${project.audience}`,
        project.content_guidelines && `Hướng dẫn nội dung: ${project.content_guidelines}`,
      ]
        .filter(Boolean)
        .join("\n");
      const variations = await generateMemeContent({
        idea,
        projectStyle: editorial || undefined,
        characters: characters.map((c) => ({
          id: c.id,
          name: c.name,
          personality: c.personality || "",
          description: c.description || "",
          available_emotions: ((c.character_poses as { emotion: string }[]) || []).map((p) => p.emotion),
        })),
        noCharacters: options.noCharacters || !characters.length,
        numVariations: 3,
      });
      const picked = pickMemeVariation(variations, recentHeadlines);
      if (!picked) throw new Error("MEME_COPY_EMPTY");
      copy = picked;
      run.checkpoint = { ...run.checkpoint, copy, idea };
      await patchRun(admin, run, { phase: "image", checkpoint: run.checkpoint });
    }

    // 2. Ảnh: dựng tham số giống hệt trang Tạo ảnh.
    const imageCharacters: GenerateMemeImageParams["characters"] = [];
    for (const suggestion of copy.suggested_characters || []) {
      const character = characters.find((c) => c.id === suggestion.character_id);
      if (!character) continue;
      const poses = (character.character_poses as { id: string; emotion: string; image_url: string }[]) || [];
      const pose = poses.find((p) => p.emotion === suggestion.suggested_emotion) || poses[0];
      const ref = pose?.image_url || character.avatar_url;
      if (!ref || !/^https:\/\//i.test(ref)) continue;
      const image = await inline(ref);
      imageCharacters.push({
        name: character.name,
        emotion: suggestion.suggested_emotion || "neutral",
        description: [character.description, character.personality ? `Tính cách: ${character.personality}` : ""]
          .filter(Boolean)
          .join(". "),
        characterId: character.id,
        poseId: pose?.id,
        poseImageBase64: image.base64,
        poseMimeType: image.mimeType,
      });
    }
    const { data: dna } = imageCharacters[0]?.characterId
      ? await admin.from("character_dna").select("art_direction").eq("character_id", imageCharacters[0].characterId).maybeSingle()
      : { data: null };
    let logo: { base64?: string; mimeType?: string } = {};
    if (project.watermark_url) logo = await inline(project.watermark_url).catch(() => ({}));
    const format = options.format || (["1:1", "4:5", "9:16", "16:9"].includes(project.default_format) ? project.default_format : "1:1");
    const plan = planMemeImage({
      artDirection: isArtDirectionId(dna?.art_direction) ? dna!.art_direction : undefined,
      headline: copy.headline,
      subtext: copy.subtext,
      tone: copy.tone || "hài hước",
      textPosition: copy.text_position === "split" ? "top" : copy.text_position || "top",
      characters: imageCharacters,
      format,
      style: project.style_prompt || undefined,
      customPrompt: buildAutoVisualPrompt(copy) || undefined,
      watermark: {
        enabled: true,
        text: (project.creator_handle || project.name || "").trim() || undefined,
        logoBase64: logo.base64,
        logoMimeType: logo.mimeType,
      },
    });

    // 3. Trừ điểm. Mã giao dịch vào checkpoint TRƯỚC khi trừ: chết giữa chừng thì
    // lần thử sau tìm ra khoản này để hoàn.
    const cost = await getPointCost("meme");
    if (cost > 0) await assertPriceCoversCost("meme", cost);
    const requestId = crypto.randomUUID();
    run.checkpoint = { ...run.checkpoint, charge: { requestId, settled: false } };
    await patchRun(admin, run, { phase: "charge", checkpoint: run.checkpoint });
    if (cost > 0) {
      const spent = await spendProjectPoints(async (name, args) => admin.rpc(name, args), {
        projectId: project.id,
        projectOwnerId: String(project.user_id),
        actorUserId: run.created_by,
        cost,
        description: `${POINT_LABELS.meme} (-${cost} điểm)`,
        requestId,
        aiAction: "meme",
        metadata: { type: "meme", project_id: project.id, meme_run_id: run.id },
        projectName: String(project.name || ""),
      });
      if (!spent.ok && spent.code === "INSUFFICIENT_POINTS") {
        run.checkpoint = { ...run.checkpoint, charge: { requestId, settled: true } };
        throw new FinalMemeError(`Không đủ điểm: mỗi meme cần ${cost} điểm, ví đang có ${spent.available} điểm.`);
      }
      if (!spent.ok) throw new Error("MEME_CHARGE_FAILED");
    }
    const { error: jobError } = await admin.from("generation_jobs").insert({
      id: requestId,
      project_id: project.id,
      creation_kind: "meme",
      workflow_version: "meme-autopilot-v1",
      provider: plan.recipe.provider,
      model: plan.recipe.model,
      continuity_policy: plan.recipe.policy,
      status: "running",
      compiled_prompt: plan.recipe.prompt,
      reference_manifest: plan.recipe.references,
      dropped_references: plan.recipe.droppedReferences,
      manifest_hash: plan.recipe.manifestHash,
      requested_output: plan.recipe.output,
      estimated_points: cost,
      estimated_cost_usd: plan.priceEstimate.providerCostUsd,
      created_by: run.created_by,
      started_at: new Date().toISOString(),
    });
    if (jobError) throw jobError;

    await patchRun(admin, run, { phase: "image" });
    const result = await runMemeImage(plan);

    // 4. Lưu vào thư viện.
    const stripped = stripImageMetadata(new Uint8Array(Buffer.from(result.image, "base64")));
    const path = `${project.id}/auto-${run.id}.png`;
    const { error: uploadError } = await admin.storage
      .from("memes")
      .upload(path, Buffer.from(stripped.bytes), { contentType: "image/png", upsert: true });
    if (uploadError) throw uploadError;
    const imageUrl = admin.storage.from("memes").getPublicUrl(path).data.publicUrl;
    const hashtags = suggestHashtags(copy.headline, project.name);
    const { data: meme, error: memeError } = await admin
      .from("memes")
      .insert({
        project_id: project.id,
        original_idea: run.checkpoint.idea || run.intent || copy.headline,
        generated_content: {
          headline: copy.headline,
          subtext: copy.subtext,
          caption: copy.caption,
          hashtags,
          tone: copy.tone,
          text_position: copy.text_position,
        },
        selected_characters: imageCharacters.map((c) => ({
          character_id: c.characterId,
          character_name: c.name,
          emotion: c.emotion,
          pose_id: c.poseId,
        })),
        format,
        has_watermark: true,
        image_url: imageUrl,
        status: "completed",
        generation_job_id: requestId,
      })
      .select("id")
      .single();
    if (memeError) throw memeError;
    await admin.from("generation_outputs").upsert(
      {
        generation_job_id: requestId,
        variant_index: 0,
        object_url: imageUrl,
        metadata: { meme_id: meme.id, format, has_watermark: true, meme_run_id: run.id },
        review_status: "unreviewed",
      },
      { onConflict: "generation_job_id,variant_index" },
    );
    await admin
      .from("project_transactions")
      .update({ output_kind: "meme", output_id: meme.id, output_url: imageUrl, output_title: copy.headline })
      .eq("request_id", requestId)
      .eq("type", "payment");
    await admin
      .from("generation_jobs")
      .update({ status: "completed", actual_points: cost, usage: result.usage ?? null, completed_at: new Date().toISOString() })
      .eq("id", requestId);
    run.checkpoint = { ...run.checkpoint, charge: { requestId, settled: true } };
    await patchRun(admin, run, {
      status: "completed",
      phase: "completed",
      meme_id: meme.id,
      checkpoint: run.checkpoint,
      error: null,
      completed_at: new Date().toISOString(),
      lease_expires_at: null,
    });
    return "completed";
  } catch (error) {
    // Hoàn ngay khoản đã trừ của lần thử này (nếu có), rồi thử lại hoặc dừng.
    await settleStaleCharge(admin, run).catch((cause) => console.error("meme refund failed", { runId: run.id, cause }));
    const final = error instanceof FinalMemeError || run.attempts >= 3;
    const message =
      error instanceof FinalMemeError
        ? error.message
        : "AI chưa làm xong meme này. Hệ thống sẽ tự thử lại.";
    console.error("meme run failed", { runId: run.id, attempt: run.attempts, error });
    await patchRun(admin, run, {
      status: final ? "failed" : "queued",
      error: final && !(error instanceof FinalMemeError) ? "AI chưa làm được meme này sau ba lần thử." : message,
      checkpoint: run.checkpoint,
      next_attempt_at: new Date(Date.now() + memeRetryDelaySeconds(run.attempts) * 1000).toISOString(),
      lease_expires_at: null,
      ...(final ? { completed_at: new Date().toISOString() } : {}),
    }).catch((cause) => console.error("meme run patch failed", { runId: run.id, cause }));
    return final ? "failed" : "retry";
  }
}
