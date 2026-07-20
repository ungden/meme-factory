import type { Asset, ContinuityFinding, ReferenceEntry, Shot } from "./studio-types";

export const assets: Asset[] = [
  {
    id: "char_linh",
    versionId: "char_linh_v1",
    name: "Linh",
    kind: "character",
    status: "locked",
    thumbnail: "/continuity/linh-master.webp",
    coverage: 92,
    referenceCount: 4,
    notes: "Short black bob, warm skin tone, oval face. Preserve facial proportions and body ratio.",
    isSample: true,
  },
  {
    id: "char_minh",
    versionId: "char_minh_v1",
    name: "Minh",
    kind: "character",
    status: "locked",
    thumbnail: "/continuity/minh-master.webp",
    coverage: 88,
    referenceCount: 4,
    notes: "Tousled black hair, angular face, lean build. Preserve eye spacing and jawline.",
    isSample: true,
  },
  {
    id: "look_reflective",
    versionId: "look_reflective_v1",
    name: "Black Reflective Jacket",
    kind: "look",
    status: "locked",
    thumbnail: "/continuity/reflective-jacket.webp",
    coverage: 81,
    referenceCount: 3,
    notes: "Wet-look black technical shell with a high collar and narrow reflective seams.",
    isSample: true,
  },
  {
    id: "item_red_phone",
    versionId: "item_red_phone_v1",
    name: "Red Phone",
    kind: "item",
    status: "locked",
    thumbnail: "/continuity/red-phone.webp",
    coverage: 100,
    referenceCount: 2,
    notes: "Matte red phone, dual camera, always in Minh's right hand for Scene 02.",
    isSample: true,
  },
  {
    id: "env_saigon",
    versionId: "env_saigon_v1",
    name: "Saigon Alley — Rain",
    kind: "environment",
    status: "locked",
    thumbnail: "/continuity/saigon-alley.webp",
    coverage: 86,
    referenceCount: 3,
    notes: "Narrow wet alley, cyan and warm red practical lights, midnight after rain.",
    isSample: true,
  },
  {
    id: "style_editorial",
    versionId: "style_editorial_v1",
    name: "Cinematic Editorial",
    kind: "style",
    status: "locked",
    thumbnail: "/continuity/cinematic-style.webp",
    coverage: 78,
    referenceCount: 2,
    notes: "Premium fashion editorial, 35mm texture, realistic skin, restrained grade.",
    isSample: true,
  },
];

export const shots: Shot[] = [
  { id: "02a", versionId: "02a_v1", code: "02A", title: "Linh enters alley", status: "approved", thumbnail: "/continuity/linh-master.webp", camera: "Close up", lens: "35mm" },
  { id: "02b", versionId: "02b_v1", code: "02B", title: "Empty alley", status: "approved", thumbnail: "/continuity/saigon-alley.webp", camera: "Wide shot", lens: "24mm" },
  { id: "02c", versionId: "02c_v1", code: "02C", title: "Minh waits", status: "approved", thumbnail: "/continuity/minh-master.webp", camera: "Medium shot", lens: "50mm" },
  { id: "02d", versionId: "02d_v3", code: "02D", title: "The red phone", status: "needs_review", thumbnail: "/continuity/scene-02d-main.webp", parentShotId: "02c", camera: "Medium full", lens: "50mm" },
  { id: "02e", versionId: "02e_v1", code: "02E", title: "Linh reacts", status: "draft", thumbnail: "/continuity/scene-02d-variant-2.webp", parentShotId: "02d", camera: "Medium close", lens: "35mm" },
];

const ref = (assetId: string, role: ReferenceEntry["role"], priority: number, subjectId?: string): ReferenceEntry => {
  const asset = assets.find((entry) => entry.id === assetId)!;
  return {
    assetId,
    assetVersionId: asset.versionId,
    imageId: `${assetId}_master`,
    role,
    subjectId,
    hash: `sha256:${assetId}:v1`,
    priority,
  };
};

export const shotReferences: ReferenceEntry[] = [
  ref("char_linh", "identity_face", 100, "linh"),
  ref("char_linh", "identity_body", 96, "linh"),
  ref("char_minh", "identity_face", 99, "minh"),
  ref("char_minh", "identity_body", 95, "minh"),
  ref("look_reflective", "look", 92, "linh"),
  ref("item_red_phone", "item", 91, "minh"),
  ref("env_saigon", "environment", 80),
  ref("style_editorial", "style", 70),
  {
    assetId: "shot_02c",
    assetVersionId: "02c_v1",
    imageId: "02c_approved",
    role: "previous_shot",
    hash: "sha256:02c:approved",
    priority: 85,
  },
];

export const continuityFindings: ContinuityFinding[] = [
  { id: "f1", category: "identity", status: "pass", title: "Character identity", detail: "Linh and Minh remain aligned with their locked masters.", evidence: "Face shape, eye spacing and hair silhouette match." },
  { id: "f2", category: "look", status: "review", title: "Jacket collar", detail: "Linh's collar is slightly wider than the Look Master.", evidence: "Upper-body comparison, left collar edge." },
  { id: "f3", category: "item", status: "fail", title: "Phone ownership", detail: "The red phone appears closer to Linh than the scene instruction.", evidence: "Scene 02 continuity says Minh holds it in his right hand." },
  { id: "f4", category: "environment", status: "pass", title: "Saigon alley", detail: "Rain, practical lights and time-of-day are preserved." },
];
