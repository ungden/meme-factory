import type { Asset, ContinuityFinding, ReferenceEntry, Shot } from "./studio-types";

export const assets: Asset[] = [
  {
    id: "char_linh",
    versionId: "char_linh_v1",
    name: "Linh",
    kind: "character",
    status: "locked",
    thumbnail: "/continuity/linh-master.webp?v=quiet-luxury-20260720",
    coverage: 92,
    referenceCount: 4,
    notes: "Tóc bob đen ngắn, da tông ấm, khuôn mặt trái xoan và nốt ruồi nhỏ dưới mắt trái. Giữ nguyên tỷ lệ khuôn mặt và cơ thể.",
    isSample: true,
  },
  {
    id: "char_minh",
    versionId: "char_minh_v1",
    name: "Minh",
    kind: "character",
    status: "locked",
    thumbnail: "/continuity/minh-master.webp?v=quiet-luxury-20260720",
    coverage: 88,
    referenceCount: 4,
    notes: "Tóc đen hơi rối, khuôn mặt góc cạnh, dáng người gọn. Giữ khoảng cách hai mắt và đường hàm.",
    isSample: true,
  },
  {
    id: "look_reflective",
    versionId: "look_reflective_v1",
    name: "Áo khoác phản quang đen",
    kind: "look",
    status: "locked",
    thumbnail: "/continuity/reflective-jacket.webp?v=quiet-luxury-20260720",
    coverage: 81,
    referenceCount: 3,
    notes: "Áo khoác kỹ thuật màu đen hiệu ứng ướt, cổ cao và các đường phản quang mảnh.",
    isSample: true,
  },
  {
    id: "item_red_phone",
    versionId: "item_red_phone_v1",
    name: "Điện thoại đỏ",
    kind: "item",
    status: "locked",
    thumbnail: "/continuity/red-phone.webp?v=quiet-luxury-20260720",
    coverage: 100,
    referenceCount: 2,
    notes: "Điện thoại đỏ mờ, camera kép, luôn nằm trong tay phải của Minh ở Cảnh 02.",
    isSample: true,
  },
  {
    id: "env_saigon",
    versionId: "env_saigon_v1",
    name: "Hẻm Sài Gòn — sau mưa",
    kind: "environment",
    status: "locked",
    thumbnail: "/continuity/saigon-alley.webp?v=quiet-luxury-20260720",
    coverage: 86,
    referenceCount: 3,
    notes: "Hẻm di sản Sài Gòn sau mưa, cổng xanh patina, tường vôi cũ, cây nhiệt đới và ánh sáng buổi sớm màu ngọc trai.",
    isSample: true,
  },
  {
    id: "style_editorial",
    versionId: "style_editorial_v1",
    name: "Quiet Luxury Sài Gòn",
    kind: "style",
    status: "locked",
    thumbnail: "/continuity/cinematic-style.webp?v=quiet-luxury-20260720",
    coverage: 78,
    referenceCount: 2,
    notes: "Quiet luxury editorial trên medium-format film, da thật có texture, tailoring tối giản, bảng màu than chì, ngà ấm và xanh patina.",
    isSample: true,
  },
];

export const shots: Shot[] = [
  { id: "02a", versionId: "02a_v1", code: "02A", title: "Linh bước vào hẻm", status: "approved", thumbnail: "/continuity/linh-master.webp?v=quiet-luxury-20260720", camera: "Cận cảnh", lens: "35mm" },
  { id: "02b", versionId: "02b_v1", code: "02B", title: "Con hẻm vắng", status: "approved", thumbnail: "/continuity/saigon-alley.webp?v=quiet-luxury-20260720", camera: "Toàn cảnh", lens: "24mm" },
  { id: "02c", versionId: "02c_v1", code: "02C", title: "Minh chờ đợi", status: "approved", thumbnail: "/continuity/minh-master.webp?v=quiet-luxury-20260720", camera: "Trung cảnh", lens: "50mm" },
  { id: "02d", versionId: "02d_v3", code: "02D", title: "Chiếc điện thoại đỏ", status: "needs_review", thumbnail: "/continuity/scene-02d-main.webp?v=quiet-luxury-20260720", parentShotId: "02c", camera: "Trung cảnh toàn thân", lens: "50mm" },
  { id: "02e", versionId: "02e_v1", code: "02E", title: "Linh phản ứng", status: "draft", thumbnail: "/continuity/scene-02d-variant-2.webp?v=quiet-luxury-20260720", parentShotId: "02d", camera: "Trung cận", lens: "35mm" },
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
  { id: "f1", category: "identity", status: "pass", title: "Nhận diện nhân vật", detail: "Linh và Minh vẫn khớp với ảnh chuẩn đã khóa.", evidence: "Hình dáng khuôn mặt, khoảng cách hai mắt và đường nét mái tóc đều khớp." },
  { id: "f2", category: "look", status: "review", title: "Cổ áo khoác", detail: "Cổ áo của Linh hơi rộng hơn ảnh chuẩn trang phục.", evidence: "So sánh phần thân trên, mép cổ áo bên trái." },
  { id: "f3", category: "item", status: "pass", title: "Người cầm điện thoại", detail: "Minh đang giữ chiếc điện thoại đỏ bằng tay phải, đúng chỉ đạo cảnh.", evidence: "Vật phẩm, chủ sở hữu và tay cầm đều khớp continuity của Cảnh 02." },
  { id: "f4", category: "environment", status: "pass", title: "Hẻm Sài Gòn", detail: "Mặt đường sau mưa và ánh sáng buổi sáng được giữ đúng." },
];
