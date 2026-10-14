import { NextRequest, NextResponse } from "next/server";
import { FAMILY_SERIES, type ChannelProfile, type StoryGenre } from "@/lib/family-catalogue";
import { access, fail, latestChannelProfile } from "@/lib/short-film/server";
import { CHANNEL_VISUAL_DIRECTIONS, channelFilmMedium } from "@/lib/short-film/channel-setup";
import { missingProfileFields, resolveProfileFields } from "@/lib/short-film/channel-profile-fields";

const clean = (value: unknown, max: number) => String(value || "").trim().slice(0, max);
const GENRES: StoryGenre[] = ["comedy", "emotion"];

/**
 * Hồ sơ phim là bản có phiên bản mà mỗi kịch bản ghim, nên đổi hồ sơ không viết
 * lại một bản nháp đã trả tiền. Ba ý người dùng tự viết (người xem, giọng kể,
 * kênh kể gì) lấy từ cột của kênh; xem channel-profile-fields.ts.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const a = await access(request, (await params).id);
    return NextResponse.json({ profile: await latestChannelProfile(a) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const a = await access(request, (await params).id);
    if (a.project.user_id !== a.user.id)
      return NextResponse.json(
        { error: "Chỉ chủ kênh mới đổi được hồ sơ kênh." },
        { status: 403 },
      );
    const body = await request.json().catch(() => ({}));
    const [current, { data: channel }] = await Promise.all([
      latestChannelProfile(a),
      a.admin.from("projects").select("audience,brand_voice,description").eq("id", a.project.id).single(),
    ]);
    const { audience, tone, positioning } = resolveProfileFields(body, channel, current);
    // Không gửi thì giữ lựa chọn cũ: trang Nhân vật lưu dàn nhân vật bằng chính
    // API này mà không biết hai lựa chọn kia, và từng làm chúng về mặc định.
    const speechRegister =
      body.speechRegister === "child" || body.speechRegister === "natural"
        ? body.speechRegister
        : current?.speechRegister || "natural";
    const genres = Array.isArray(body.genres)
      ? (body.genres as unknown[]).filter((genre): genre is StoryGenre => typeof genre === "string" && GENRES.includes(genre as StoryGenre)).slice(0, 2)
      : current?.genres?.length
        ? current.genres
        : GENRES;
    const relationships = Array.isArray(body.relationships)
      ? (body.relationships as unknown[]).map((value: unknown) => clean(value, 240)).filter(Boolean).slice(0, 12)
      : [];
    const characterIds = Array.isArray(body.characterIds)
      ? (body.characterIds as unknown[]).filter((value: unknown): value is string => typeof value === "string").slice(0, 8)
      : (current?.roles || []).map((role) => role.characterId);
    if (missingProfileFields({ audience, tone, positioning }).length)
      return NextResponse.json(
        { error: "Điền đủ người xem, giọng kể và kênh hay kể chuyện gì nhé." },
        { status: 400 },
      );
    const { data: characters, error: characterError } = characterIds.length
      ? await a.admin
          .from("characters")
          .select("id,name,description,personality")
          .eq("project_id", a.project.id)
          .in("id", characterIds)
      : { data: [], error: null };
    if (characterError || (characters || []).length !== characterIds.length)
      return NextResponse.json(
        { error: "Có nhân vật không thuộc kênh này. Tải lại trang rồi chọn lại nhé." },
        { status: 400 },
      );
    const version = Number(current?.version || 0) + 1;
    const { data: dna } = characterIds.length
      ? await a.admin.from("character_dna").select("character_id,art_direction").in("character_id", characterIds)
      : { data: [] };
    const medium = channelFilmMedium(
      characterIds.map((id: string) => dna?.find((row) => row.character_id === id)?.art_direction),
    );
    // Hồ sơ đã có thì gộp vào chứ không dựng lại: kênh đã chăm chút (quan hệ, cách
    // nói của từng vai, tham chiếu, series) không được mất chỉ vì đổi danh sách
    // nhân vật lên phim. Vai giữ nguyên được giữ nguyên mô tả cũ.
    const rolesFor = (characters || []).map((character) => {
      const kept = current?.roles?.find((role) => role.characterId === character.id);
      return (
        kept || {
          characterId: character.id,
          name: character.name,
          personality: character.personality || character.description || "",
          speechStyle: "",
        }
      );
    });
    const profile: ChannelProfile = current
      ? {
          ...current,
          ...(current.visualDirection ? {} : { visualDirection: CHANNEL_VISUAL_DIRECTIONS[medium] }),
          version,
          positioning,
          audience,
          tone,
          roles: rolesFor,
          speechRegister,
          genres: genres.length ? genres : GENRES,
          relationships: Array.isArray(body.relationships) ? relationships : current.relationships || [],
        }
      : {
          visualDirection: CHANNEL_VISUAL_DIRECTIONS[medium],
          version,
          writingPolicyVersion: "story-v2",
          positioning,
          audience,
          tone,
          roles: rolesFor,
          series: FAMILY_SERIES,
          avoid: ["Không áp lời thoại, độ tuổi hoặc quan hệ của kênh khác vào dàn nhân vật này."],
          references: [],
          speechRegister,
          genres: genres.length ? genres : GENRES,
          relationships,
        };
    const { error } = await a.admin.from("channel_profiles").insert({
      project_id: a.project.id,
      workspace_version: a.project.workspace_version,
      version,
      profile,
    });
    if (error) throw error;
    // Ghi hồ sơ trước rồi mới ghi kênh: trigger đồng bộ thấy hai bên đã khớp và
    // không thêm một phiên bản thừa.
    const { error: projectError } = await a.admin
      .from("projects")
      .update({ audience, brand_voice: tone, description: positioning })
      .eq("id", a.project.id);
    if (projectError) throw projectError;
    return NextResponse.json({ profile }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
