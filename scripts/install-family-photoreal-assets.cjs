/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const sharp = require("sharp");
const { createClient } = require("@supabase/supabase-js");

const PROJECT_ID = "0eed3bc2-b0e9-499a-afc4-b4ac425b44d2";
const PROJECT_NAME = "Bánh Bao & Đậu Đỏ";
const PACK = "asset-pack-v4-phone-real";
const VISUAL_DIRECTION = {
  id: "family-phone-real-v2",
  prompt:
    "Live-action như do chính gia đình quay bằng điện thoại: người Việt thật, giải phẫu và tỷ lệ tự nhiên, mắt và đầu đúng kích thước, da có lỗ chân lông và lông tơ, ửng đỏ không đều, tóc có sợi lẻ, vải có thớ và nếp nhăn. Ánh sáng có sẵn tại nơi quay, HDR và độ nét kiểu điện thoại, màu tự nhiên không chỉnh điện ảnh, không retouch, không làm đẹp da. Giữ chính xác khuôn mặt, tuổi, tóc, vóc dáng và trang phục từ từng ảnh chuẩn. Không CGI, không 3D render, không Pixar, không hoạt hình, không chibi, không búp bê, không da nhựa, không mắt bóng quá cỡ.",
};
const ROOT = path.resolve(__dirname, "../artifacts/banh-bao-dau-do/photoreal-v2");
// Ảnh cả nhà chưa gen lại: vẫn dùng bản v1 để khoá chiều cao tương đối.
const FAMILY_CAST = path.resolve(__dirname, "../artifacts/banh-bao-dau-do/photoreal-v1/shared/family-cast.png");
// Gen bằng photoreal-v2/gen.sh. Một ảnh toàn thân để mặt quá nhỏ, Seedance đổi
// mặt giữa các cảnh; cận mặt được gửi trước (castReferencePicks).
const IMAGES = [
  { file: "face.png", role: "identity_face", priority: 100, coverage: "faceCloseUp" },
  { file: "body.png", role: "identity_body", priority: 90, coverage: "fullBody" },
  { file: "back.png", role: "look", priority: 80, coverage: "backView" },
];
const CHARACTERS = {
  "Bánh Bao": {
    slug: "banh-bao",
    description:
      "Chị gái tuổi mẫu giáo, gương mặt tròn phúng phính, mắt nâu đúng tỷ lệ tự nhiên, tóc nâu đen búi hai bên và mái bằng, áo vàng mù tạt, tạp dề vải canvas kem trơn.",
    mustPreserve: [
      "gương mặt tròn phúng phính",
      "hai búi tóc và mái bằng",
      "áo vàng mù tạt và tạp dề kem",
      "tỷ lệ người thật, lớn tuổi hơn Đậu Đỏ",
    ],
  },
  "Đậu Đỏ": {
    slug: "dau-do",
    description:
      "Em trai tuổi chập chững, gương mặt bầu bĩnh, mắt nâu đúng tỷ lệ tự nhiên, tóc nâu đen xoăn ngắn với một lọn cong trên đỉnh, áo đỏ gạch, tạp dề vải canvas kem trơn.",
    mustPreserve: [
      "bé trai nhỏ tuổi nhất nhà",
      "lọn tóc cong trên đỉnh",
      "áo đỏ gạch và tạp dề kem",
      "tỷ lệ người thật, thấp hơn Bánh Bao",
    ],
  },
  Mẹ: {
    slug: "me",
    description:
      "Mẹ trẻ người Việt, gương mặt trái xoan ấm áp, mắt nâu tự nhiên, tóc nâu đen búi cao hơi rối với lọn tóc ôm mặt, áo len kem, tạp dề vải be có dây nâu.",
    mustPreserve: [
      "gương mặt trái xoan và nụ cười ấm",
      "tóc búi cao hơi rối",
      "áo len kem và tạp dề be dây nâu",
      "tỷ lệ người thật và chất da tự nhiên",
    ],
  },
  Bố: {
    slug: "bo",
    description:
      "Bố trẻ người Việt, gương mặt hơi góc cạnh, mắt nâu tự nhiên, tóc nâu đen dày gợn sóng rẽ lệch, sạch râu, áo len kem, quần nâu nhạt và tạp dề vải be dây nâu.",
    mustPreserve: [
      "gương mặt hơi góc cạnh và sạch râu",
      "tóc dày gợn sóng rẽ lệch",
      "áo len kem, quần nâu và tạp dề be",
      "tỷ lệ người thật và chất da tự nhiên",
    ],
  },
};

const db = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const sha256 = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
const query = async (promise) => {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
};
const fileInfo = async (file) => {
  const bytes = fs.readFileSync(file);
  const metadata = await sharp(bytes).metadata();
  return {
    bytes,
    hash: sha256(bytes),
    width: metadata.width,
    height: metadata.height,
  };
};

async function uploadVerified(storagePath, info) {
  const bucket = db.storage.from("character-poses");
  const { error } = await bucket.upload(storagePath, info.bytes, {
    contentType: "image/png",
    cacheControl: "31536000",
    upsert: false,
  });
  if (error && !/exist|duplicate/i.test(error.message)) throw error;
  const stored = await query(bucket.download(storagePath));
  const storedHash = sha256(Buffer.from(await stored.arrayBuffer()));
  if (storedHash !== info.hash)
    throw new Error(`Storage checksum mismatch: ${storagePath}`);
  return bucket.getPublicUrl(storagePath).data.publicUrl;
}

async function main() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  const project = await query(
    db
      .from("projects")
      .select("id,name,user_id,workspace_version")
      .eq("id", PROJECT_ID)
      .single(),
  );
  if (project.name !== PROJECT_NAME)
    throw new Error("Project identity changed; refusing to install assets.");
  const characters = await query(
    db
      .from("characters")
      .select("id,name,continuity_asset_id")
      .eq("project_id", PROJECT_ID)
      .in("name", Object.keys(CHARACTERS)),
  );
  if (characters.length !== 4)
    throw new Error("Expected exactly four canonical family characters.");

  const family = await fileInfo(FAMILY_CAST);
  const familyPath = `${PROJECT_ID}/${PACK}/shared/family-cast.png`;
  const familyUrl = await uploadVerified(familyPath, family);
  const installed = {};

  for (const character of characters) {
    const definition = CHARACTERS[character.name];
    if (!character.continuity_asset_id)
      throw new Error(`${character.name} has no continuity asset.`);
    const images = [];
    for (const image of IMAGES) {
      const info = await fileInfo(path.join(ROOT, definition.slug, image.file));
      const storagePath = `${PROJECT_ID}/${PACK}/characters/${definition.slug}/${image.file}`;
      images.push({ ...image, info, storagePath, url: await uploadVerified(storagePath, info) });
    }
    const body = images.find((image) => image.role === "identity_body");
    const contentHash = sha256(
      JSON.stringify({
        visualDirection: VISUAL_DIRECTION.id,
        images: images.map((image) => [image.role, image.info.hash]),
        family: family.hash,
      }),
    );
    let version = await query(
      db
        .from("asset_versions")
        .select("id,version,status")
        .eq("asset_id", character.continuity_asset_id)
        .eq("content_hash", contentHash)
        .maybeSingle(),
    );
    if (!version) {
      const prior = await query(
        db
          .from("asset_versions")
          .select("version")
          .eq("asset_id", character.continuity_asset_id)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle(),
      );
      version = await query(
        db
          .from("asset_versions")
          .insert({
            asset_id: character.continuity_asset_id,
            version: Number(prior?.version || 0) + 1,
            status: "draft",
            identity_profile_type: "human",
            notes:
              "Phone-real identity pack (face, full body, back) regenerated from the v3 masters; machine visual audit only, no fabricated human approval.",
            invariants: definition.mustPreserve,
            usage_rights: {
              source: "owner_provided_references",
              projectOnly: true,
            },
            content_hash: contentHash,
            created_by: project.user_id,
          })
          .select("id,version,status")
          .single(),
      );
      await query(
        db.from("reference_images").insert(
          images.map((image) => ({
            asset_version_id: version.id,
            role: image.role,
            subject_id: character.id,
            image_url: image.url,
            source_hash: image.info.hash,
            source_type: "generated",
            mime_type: "image/png",
            width: image.info.width,
            height: image.info.height,
            quality_report: {
              visualDirection: VISUAL_DIRECTION.id,
              sourceFamilyCastHash: family.hash,
              automaticChecks: { oneSubject: true, [image.coverage]: true, photorealistic: true },
              humanApproved: false,
            },
            is_primary: image.role === "identity_face",
            reproducible: true,
            priority: image.priority,
          })),
        ),
      );
      await query(
        db.from("identity_cards").insert({
          asset_version_id: version.id,
          summary: definition.description,
          must_preserve: definition.mustPreserve,
          may_change: ["biểu cảm", "tư thế", "bối cảnh", "đạo cụ theo cảnh"],
          proportions: { medium: "photorealistic", familyCast: familyUrl },
          identifying_details: definition.mustPreserve,
          coverage: { faceCloseUp: true, fullBody: true, frontView: true, backView: true, familyCast: true },
          approved_by: null,
          approved_at: null,
        }),
      );
      version = await query(
        db
          .from("asset_versions")
          .update({ status: "locked", locked_at: new Date().toISOString() })
          .eq("id", version.id)
          .eq("status", "draft")
          .select("id,version,status")
          .single(),
      );
    }
    await query(
      db
        .from("characters")
        .update({ avatar_url: body.url, description: definition.description })
        .eq("id", character.id)
        .eq("project_id", PROJECT_ID),
    );
    await query(
      db.from("character_dna").upsert({
        character_id: character.id,
        summary: definition.description,
        face_traits: definition.mustPreserve,
        body_traits: ["tỷ lệ người thật", "chiều cao tương đối theo family cast"],
        tone: { medium: "photorealistic", visualDirection: VISUAL_DIRECTION.id },
        background_style: { default: "warm live-action home bakery" },
        must_preserve: definition.mustPreserve,
        may_change: ["biểu cảm", "tư thế", "bối cảnh", "đạo cụ theo cảnh"],
        art_direction: "photoreal_human",
        updated_by: project.user_id,
      }),
    );
    installed[definition.slug] = {
      characterId: character.id,
      assetVersionId: version.id,
      assetVersion: version.version,
      images: Object.fromEntries(
        images.map((image) => [
          image.role,
          { imageUrl: image.url, storagePath: image.storagePath, sha256: image.info.hash },
        ]),
      ),
    };
  }

  const latestProfile = await query(
    db
      .from("channel_profiles")
      .select("version,profile")
      .eq("project_id", PROJECT_ID)
      .eq("workspace_version", project.workspace_version)
      .order("version", { ascending: false })
      .limit(1)
      .single(),
  );
  // Chạy lại script không được đẻ thêm bản hồ sơ khi look đã được cài.
  const alreadyInstalled =
    latestProfile.profile?.visualDirection?.id === VISUAL_DIRECTION.id;
  const profile = alreadyInstalled
    ? latestProfile.profile
    : {
        ...latestProfile.profile,
        version: Number(latestProfile.version) + 1,
        visualDirection: VISUAL_DIRECTION,
      };
  const existingProfile = await query(
    db
      .from("channel_profiles")
      .select("version,profile")
      .eq("project_id", PROJECT_ID)
      .eq("workspace_version", project.workspace_version)
      .eq("version", profile.version)
      .maybeSingle(),
  );
  if (existingProfile) {
    if (JSON.stringify(existingProfile.profile) !== JSON.stringify(profile))
      throw new Error(`Channel profile v${profile.version} already exists with different data.`);
  } else {
    await query(
      db.from("channel_profiles").insert({
        project_id: PROJECT_ID,
        workspace_version: project.workspace_version,
        version: profile.version,
        profile,
      }),
    );
  }

  const manifest = {
    projectId: PROJECT_ID,
    workspaceVersion: project.workspace_version,
    visualDirection: VISUAL_DIRECTION,
    familyCast: {
      imageUrl: familyUrl,
      storagePath: familyPath,
      sha256: family.hash,
      width: family.width,
      height: family.height,
    },
    characters: installed,
    installedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(ROOT, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(
    JSON.stringify({
      ok: true,
      profileVersion: profile.version,
      characters: Object.fromEntries(
        Object.entries(installed).map(([slug, value]) => [
          slug,
          { assetVersion: value.assetVersion, roles: Object.keys(value.images) },
        ]),
      ),
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
