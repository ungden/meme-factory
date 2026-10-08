import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { access, checkVersion, fail, FilmError } from "@/lib/short-film/server";
import { NATIVE_VOICE_MODEL } from "@/lib/short-film/contracts";
import { nativeSampleWindow } from "@/lib/short-film/native-voice";

const AUDIO_TYPES: Record<string, string> = {
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
};

/**
 * Giọng mẫu để Seedance 2.5 nói đúng một giọng qua mọi clip.
 *
 * Không đi qua khoá giọng của kênh: khoá đó giữ giọng lồng tiếng đã chốt, còn
 * giọng mẫu là thứ riêng của nhánh tự nói và không thay giọng lồng tiếng nào.
 * Chủ kênh tự nghe rồi chọn, nên bản ghi được duyệt ngay khi lưu.
 */
export async function POST(
  r: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const a = await access(r, (await params).id);
    const multipart = (r.headers.get("content-type") || "").includes("multipart/form-data");
    const form = multipart ? await r.formData() : null;
    const body: Record<string, unknown> = form
      ? Object.fromEntries([...form.entries()].filter(([, value]) => typeof value === "string"))
      : await r.json();
    checkVersion(a, body);
    const { data: character } = await a.admin
      .from("characters")
      .select("id,name")
      .eq("id", String(body.characterId || ""))
      .eq("project_id", a.project.id)
      .maybeSingle();
    if (!character) throw new FilmError("Chọn nhân vật của dự án.");
    const direction = String(body.direction || "").replace(/\s+/g, " ").trim().slice(0, 300);
    let settings: Record<string, unknown>;
    if (form) {
      const file = form.get("file");
      const ext = file instanceof File ? AUDIO_TYPES[file.type] : undefined;
      if (!(file instanceof File) || !ext || file.size > 4 * 1024 * 1024)
        throw new FilmError("Chọn file giọng WAV, MP3 hoặc M4A tối đa 4 MB.");
      if (body.rightsConfirmed !== "true")
        throw new FilmError("Xác nhận bạn có quyền dùng giọng trong file này.");
      const seconds = Number(body.seconds);
      if (!Number.isFinite(seconds) || seconds < 3 || seconds > 12)
        throw new FilmError("Giọng mẫu cần dài 3–12 giây.");
      const path = `${a.project.id}/voices/native/${crypto.randomUUID()}.${ext}`;
      const { error } = await a.admin.storage
        .from("content-media")
        .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
      if (error) throw new FilmError("Không lưu được file giọng.");
      settings = { samplePath: path, sampleSeconds: Math.round(seconds * 100) / 100, direction };
    } else {
      const { data: clip } = await a.admin
        .from("short_film_tasks")
        .select("id,kind,status,input,result")
        .eq("id", String(body.sourceTaskId || ""))
        .eq("project_id", a.project.id)
        .maybeSingle();
      const window = nativeSampleWindow(clip, Number(body.inSeconds), Number(body.outSeconds));
      if (!window.ok) throw new FilmError(window.message);
      settings = {
        sourceTaskId: clip!.id,
        inSeconds: window.inSeconds,
        outSeconds: window.outSeconds,
        direction,
      };
    }
    const { data: last } = await a.admin
      .from("character_voice_versions")
      .select("version")
      .eq("character_id", character.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const now = new Date().toISOString();
    const { data: saved, error } = await a.admin
      .from("character_voice_versions")
      .insert({
        project_id: a.project.id,
        workspace_version: a.project.workspace_version,
        character_id: character.id,
        version: (last?.version || 0) + 1,
        model: NATIVE_VOICE_MODEL,
        voice_id: `native-${crypto.randomUUID().slice(0, 8)}`,
        settings,
        created_by: a.user.id,
        approved_by: a.user.id,
        approved_at: now,
      })
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ voice: saved });
  } catch (e) {
    return fail(e);
  }
}
