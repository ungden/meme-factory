import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  access,
  fail,
  FilmError,
  readPlan,
  storeQuote,
  task,
} from "@/lib/short-film/server";
import { readFilmSegments } from "@/lib/short-film/segment-server";

type Context = {
  params: Promise<{ id: string; planId: string; segmentId: string }>;
};

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const { id, planId, segmentId } = await params;
    const auth = await access(request, id);
    const plan = await readPlan(auth, planId);
    const form = await request.formData();
    if (Number(form.get("workspaceVersion")) !== auth.project.workspace_version)
      throw new FilmError("Workspace đã thay đổi. Hãy tải lại trước khi chọn ảnh.", 409);
    if (Number(form.get("expectedVersion")) !== plan.version)
      throw new FilmError("Kịch bản đã đổi. Hãy tải lại trước khi chọn ảnh.", 409);
    const segment = (await readFilmSegments(auth, plan)).find(
      (item) => item.segmentId === segmentId,
    );
    if (!segment) throw new FilmError("Không tìm thấy đoạn trong phim.", 404);
    if (
      segment.revision < 1 ||
      Number(form.get("expectedRevision")) !== segment.revision
    )
      throw new FilmError("Đoạn đã thay đổi. Hãy tải lại trước khi chọn ảnh.", 409);

    const file = form.get("file");
    if (!(file instanceof File) || file.size <= 0 || file.size > 10 * 1024 * 1024)
      throw new FilmError("Chọn ảnh tối đa 10 MB.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const { default: sharp } = await import("sharp");
    const image = sharp(bytes, { failOn: "error" });
    const info = await image.metadata();
    if (!info.width || !info.height || Math.min(info.width, info.height) < 720)
      throw new FilmError("Ảnh mở cần cạnh ngắn từ 720px.");
    const [widthRatio, heightRatio] = plan.format.split(":").map(Number);
    const ratio = widthRatio / heightRatio;
    if (!Number.isFinite(ratio) || Math.abs(info.width / info.height - ratio) > 0.04)
      throw new FilmError(`Ảnh mở phải đúng tỷ lệ ${plan.format}.`);

    const png = await image.png().toBuffer();
    const checksum = crypto.createHash("sha256").update(png).digest("hex");
    const path = `${auth.project.id}/films/segment-frames/${segmentId}/r${segment.revision}-${checksum}.png`;
    const { error: uploadError } = await auth.admin.storage
      .from("content-media")
      .upload(path, png, { contentType: "image/png", upsert: true });
    if (uploadError) throw uploadError;

    const scene = plan.video_plan_scenes.find((item) => item.id === segment.sceneId);
    if (!scene) throw new FilmError("Cảnh của đoạn không còn tồn tại.", 409);
    const quotedTask = task(
      "image",
      {
        importPath: path,
        checksum,
        cast: scene.cast_snapshot,
        format: plan.format,
        segmentId,
        segmentRevision: segment.revision,
        sourceSceneId: scene.id,
        sourceSceneVersion: scene.version,
        subjectKey: `${segmentId}:${segment.revision}:image:import:${checksum}`,
      },
      0,
    );
    return NextResponse.json({
      quote: await storeQuote(auth, [quotedTask], plan),
    });
  } catch (error) {
    return fail(error);
  }
}
