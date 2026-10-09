/**
 * Kênh và dàn nhân vật dựng từ vài câu mô tả của chủ kênh. Tách khỏi route để
 * test được: phần dễ sai không phải giao diện mà là những gì AI trả về được
 * ghép thành dữ liệu kênh và mô tả nhân vật.
 */
import type { ArtDirectionId } from "@/lib/mascot-art-direction";

/** Kênh người thật hay kênh hoạt hình: quyết định cách vẽ mọi nhân vật của kênh. */
export type ChannelLook = "animated" | "photoreal";

export type ChannelDraft = {
  name: string;
  audience: string;
  tone: string;
  positioning: string;
  look: ChannelLook;
};

export const LOOK_LABEL: Record<ChannelLook, string> = {
  animated: "Hoạt hình 3D",
  photoreal: "Người thật",
};

export function isChannelLook(value: unknown): value is ChannelLook {
  return value === "animated" || value === "photoreal";
}

export function lookArtDirection(look: ChannelLook): ArtDirectionId {
  return look === "photoreal" ? "photoreal_human" : "soft_3d";
}

function line(value: unknown, max: number) {
  return String(value ?? "").replace(/["“”]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Chuẩn hoá gợi ý kênh từ AI. Tên rỗng thì trả null để người dùng tự gõ thay
 * vì nhận một ô tên trống đã "điền sẵn".
 */
export function channelFromSuggestion(raw: unknown): ChannelDraft | null {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = line(value.name, 60);
  if (!name) return null;
  return {
    name,
    audience: line(value.audience, 240),
    tone: line(value.tone, 300),
    positioning: line(value.positioning, 1000),
    look: isChannelLook(value.look) ? value.look : "animated",
  };
}

/** Những cột của bảng `projects` mà kênh mới cần. */
export function projectFields(draft: ChannelDraft) {
  return {
    name: draft.name.trim(),
    description: draft.positioning.trim() || null,
    audience: draft.audience.trim() || null,
    brand_voice: draft.tone.trim() || null,
    style_prompt: `${LOOK_LABEL[draft.look]}. ${draft.tone.trim()}`.trim(),
  };
}

export type CastMember = { name: string; description: string; personality: string };

/**
 * Nhân vật AI gợi ý. Mô tả là thứ AI dùng để vẽ, nên bỏ những gợi ý không có
 * mô tả ngoại hình; trùng tên với nhân vật đã có cũng bỏ.
 */
export function castFromSuggestion(raw: unknown, existingNames: string[] = [], limit = 4): CastMember[] {
  const list = Array.isArray(raw) ? raw : [];
  const taken = new Set(existingNames.map((name) => name.trim().toLocaleLowerCase("vi")));
  const cast: CastMember[] = [];
  for (const item of list) {
    const value = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const name = line(value.name, 40);
    const description = String(value.description ?? value.appearance ?? "").replace(/\s+/g, " ").trim().slice(0, 1200);
    if (!name || description.length < 20) continue;
    const key = name.toLocaleLowerCase("vi");
    if (taken.has(key)) continue;
    taken.add(key);
    cast.push({ name, description, personality: line(value.personality, 600) });
    if (cast.length >= limit) break;
  }
  return cast;
}

/** Slug dự án: tên không dấu + 8 ký tự ngẫu nhiên để hai kênh trùng tên vẫn khác đường dẫn. */
export function slugifyProjectName(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return base || "du-an";
}
