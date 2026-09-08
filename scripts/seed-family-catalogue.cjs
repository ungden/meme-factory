/* eslint-disable @typescript-eslint/no-require-imports -- CJS bootstrap transpiles the shared TypeScript importer without adding a runtime dependency. */
/* Run with the existing service environment. Explicit project + workspace, no media requests. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
const { createClient } = require("@supabase/supabase-js");
const {
  buildFamilyPilot,
  familyPersonalities,
} = require("../src/lib/family-pilot.ts");
const projectId = process.argv[2];
if (projectId !== "0eed3bc2-b0e9-499a-afc4-b4ac425b44d2")
  throw new Error("Pass the explicit Bánh Bao project ID.");
const db = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const value = async (q) => {
  const { data, error } = await q;
  if (error) throw error;
  return data;
};
const hash = (v) =>
  crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");
const uuid = (key) => {
  const h = hash(key);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
(async () => {
  const p = await value(
    db
      .from("projects")
      .select("id,name,user_id,workspace_version")
      .eq("id", projectId)
      .single(),
  );
  if (p.name !== "Bánh Bao & Đậu Đỏ" || p.workspace_version !== 1)
    throw new Error("Project/workspace changed.");
  const chars = await value(
    db
      .from("characters")
      .select("id,name,description,continuity_asset_id")
      .eq("project_id", p.id),
  );
  const cast = [];
  for (const c of chars) {
    if (!familyPersonalities[c.name]) continue;
    const v = await value(
      db
        .from("asset_versions")
        .select("id,version,reference_images(image_url,is_primary)")
        .eq("asset_id", c.continuity_asset_id)
        .eq("status", "locked")
        .order("version", { ascending: false })
        .limit(1)
        .single(),
    );
    const image = v.reference_images.find((r) => r.is_primary)?.image_url;
    if (!image) throw new Error("Missing approved reference");
    cast.push({
      characterId: c.id,
      name: c.name,
      description: c.description,
      personality: familyPersonalities[c.name],
      imageUrl: image,
      referenceImages: [image],
      assetVersionId: v.id,
      assetVersion: v.version,
    });
  }
  const inputPath = process.argv[3];
  if (!inputPath) throw new Error("Pass the reviewed local script JSON path.");
  const { profile, plans } = buildFamilyPilot(
    cast,
    JSON.parse(fs.readFileSync(inputPath, "utf8")),
  );
  if (
    plans.length !== 12 ||
    plans.filter((p) => p.group === "siblings").length !== 8 ||
    plans.filter((p) => p.group === "child_parent").length !== 3 ||
    plans.filter((p) => p.group === "family").length !== 1
  )
    throw new Error("Pilot distribution must be 8/3/1.");
  const prior = await value(
    db
      .from("channel_profiles")
      .select("profile")
      .eq("project_id", p.id)
      .eq("workspace_version", 1)
      .eq("version", 1)
      .maybeSingle(),
  );
  if (prior) {
    const stable = (o) =>
      JSON.stringify(o, function (k, v) {
        return v && !Array.isArray(v) && typeof v === "object"
          ? Object.fromEntries(
              Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
            )
          : v;
      });
    if (stable(prior.profile) !== stable(profile))
      throw new Error("Profile v1 changed; create v2 instead.");
  }
  if (!prior)
    await value(
      db
        .from("channel_profiles")
        .insert({
          project_id: p.id,
          workspace_version: 1,
          version: 1,
          profile,
        }),
    );
  for (const c of cast)
    await value(
      db
        .from("characters")
        .update({ personality: familyPersonalities[c.name] })
        .eq("id", c.characterId)
        .eq("project_id", p.id),
    );
  const lines = [
    "# Bánh Bao & Đậu Đỏ — 12 kịch bản thử",
    "Bản chữ chưa duyệt. Không có job media hoặc thu điểm từ thao tác nhập catalogue.",
    "",
  ];
  let created = 0;
  for (const e of plans) {
    const planId = uuid([p.id, 1, e.catalogueKey]);
    const exists = await value(
      db
        .from("video_plans")
        .select("id,version,story")
        .eq("id", planId)
        .maybeSingle(),
    );
    const rows = e.scenes.map((s, i) => {
      const {
        characterIds,
        speakerCharacterId,
        dialogue,
        action,
        setting,
        camera,
        durationSeconds,
        imagePrompt,
        motionPrompt,
        followsPrevious,
      } = s;
      const row = {
        cast_snapshot: cast.filter((c) => characterIds.includes(c.characterId)),
        speaker_character_id: speakerCharacterId,
        dialogue,
        action,
        setting,
        camera,
        duration_seconds: durationSeconds,
        start_image_url: null,
        end_image_url: null,
        follows_previous: followsPrevious,
        image_prompt: imagePrompt,
        motion_prompt: motionPrompt,
        source_mode: "manual",
      };
      return {
        id: uuid([planId, i]),
        scene_index: i,
        ...row,
        input_hash: hash(row),
      };
    });
    if (
      !exists ||
      (process.argv.includes("--correct-untouched") &&
        exists.version === 1 &&
        exists.story?.source === "editorial_draft")
    ) {
      await value(
        db.rpc("save_film_plan", {
          p_project: p.id,
          p_actor: p.user_id,
          p_workspace: 1,
          p_id: planId,
          p_expected: exists?.version ?? null,
          p_plan: {
            title: e.title,
            brief: e.brief,
            caption: e.caption,
            format: e.format,
            resolution: e.resolution,
            audio_mode: e.audioMode,
            subtitles: true,
            trim_speech: false,
            target_duration_seconds: 35,
            cast_snapshot: cast.filter((c) =>
              rows.some((s) =>
                s.cast_snapshot.some((r) => r.characterId === c.characterId),
              ),
            ),
            story: {
              ...e.story,
              catalogueKey: e.catalogueKey,
              source: "editorial_draft",
              reviewStatus: "pending",
            },
          },
          p_scenes: rows,
        }),
      );
      created++;
    }
    lines.push(
      `## ${e.catalogueKey.slice(-2)}. ${e.title}`,
      `${e.story.series} · ${e.group}`,
      `Tình huống: ${e.story.situation}`,
      `Cơ chế: ${e.story.mechanism}`,
      `Chuẩn bị: ${e.story.setup}`,
      `Chốt: ${e.story.payoff}`,
      "",
      ...e.story.dialogue.map(
        (d) =>
          `- **${cast.find((c) => c.characterId === d.characterId).name}:** ${d.text} _(${d.action})_`,
      ),
      `\nPhản ứng: ${e.scenes.at(-1).action}`,
      `\nPlan: ${planId}\n`,
    );
  }
  const dir = path.resolve("docs/family-catalogue");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "pilot-scripts.md"), lines.join("\n\n"));
  console.log(
    JSON.stringify({
      project: p.name,
      profileVersion: 1,
      created,
      total: plans.length,
      mediaRequests: 0,
      report: path.join(dir, "pilot-scripts.md"),
    }),
  );
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
