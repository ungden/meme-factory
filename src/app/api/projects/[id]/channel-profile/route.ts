import { NextRequest, NextResponse } from "next/server";
import { FAMILY_SERIES, type ChannelProfile, type StoryGenre } from "@/lib/family-catalogue";
import { access, fail, latestChannelProfile } from "@/lib/short-film/server";

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
    const profile: ChannelProfile = {
      version,
      writingPolicyVersion: "story-v2",
      positioning,
      audience,
      tone,
      roles: (characters || []).map((character) => ({
        characterId: character.id,
        name: character.name,
        personality: character.personality || character.description || "",
        speechStyle: "",
      })),
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
