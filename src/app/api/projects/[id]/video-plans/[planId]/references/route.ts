import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import {
  access,
  readPlan,
  checkVersion,
  task,
  storeQuote,
  fail,
  FilmError,
} from "@/lib/short-film/server";
export async function POST(
  r: NextRequest,
  { params }: { params: Promise<{ id: string; planId: string }> },
) {
  try {
    const p = await params;
    const a = await access(r, p.id);
    const form = await r.formData();
    const plan = await readPlan(a, p.planId);
    checkVersion(
      a,
      {
        workspaceVersion: form.get("workspaceVersion"),
        expectedVersion: form.get("expectedVersion"),
      },
      plan,
    );
    const s = plan.video_plan_scenes.find((s) => s.id === form.get("sceneId"));
    if (!s) throw new FilmError("Cảnh không thuộc phim.");
    const referenceImageId = String(form.get("referenceImageId") || "");
    const authoredReference = s.storyboard?.referencePlan?.referenceImages.find(
      (reference) => reference.id === referenceImageId,
    );
    if (!authoredReference)
      throw new FilmError("Chọn đúng vị trí ảnh trong bộ tham chiếu.");
    const visualRequirements =
      s.storyboard?.referencePlan?.requirements.filter((requirement) =>
        authoredReference.requirementIds.includes(requirement.id),
      ) || [];
    const file = form.get("file");
    if (!(file instanceof File) || file.size > 10 * 1024 * 1024)
      throw new FilmError("Chọn ảnh tối đa 10 MB.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const { default: sharp } = await import("sharp");
    const info = await sharp(bytes).metadata();
    if (!info.width || !info.height || Math.min(info.width, info.height) < 720)
      throw new FilmError("Ảnh tham chiếu cần cạnh ngắn từ 720px.");
    const path = `${a.project.id}/films/imports/${crypto.randomUUID()}.png`;
    const { error: upload } = await a.admin.storage
      .from("content-media")
      .upload(path, await sharp(bytes).png().toBuffer(), {
        contentType: "image/png",
      });
    if (upload) throw upload;
    // A reference image guides identity/composition/props; unlike a start frame,
    // it does not need to share the output video's aspect ratio.
    const t = task(
      "image",
      {
        importPath: path,
        cast: s.cast_snapshot,
        format: plan.format,
        referenceImageId,
        referenceRole: authoredReference.role,
        referencePurpose: authoredReference.purpose,
        visualRequirements,
        visualStoryMechanism:
          s.storyboard?.referencePlan?.storyMechanism || "",
        displayName: `Ảnh tham chiếu · ${authoredReference.purpose}`,
        subjectKey: `${s.id}:${s.version}:reference:${referenceImageId}:1`,
      },
      0,
      s,
    );
    return NextResponse.json({ quote: await storeQuote(a, [t], plan) });
  } catch (e) {
    return fail(e);
  }
}
