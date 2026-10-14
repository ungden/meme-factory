/**
 * Ba ý của hồ sơ kênh mà người dùng tự viết: người xem, giọng kể, kênh hay kể
 * chuyện gì. Nguồn là ba cột của `projects` (audience, brand_voice,
 * description) do bước tạo kênh ghi và trang Cài đặt kênh sửa; hồ sơ phim
 * (`channel_profiles`) chỉ là bản có phiên bản đi theo chúng. Xem migration
 * 20261014160000_one_channel_profile.sql.
 */
export type ProfileFields = { audience: string; tone: string; positioning: string };
export type ProfileField = keyof ProfileFields;

export const PROFILE_FIELDS: ProfileField[] = ["audience", "tone", "positioning"];

export const PROFILE_FIELD_LIMIT: Record<ProfileField, number> = {
  audience: 240,
  tone: 500,
  positioning: 1000,
};

export const PROFILE_FIELD_LABEL: Record<ProfileField, string> = {
  audience: "Người xem",
  tone: "Giọng kể",
  positioning: "Kênh hay kể chuyện gì",
};

export const PROFILE_FIELD_PLACEHOLDER: Record<ProfileField, string> = {
  audience: "Ví dụ: bố mẹ trẻ 25–35 tuổi",
  tone: "Ví dụ: hài đời thường, ấm áp",
  positioning: "Ví dụ: những tình huống nhỏ trong nhà, có hành động rõ ràng và kết tự nhiên.",
};

type Source = Partial<Record<string, unknown>> | null | undefined;

const clean = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** Cột của `projects` mang từng ý. */
export function projectProfileFields(project: Source): ProfileFields {
  return {
    audience: clean(project?.audience, PROFILE_FIELD_LIMIT.audience),
    tone: clean(project?.brand_voice, PROFILE_FIELD_LIMIT.tone),
    positioning: clean(project?.description, PROFILE_FIELD_LIMIT.positioning),
  };
}

/**
 * Giá trị dùng cho một phiên bản hồ sơ mới: chữ người dùng vừa gửi, rồi cột
 * của kênh, rồi hồ sơ phim cũ. Studio phim chỉ gửi ý còn thiếu (hoặc không gửi
 * gì khi kênh đã đủ), nên không ý nào bị hỏi lại.
 */
export function resolveProfileFields(body: Source, project: Source, current: Source): ProfileFields {
  const fromProject = projectProfileFields(project);
  const pick = (field: ProfileField) =>
    clean(body?.[field], PROFILE_FIELD_LIMIT[field]) ||
    fromProject[field] ||
    clean(current?.[field], PROFILE_FIELD_LIMIT[field]);
  return { audience: pick("audience"), tone: pick("tone"), positioning: pick("positioning") };
}

export function missingProfileFields(fields: Partial<ProfileFields> | null | undefined): ProfileField[] {
  return PROFILE_FIELDS.filter((field) => !String(fields?.[field] || "").trim());
}
