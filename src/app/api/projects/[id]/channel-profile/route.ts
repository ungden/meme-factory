import { NextRequest, NextResponse } from "next/server";
import { FAMILY_SERIES, type ChannelProfile, type StoryGenre } from "@/lib/family-catalogue";
import { access, fail, latestChannelProfile } from "@/lib/short-film/server";
import { CHANNEL_VISUAL_DIRECTIONS, channelFilmMedium } from "@/lib/short-film/channel-setup";

const clean = (value: unknown, max: number) => String(value || "").trim().slice(0, max);
const GENRES: StoryGenre[] = ["comedy", "emotion"];

/** The profile is an owner-controlled, versioned contract.  A plan pins its
 * profile version, so changing the Studio setup cannot rewrite a paid draft. */
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
        { error: "Chỉ chủ dự án mới được thay đổi hồ sơ kênh." },
        { status: 403 },
      );
    const body = await request.json().catch(() => ({}));
    const audience = clean(body.audience, 240);
    const tone = clean(body.tone, 500);
    const positioning = clean(body.positioning, 1000);
    const speechRegister = body.speechRegister === "child" ? "child" : "natural";
    const genres = Array.isArray(body.genres)
      ? (body.genres as unknown[]).filter((genre): genre is StoryGenre => typeof genre === "string" && GENRES.includes(genre as StoryGenre)).slice(0, 2)
      : GENRES;
    const relationships = Array.isArray(body.relationships)
      ? (body.relationships as unknown[]).map((value: unknown) => clean(value, 240)).filter(Boolean).slice(0, 12)
      : [];
    const characterIds = Array.isArray(body.characterIds)
      ? (body.characterIds as unknown[]).filter((value: unknown): value is string => typeof value === "string").slice(0, 8)
      : [];
    if (!audience || !tone || !positioning)
      return NextResponse.json(
        { error: "Cần nêu người xem, sắc thái và điều câu chuyện tập trung." },
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
        { error: "Một hoặc nhiều nhân vật không thuộc dự án này." },
        { status: 400 },
      );
    const current = await latestChannelProfile(a);
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
    return NextResponse.json({ profile }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
