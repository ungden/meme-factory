/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const sharp = require("sharp");
const { createClient } = require("@supabase/supabase-js");

const PROJECT_ID = "0eed3bc2-b0e9-499a-afc4-b4ac425b44d2";
const PROJECT_NAME = "Bánh Bao & Đậu Đỏ";
const PACK = "plane-episode-guests-v1";
const PLAN_KEY = "plane-parachute-backpack-v1";
const ROOT = path.resolve(
  __dirname,
  "../artifacts/banh-bao-dau-do/photoreal-v1/guests",
);
const GUESTS = {
  "Phi Công": {
    slug: "pilot",
    description:
      "Phi công nam người Việt khoảng 35–42 tuổi, tóc đen ngắn gọn gàng, sạch râu, sơ mi phi công trắng, cà vạt đen và quần đen; tác phong nhanh, dứt khoát.",
    personality: "Bình tĩnh theo nghề nhưng phản ứng rất nhanh khi máy bay gặp sự cố.",
    mustPreserve: [
      "tóc đen ngắn và sạch râu",
      "sơ mi phi công trắng, cà vạt đen, quần đen",
      "tỷ lệ người thật và diện mạo người Việt",
    ],
  },
  "Chuyên Gia": {
    slug: "expert",
    description:
      "Chuyên gia nam người Việt khoảng 45–50 tuổi, tóc đen rẽ lệch hơi điểm bạc, kính tròn mảnh, blazer xanh lam, sơ mi trắng và quần xám; vẻ tự tin hơi tự mãn.",
    personality: "Luôn tin mình quan trọng nhất và hành động rất quả quyết trước khi kịp nhìn kỹ.",
    mustPreserve: [
      "kính tròn mảnh và tóc rẽ lệch hơi điểm bạc",
      "blazer xanh lam, sơ mi trắng, quần xám",
      "tỷ lệ người thật và diện mạo người Việt",
    ],
  },
};

const db = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const value = async (request) => {
  const { data, error } = await request;
  if (error) throw error;
  return data;
};
const stable = (input) =>
  JSON.stringify(input, (key, item) =>
    item && !Array.isArray(item) && typeof item === "object"
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
const hash = (input) =>
  crypto.createHash("sha256").update(Buffer.isBuffer(input) ? input : stable(input)).digest("hex");
const uuid = (key) => {
  const digest = hash(key);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
};

async function upload(file, storagePath) {
  const bytes = fs.readFileSync(file);
  const metadata = await sharp(bytes).metadata();
  const checksum = hash(bytes);
  const bucket = db.storage.from("character-poses");
  const { error } = await bucket.upload(storagePath, bytes, {
    contentType: "image/png",
    cacheControl: "31536000",
    upsert: false,
  });
  if (error && !/exist|duplicate/i.test(error.message)) throw error;
  const stored = await value(bucket.download(storagePath));
  if (hash(Buffer.from(await stored.arrayBuffer())) !== checksum)
    throw new Error(`Storage checksum mismatch for ${storagePath}`);
  return {
    url: bucket.getPublicUrl(storagePath).data.publicUrl,
    checksum,
    width: metadata.width,
    height: metadata.height,
  };
}

async function installGuest(project, name, definition) {
  const id = uuid([PROJECT_ID, "guest", name]);
  const file = path.join(ROOT, definition.slug, "master.png");
  const uploaded = await upload(
    file,
    `${PROJECT_ID}/${PACK}/${definition.slug}/master.png`,
  );
  await value(
    db.from("characters").upsert(
      {
        id,
        project_id: project.id,
        name,
        description: definition.description,
        personality: definition.personality,
        avatar_url: uploaded.url,
        continuity_asset_id: null,
      },
      { onConflict: "id" },
    ),
  );
  await value(
    db.from("assets").upsert(
      {
        id,
        project_id: project.id,
        legacy_character_id: id,
        kind: "character",
        name,
        created_by: project.user_id,
      },
      { onConflict: "id" },
    ),
  );
  await value(
    db.from("characters").update({ continuity_asset_id: id }).eq("id", id),
  );
  const contentHash = hash({
    pack: PACK,
    image: uploaded.checksum,
    installer: "complete-v1",
  });
  let version = await value(
    db
      .from("asset_versions")
      .select("id,version,status,reference_images(source_hash,is_primary)")
      .eq("asset_id", id)
      .eq("status", "locked")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  if (
    !version?.reference_images?.some(
      (reference) => reference.is_primary && reference.source_hash === uploaded.checksum,
    )
  ) {
    const priorVersion = Number(version?.version || 0);
    version = await value(
      db
        .from("asset_versions")
        .insert({
          asset_id: id,
          version: priorVersion + 1,
          status: "draft",
          identity_profile_type: "human",
          notes: "Photoreal guest identity for the reviewed plane episode.",
          invariants: definition.mustPreserve,
          usage_rights: { projectOnly: true, source: "episode_generation" },
          content_hash: contentHash,
          created_by: project.user_id,
          locked_at: null,
        })
        .select("id,version,status")
        .single(),
    );
    await value(
      db.from("reference_images").insert({
        asset_version_id: version.id,
        role: "identity_body",
        subject_id: id,
        image_url: uploaded.url,
        source_hash: uploaded.checksum,
        source_type: "generated",
        mime_type: "image/png",
        width: uploaded.width,
        height: uploaded.height,
        quality_report: {
          visualDirection: "family-photoreal-v1",
          automaticChecks: { oneSubject: true, fullBody: true, photorealistic: true },
          humanApproved: false,
        },
        is_primary: true,
        reproducible: true,
        priority: 100,
      }),
    );
    await value(
      db.from("identity_cards").insert({
        asset_version_id: version.id,
        summary: definition.description,
        must_preserve: definition.mustPreserve,
        may_change: ["biểu cảm", "tư thế", "bối cảnh", "đạo cụ theo cảnh"],
        proportions: { medium: "photorealistic" },
        identifying_details: definition.mustPreserve,
        coverage: { fullBody: true, frontView: true },
        approved_by: null,
        approved_at: null,
      }),
    );
    version = await value(
      db
        .from("asset_versions")
        .update({ status: "locked", locked_at: new Date().toISOString() })
        .eq("id", version.id)
        .eq("status", "draft")
        .select("id,version,status")
        .single(),
    );
  }
  await value(
    db.from("character_dna").upsert(
      {
        character_id: id,
        summary: definition.description,
        must_preserve: definition.mustPreserve,
        may_change: ["biểu cảm", "tư thế", "bối cảnh", "đạo cụ theo cảnh"],
        art_direction: "photoreal_human",
        updated_by: project.user_id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "character_id" },
    ),
  );
  return {
    characterId: id,
    name,
    description: definition.description,
    personality: definition.personality,
    imageUrl: uploaded.url,
    referenceImages: [uploaded.url],
    assetVersionId: version.id,
    assetVersion: version.version,
  };
}

const performance = ({ objective, before, after, hook, beats, cut }) => ({
  version: 1,
  lane: "deadpan_reversal",
  comicObjective: objective,
  statusBefore: before,
  statusAfter: after,
  hook,
  beats,
  revealOrCut: cut,
});

const beat = ({ start, end, speaker = null, dialogue = "", action, camera, motion, performance }) => ({
  startSeconds: start,
  endSeconds: end,
  speakerCharacterId: speaker,
  dialogue,
  action,
  camera,
  motion,
  performance,
});

async function main() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  const project = await value(
    db
      .from("projects")
      .select("id,name,user_id,workspace_version")
      .eq("id", PROJECT_ID)
      .single(),
  );
  if (project.name !== PROJECT_NAME || project.workspace_version !== 1)
    throw new Error("Project identity/workspace changed; refusing to continue.");

  const guests = {};
  for (const [name, definition] of Object.entries(GUESTS))
    guests[name] = await installGuest(project, name, definition);

  const familyRows = await value(
    db
      .from("characters")
      .select("id,name,description,personality,continuity_asset_id")
      .eq("project_id", PROJECT_ID)
      .in("name", ["Mẹ", "Đậu Đỏ"]),
  );
  const family = {};
  for (const character of familyRows) {
    const version = await value(
      db
        .from("asset_versions")
        .select("id,version,reference_images(image_url,is_primary,priority)")
        .eq("asset_id", character.continuity_asset_id)
        .eq("status", "locked")
        .order("version", { ascending: false })
        .limit(1)
        .single(),
    );
    const voice = await value(
      db
        .from("character_voice_versions")
        .select("id,voice_id,model,settings")
        .eq("character_id", character.id)
        .not("approved_at", "is", null)
        .order("version", { ascending: false })
        .limit(1)
        .single(),
    );
    const refs = version.reference_images
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || b.priority - a.priority)
      .map((item) => item.image_url);
    family[character.name] = {
      characterId: character.id,
      name: character.name,
      description: character.description,
      personality: character.personality,
      imageUrl: refs[0],
      referenceImages: refs,
      assetVersionId: version.id,
      assetVersion: version.version,
      voice,
    };
  }
  if (!family["Mẹ"] || !family["Đậu Đỏ"])
    throw new Error("Missing canonical mother/son cast.");

  const pilot = guests["Phi Công"];
  const expert = guests["Chuyên Gia"];
  const mother = family["Mẹ"];
  const child = family["Đậu Đỏ"];
  const allCast = [pilot, expert, mother, child];
  const motherChild = [mother, child];
  const planId = uuid([PROJECT_ID, PLAN_KEY]);
  const sceneIds = [0, 1, 2].map((index) => uuid([planId, "scene", index]));

  const directions = [
    performance({
      objective: "Khán giả thấy hai người lớn hấp tấp giành quyền sống trước khi nhận ra chiếc balô trẻ con là mấu chốt.",
      before: "Phi công kiểm soát cabin, Chuyên Gia giữ vẻ quan trọng; Mẹ ôm Đậu Đỏ chờ hướng dẫn.",
      after: "Phi công và Chuyên Gia đã lao khỏi cửa; Mẹ và Đậu Đỏ bị bỏ lại với các túi còn trên sàn.",
      hook: "Đèn báo đỏ bật nhấp nháy, Phi Công giật cần cửa và ba túi dù cùng balô nhỏ của Đậu Đỏ trượt trên sàn.",
      beats: [
        { physicalAction: "Phi Công bật đèn cảnh báo rồi giơ ba ngón tay", expressionChange: "mặt chuyển từ tập trung sang khẩn cấp", gesture: "chỉ nhanh vào ba túi dù", propInteraction: "kéo chốt cửa máy bay", reactionTarget: "Mẹ siết vai Đậu Đỏ, Chuyên Gia ngoái nhìn các túi", cameraMove: "handheld push-in nhanh từ toàn cảnh vào ba túi" },
        { physicalAction: "Phi Công chộp đúng một túi dù đỏ và nhảy qua cửa", expressionChange: "hàm siết, mắt khóa vào cửa", gesture: "vẫy tay ra hiệu lùi lại", propInteraction: "dây dù căng khi ông biến khỏi khung", reactionTarget: "Mẹ và Đậu Đỏ lùi một bước vì luồng gió", cameraMove: "tracking ngang theo cú chạy rồi whip-pan trở lại cabin" },
        { physicalAction: "Chuyên Gia hất cằm, chỉ vào ngực rồi chộp nhầm balô nhỏ màu đỏ của Đậu Đỏ", expressionChange: "nụ cười tự tin chuyển thành quyết liệt", gesture: "ôm chặt balô và lao thẳng ra cửa", propInteraction: "balô trẻ con có móc khóa bánh bao đập vào lưng", reactionTarget: "Đậu Đỏ nhìn theo balô của mình, miệng hé nhưng chưa nói", cameraMove: "dolly-in vào bàn tay chộp nhầm rồi pan tốc độ cao theo cú nhảy" },
      ],
      cut: "Giữ 0,3 giây ở chỗ trống của balô và ánh mắt Đậu Đỏ rồi cắt sang Mẹ đang đếm túi.",
    }),
    performance({
      objective: "Bi kịch hy sinh của Mẹ được diễn hết mức để chuẩn bị cú bẻ tỉnh bơ của Đậu Đỏ.",
      before: "Mẹ tin chỉ còn một dù và tự nhận phần ở lại; Đậu Đỏ chưa hiểu vì sao Mẹ hoảng.",
      after: "Mẹ khóc nức nở ôm con, còn Đậu Đỏ đã thấy rõ chiếc dù thứ hai sau ghế.",
      hook: "Mẹ quỳ sụp, kéo một túi dù vào lòng Đậu Đỏ rồi siết con sát ngực ngay giây đầu.",
      beats: [
        { physicalAction: "Mẹ đẩy túi dù vào hai tay Đậu Đỏ rồi ôm ghì lấy con", expressionChange: "mắt đỏ lên, môi run và nước mắt trào thành dòng", gesture: "hai bàn tay giữ chặt hai má con", propInteraction: "khóa túi dù va nhẹ vào sàn", reactionTarget: "Đậu Đỏ nhìn thẳng vào gương mặt đang khóc của Mẹ", cameraMove: "handheld push-in từ trung cảnh sang cận mặt Mẹ" },
        { physicalAction: "Mẹ cúi hôn trán con, vai rung mạnh và nghẹn giữa câu", expressionChange: "khóc nức nở, lông mày co lên, hàm run nhưng vẫn cố nói trọn lời", gesture: "một tay siết lưng con, một tay vuốt tóc liên tục", propInteraction: "nắm quai dù đến trắng khớp tay", reactionTarget: "Đậu Đỏ chớp mắt rồi nhìn qua vai Mẹ về phía sau ghế", cameraMove: "cận cảnh rung rất nhẹ rồi rack-focus sang ánh mắt Đậu Đỏ" },
        { physicalAction: "Đậu Đỏ nghiêng người nhìn thấy chiếc dù thứ hai sau ghế", expressionChange: "mặt vẫn bình thản, chỉ nhướng một bên mày", gesture: "ngón tay bắt đầu giơ lên sau lưng Mẹ", propInteraction: "chiếc dù thứ hai lộ dần cạnh ghế", reactionTarget: "Mẹ vẫn nhắm mắt khóc và chưa nhìn thấy", cameraMove: "slide ngắn hé lộ chiếc dù nhưng giữ Mẹ ở tiền cảnh" },
      ],
      cut: "Cắt đúng lúc ngón tay Đậu Đỏ chỉ về chiếc dù thứ hai, Mẹ vẫn đang khóc mạnh.",
    }),
    performance({
      objective: "Đậu Đỏ bẻ toàn bộ bi kịch bằng một quan sát rất bình thường; Mẹ chốt tỉnh bơ khi nước mắt còn trên má.",
      before: "Mẹ đang vỡ òa, Đậu Đỏ bị ôm chặt.",
      after: "Đậu Đỏ giành quyền giải thích; Mẹ nhận ra Chuyên Gia đã nhảy với cặp sách.",
      hook: "Đậu Đỏ nhẹ nhàng gỡ hai tay Mẹ khỏi má mình và chỉ thẳng vào hai túi dù nằm cạnh ghế.",
      beats: [
        { physicalAction: "Đậu Đỏ gỡ tay Mẹ, xoay người và chỉ lần lượt vào hai túi dù", expressionChange: "mặt tỉnh bơ, mắt mở rõ như đang giải thích điều hiển nhiên", gesture: "đếm một rồi hai bằng ngón tay", propInteraction: "kéo chiếc dù bị khuất ra khỏi sau ghế", reactionTarget: "Mẹ ngừng nấc giữa chừng và nhìn theo ngón tay con", cameraMove: "rack-focus từ mặt Đậu Đỏ sang hai túi dù rồi trở lại" },
        { physicalAction: "Đậu Đỏ chỉ vào chỗ trống nơi balô của mình từng nằm rồi chỉ ra cửa", expressionChange: "khóe miệng hạ xuống vì tiếc cặp hơn là sợ", gesture: "hai bàn tay xòe ra như hỏi cặp đâu", propInteraction: "móc khóa hình bánh bao còn rung trên sàn cạnh chỗ trống", reactionTarget: "Mẹ ngoái ra cửa, miệng đang khóc khựng lại", cameraMove: "pan ngắn từ chỗ trống sang cửa rồi snap-back vào Mẹ" },
        { physicalAction: "Mẹ buông vai, lau một bên má nhưng để nguyên giọt nước mắt còn lại", expressionChange: "nét bi thương tắt ngay thành vẻ khô khan, mắt chớp một lần", gesture: "hất cằm rất nhẹ về phía cửa", propInteraction: "đặt túi dù xuống cạnh túi còn lại", reactionTarget: "Đậu Đỏ nhìn Mẹ chờ câu chốt", cameraMove: "slow controlled push-in rất ngắn vào cận hai mẹ con" },
      ],
      cut: "Mẹ nói xong câu chốt với mặt tỉnh bơ, Đậu Đỏ nhìn theo cặp sách; hard cut ngay, không cười và không thêm phản ứng.",
    }),
  ];

  const boards = [
    {
      version: 2,
      durationSeconds: 15,
      contentEndSeconds: 15,
      performanceDirection: directions[0],
      beats: [
        beat({ start: 0, end: 1.5, action: "Đèn cảnh báo bật, cửa máy bay mở hé và bốn người cùng quay về phía ba túi dù cùng balô trẻ con.", camera: "wide cabin shot, immediate handheld push-in", motion: "Gió hất nhẹ tóc và vạt áo; ba túi dù kích thước lớn nằm tách rõ khỏi balô nhỏ màu đỏ của Đậu Đỏ." }),
        beat({ start: 1.5, end: 7.5, speaker: mother.characterId, dialogue: "Máy bay gặp sự cố rồi! Có bốn người mà chỉ có ba cái dù!", action: "Mẹ giữ vai Đậu Đỏ, nói nhanh trong hoảng hốt và nhìn Phi Công.", camera: "medium two-shot on Mẹ and Đậu Đỏ, rack focus to the three parachutes", motion: "Mẹ nói trọn câu; Phi Công và Chuyên Gia chỉ phản ứng không lời, không cử động môi." }),
        beat({ start: 7.5, end: 10.8, action: "Phi Công chộp đúng túi dù đỏ lớn, chạy hai bước rồi nhảy qua cửa.", camera: "fast lateral tracking into a short whip-pan", motion: "Cú chạy gọn, nhanh, an toàn; túi dù giữ nguyên trên lưng; không slow motion." }),
        beat({ start: 10.8, end: 15, action: "Chuyên Gia hất cằm, chỉ vào ngực, chộp nhầm balô trẻ con màu đỏ của Đậu Đỏ rồi nhảy theo.", camera: "dolly to the wrong backpack, then fast pan to the door", motion: "Cho thấy rõ kích thước nhỏ, quai đeo trẻ con và móc khóa bánh bao; Đậu Đỏ dõi theo balô, Mẹ chưa nhận ra nhầm lẫn." }),
      ],
    },
    {
      version: 2,
      durationSeconds: 15,
      contentEndSeconds: 15,
      performanceDirection: directions[1],
      beats: [
        beat({ start: 0, end: 2.2, action: "Mẹ quỳ sụp, đẩy một túi dù vào tay Đậu Đỏ rồi ôm ghì con.", camera: "medium handheld push-in", motion: "Bắt đầu ngay bằng hành động; một chiếc dù khác khuất một phần sau ghế, chưa được Mẹ nhìn thấy." }),
        beat({ start: 2.2, end: 12.8, speaker: mother.characterId, dialogue: "Đậu Đỏ, con lấy dù đi. Sau này phải học hành chăm chỉ, sống thật tốt nhé con!", action: "Mẹ khóc nức nở, nước mắt chảy thành dòng, môi và vai run mạnh; ôm siết, giữ hai má rồi hôn trán Đậu Đỏ.", camera: "tight emotional close-up, subtle handheld, rack focus to Đậu Đỏ near the end", motion: "Giọng vỡ và nghẹn tự nhiên nhưng nói trọn câu; Đậu Đỏ không nói, không khóc, chỉ nhìn Mẹ rồi liếc qua vai về sau ghế." }),
        beat({ start: 12.8, end: 15, action: "Đậu Đỏ nhìn thấy chiếc dù thứ hai và từ từ giơ ngón tay chỉ qua vai Mẹ.", camera: "short slide revealing the second parachute", motion: "Mẹ vẫn nhắm mắt khóc mạnh; kết ở ngón tay Đậu Đỏ và chiếc dù thứ hai vừa lộ." }),
      ],
    },
    {
      version: 2,
      durationSeconds: 14,
      contentEndSeconds: 14,
      performanceDirection: directions[2],
      beats: [
        beat({ start: 0, end: 1.2, action: "Đậu Đỏ nhẹ nhàng gỡ hai tay Mẹ khỏi má, kéo chiếc dù bị khuất ra cạnh túi kia.", camera: "medium two-shot with quick rack focus to both parachutes", motion: "Hai túi dù lớn hiện rõ; chỗ của balô nhỏ bên chân Đậu Đỏ đang trống." }),
        beat({ start: 1.2, end: 9.2, speaker: child.characterId, dialogue: "Mẹ ơi, vẫn còn hai cái dù mà. Ông chuyên gia cầm nhầm cặp sách của con rồi.", action: "Đậu Đỏ đếm hai túi dù bằng ngón tay, rồi chỉ chỗ balô bị mất và chỉ ra cửa với vẻ tỉnh bơ.", camera: "rack focus between Đậu Đỏ, two parachutes and the empty backpack spot", motion: "Đậu Đỏ nói đều, rõ, hơi tiếc chiếc cặp; Mẹ ngừng nấc giữa chừng, mắt nhìn theo từng điểm con chỉ, không nói chen." }),
        beat({ start: 9.2, end: 11, action: "Mẹ ngoái ra cửa, lau một bên má; nét khóc tắt ngay thành vẻ khô khan.", camera: "snap-pan to the door and back into a close two-shot", motion: "Giữ một giọt nước mắt trên má; Mẹ chớp mắt đúng một lần, Đậu Đỏ chờ." }),
        beat({ start: 11, end: 14, speaker: mother.characterId, dialogue: "Chuyên gia có khác… ham học thật.", action: "Mẹ hất cằm rất nhẹ về phía cửa và đặt túi dù xuống cạnh túi còn lại.", camera: "short controlled push-in on Mẹ and Đậu Đỏ", motion: "Mẹ nói tỉnh bơ khi nước mắt còn trên má; hard cut ngay sau chữ thật, không cười, không thêm lời hay hành động." }),
      ],
    },
  ];

  const sceneDefinitions = [
    {
      cast: allCast,
      speaker: mother.characterId,
      action: "Phi Công và Chuyên Gia lần lượt nhảy khỏi máy bay; Chuyên Gia cầm nhầm balô của Đậu Đỏ.",
      setting: "Khoang sau của máy bay nhỏ đang bay trên mây, cửa nhảy dù ở cuối cabin, đèn cảnh báo đỏ, ghế và dây đai thực tế.",
      camera: "nhịp nhanh, wide-to-medium handheld, tracking và whip-pan có chủ đích",
      imagePrompt: "Khung mở live-action 16:9 trong khoang máy bay: đúng bốn người Phi Công, Chuyên Gia, Mẹ và Đậu Đỏ. Phi Công gần cửa, Chuyên Gia gần các túi, Mẹ ôm vai Đậu Đỏ. Trên sàn có đúng ba túi dù lớn và một balô trẻ con đỏ nhỏ có móc khóa bánh bao, đặt tách bạch để nhận ra về sau. Đây là trạng thái trước hành động, cửa chưa mở hết, không ai đeo dù, không chữ.",
      board: boards[0],
    },
    {
      cast: motherChild,
      speaker: mother.characterId,
      action: "Mẹ tưởng chỉ còn một dù, khóc dữ dội và dặn Đậu Đỏ sống tốt, học tốt.",
      setting: "Cùng khoang máy bay, cửa mở ở hậu cảnh; một túi dù thấy rõ và chiếc thứ hai khuất một phần sau ghế.",
      camera: "cận cảm xúc có rung nhẹ rồi hé lộ phản ứng tỉnh bơ của Đậu Đỏ",
      imagePrompt: "Khung mở live-action 16:9 trong đúng khoang máy bay trước đó: chỉ Mẹ và Đậu Đỏ. Mẹ vừa quỳ xuống trước mặt con, một tay chạm túi dù, nét mặt mới bắt đầu hoảng nhưng chưa khóc; Đậu Đỏ đứng bình tĩnh. Một túi dù lớn thấy rõ, túi thứ hai bị ghế che một phần nhưng vẫn tồn tại hợp lý. Không có Phi Công hoặc Chuyên Gia, không balô đỏ, không chữ.",
      board: boards[1],
    },
    {
      cast: motherChild,
      speaker: child.characterId,
      action: "Đậu Đỏ chỉ ra còn hai dù và chuyên gia đã cầm nhầm cặp; Mẹ chốt tỉnh bơ.",
      setting: "Cùng vị trí trong khoang máy bay; hai túi dù cạnh nhau và chỗ balô của Đậu Đỏ để trống.",
      camera: "rack focus vào bằng chứng rồi push-in ngắn cho câu chốt",
      imagePrompt: "Khung mở live-action 16:9 tiếp nối: đúng Mẹ và Đậu Đỏ, Mẹ còn nước mắt trên mặt và đang ôm con, Đậu Đỏ bắt đầu gỡ tay Mẹ. Một túi dù thấy rõ, chiếc thứ hai còn khuất sau ghế để Đậu Đỏ kéo ra trong chuyển động. Chỗ balô đỏ nhỏ bên chân Đậu Đỏ để trống. Không thêm người, không chữ.",
      board: boards[2],
    },
  ];

  const scenes = sceneDefinitions.map((definition, index) => {
    const row = {
      id: sceneIds[index],
      scene_index: index,
      cast_snapshot: definition.cast,
      speaker_character_id: definition.speaker,
      dialogue: definition.board.beats.map((item) => item.dialogue).filter(Boolean).join("\n"),
      action: definition.action,
      setting: definition.setting,
      camera: definition.camera,
      duration_seconds: definition.board.durationSeconds,
      start_image_url: null,
      end_image_url: null,
      follows_previous: false,
      image_prompt: definition.imagePrompt,
      motion_prompt: definition.board.beats.map((item) => `${item.startSeconds}-${item.endSeconds}s ${item.action} ${item.motion}`).join(" "),
      source_mode: "manual",
      storyboard: definition.board,
    };
    return { ...row, input_hash: hash(row) };
  });

  const existing = await value(
    db.from("video_plans").select("id,version").eq("id", planId).maybeSingle(),
  );
  await value(
    db.rpc("save_film_plan", {
      p_project: project.id,
      p_actor: project.user_id,
      p_workspace: project.workspace_version,
      p_id: planId,
      p_expected: existing?.version ?? null,
      p_plan: {
        title: "Chuyên gia ham học",
        brief: "Máy bay có bốn người nhưng ba cái dù. Phi Công nhảy trước, Chuyên Gia cầm nhầm balô của Đậu Đỏ. Mẹ khóc dặn con sống tốt rồi bị Đậu Đỏ bẻ lái rằng vẫn còn hai dù.",
        caption: "Khi chuyên gia chọn đúng… cặp sách. 😭🎒",
        format: "16:9",
        resolution: "720p",
        video_model: "bytedance/seedance-2.5/image-to-video",
        audio_mode: "dubbed",
        subtitles: true,
        trim_speech: true,
        target_duration_seconds: 44,
        cast_snapshot: allCast,
        story: {
          profileVersion: 10,
          source: "editorial_reviewed",
          reviewStatus: "reviewed",
          performanceLane: "deadpan_reversal",
          comicPremise: {
            normalExpectation: "Người lớn bình tĩnh cứu và bảo vệ trẻ nhỏ khi máy bay gặp sự cố.",
            invertedReality: "Hai người lớn vội nhảy trước, còn Đậu Đỏ mới là người nhìn ra Chuyên Gia cầm nhầm cặp sách.",
            visibleContrast: "Mẹ khóc như cảnh chia ly trong khi hai túi dù vẫn nằm ngay sau ghế và balô trẻ con đã biến mất.",
          },
          endingPlan: {
            mode: "hard_cut",
            stopAfterLine: 4,
            anchorQuote: "Chuyên gia có khác… ham học thật.",
            reason: "Câu chốt giải thích cú cầm nhầm; dừng ngay để giữ sự tỉnh bơ.",
          },
          series: "Chuyện người lớn phiên bản nhí",
          situation: "Một sự cố máy bay được kể như bi kịch hy sinh rồi bẻ bằng việc người lớn cầm nhầm đồ trẻ con.",
          mechanism: "deadpan_reversal",
          outcome: "Mẹ và Đậu Đỏ vẫn còn đủ hai dù; Chuyên Gia đã nhảy với cặp sách của Đậu Đỏ.",
          wants: [
            { characterId: mother.characterId, want: "Dành chiếc dù cuối cùng cho con và kịp dặn con sống tốt." },
            { characterId: child.characterId, want: "Nói cho Mẹ biết vẫn còn đủ dù và cặp sách của mình đã bị lấy nhầm." },
          ],
          beats: [
            { purpose: "hook", description: "Đèn cảnh báo bật; bốn người nhìn ba túi dù và một balô trẻ con trên sàn." },
            { purpose: "turn", description: "Phi Công chộp một dù nhảy trước; Chuyên Gia tự tin chộp nhầm balô của Đậu Đỏ rồi nhảy theo." },
            { purpose: "turn", description: "Mẹ tưởng chỉ còn một dù, ôm Đậu Đỏ khóc nức nở và dặn con học hành, sống thật tốt." },
            { purpose: "payoff", description: "Đậu Đỏ kéo chiếc dù thứ hai ra, nói Chuyên Gia đã cầm nhầm cặp; Mẹ chốt tỉnh bơ rồi cắt." },
          ],
          setup: "Bốn người, ba dù; Phi Công và Chuyên Gia nhảy trước.",
          payoff: "Chuyên Gia cầm nhầm balô, nên Mẹ và Đậu Đỏ vẫn còn hai dù.",
          caption: "Khi chuyên gia chọn đúng… cặp sách. 😭🎒",
          dialogue: [
            { characterId: mother.characterId, text: "Máy bay gặp sự cố rồi! Có bốn người mà chỉ có ba cái dù!", action: "Mẹ giữ vai Đậu Đỏ, nói nhanh trong hoảng hốt và nhìn Phi Công." },
            { characterId: mother.characterId, text: "Đậu Đỏ, con lấy dù đi. Sau này phải học hành chăm chỉ, sống thật tốt nhé con!", action: "Mẹ khóc nức nở, ôm siết con, giữ hai má rồi hôn trán." },
            { characterId: child.characterId, text: "Mẹ ơi, vẫn còn hai cái dù mà. Ông chuyên gia cầm nhầm cặp sách của con rồi.", action: "Đậu Đỏ đếm hai túi dù rồi chỉ vào chỗ chiếc cặp bị mất." },
            { characterId: mother.characterId, text: "Chuyên gia có khác… ham học thật.", action: "Mẹ ngừng khóc, để nguyên giọt nước mắt và hất cằm về phía cửa." },
          ],
        },
      },
      p_scenes: scenes,
    }),
  );

  const saved = await value(
    db
      .from("video_plans")
      .select("id,title,version,status,format,resolution,video_model,audio_mode,target_duration_seconds,video_plan_scenes(id,scene_index,duration_seconds,dialogue,storyboard)")
      .eq("id", planId)
      .single(),
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        plan: {
          id: saved.id,
          title: saved.title,
          version: saved.version,
          duration: saved.target_duration_seconds,
          scenes: saved.video_plan_scenes.length,
        },
        guests: Object.fromEntries(
          Object.entries(guests).map(([name, cast]) => [name, cast.characterId]),
        ),
        paidMediaRequests: 0,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
