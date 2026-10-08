import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { access, checkVersion, fail, FilmError } from "@/lib/short-film/server";
import { NATIVE_VOICE_MODEL } from "@/lib/short-film/contracts";
import { nativeSampleWindow, wavDurationSeconds } from "@/lib/short-film/native-voice";

// Kho content-media chỉ nhận audio/wav và audio/mpeg; nhận thêm kiểu khác là
// lần tải nào cũng hỏng ở bước lưu.
const AUDIO_TYPES: Record<string, { ext: string; mime: string }> = {
  "audio/wav": { ext: "wav", mime: "audio/wav" },
  "audio/x-wav": { ext: "wav", mime: "audio/wav" },
  "audio/wave": { ext: "wav", mime: "audio/wav" },
  "audio/mpeg": { ext: "mp3", mime: "audio/mpeg" },
};
/** MP3 không đọc được độ dài ở đây; 400 KB ở 192 kbps là khoảng 16 giây. */
const MAX_MP3_BYTES = 400 * 1024;

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
      const type = file instanceof File ? AUDIO_TYPES[file.type] : undefined;
      if (!(file instanceof File) || !type || file.size > 4 * 1024 * 1024)
        throw new FilmError("Chọn file giọng WAV hoặc MP3 tối đa 4 MB.");
      if (body.rightsConfirmed !== "true")
        throw new FilmError("Xác nhận bạn có quyền dùng giọng trong file này.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const measured = type.ext === "wav" ? wavDurationSeconds(bytes) : null;
      if (type.ext === "wav" && measured === null) throw new FilmError("Không đọc được file WAV này.");
      if (type.ext === "mp3" && bytes.length > MAX_MP3_BYTES)
        throw new FilmError("File MP3 quá dài; giọng mẫu chỉ cần 3–12 giây.");
      const seconds = measured ?? Number(body.seconds);
      if (!Number.isFinite(seconds) || seconds < 3 || seconds > 12)
        throw new FilmError("Giọng mẫu cần dài 3–12 giây.");
      const path = `${a.project.id}/voices/native/${crypto.randomUUID()}.${type.ext}`;
      const { error } = await a.admin.storage
        .from("content-media")
        .upload(path, Buffer.from(bytes), { contentType: type.mime });
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
