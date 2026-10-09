import { NextRequest, NextResponse } from "next/server";
import { access, fail, FilmError } from "@/lib/short-film/server";
import { isChannelLook, lookArtDirection } from "@/lib/channel-draft";

/**
 * Thêm một nhân vật vào kho của kênh, kèm kiểu hình để mọi ảnh vẽ sau (ảnh gốc,
 * bộ ảnh chuẩn, biểu cảm) cùng một chất. Chưa có ảnh: bước vẽ hoặc tải ảnh lên
 * đi sau, có giá rõ ràng.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const a = await access(request, (await params).id);
    const body = await request.json().catch(() => ({}));
    const name = String(body?.name || "").replace(/\s+/g, " ").trim().slice(0, 40);
    const description = String(body?.description || "").replace(/\s+/g, " ").trim().slice(0, 1200);
    const personality = String(body?.personality || "").replace(/\s+/g, " ").trim().slice(0, 600);
    if (!name) throw new FilmError("Đặt tên cho nhân vật.");
    if (description.length < 10) throw new FilmError("Tả ngoại hình nhân vật để AI vẽ đúng người.");
    const { data: character, error } = await a.admin
      .from("characters")
      .insert({ project_id: a.project.id, name, description, personality })
      .select("id,name,description,personality,avatar_url")
      .single();
    if (error || !character) throw error || new Error("CHARACTER_INSERT_FAILED");
    const { error: dnaError } = await a.admin.from("character_dna").upsert({
      character_id: character.id,
      summary: description,
      art_direction: lookArtDirection(isChannelLook(body?.look) ? body.look : "animated"),
      updated_by: a.user.id,
    });
    if (dnaError) throw dnaError;
    return NextResponse.json({ character }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
