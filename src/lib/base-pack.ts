import type { BaseLayoutGroup } from "@/lib/gemini-image";
import { POINT_COSTS } from "@/lib/point-pricing";

export interface BasePackRecipe {
  id: string;
  /** Must exist in public.expression_tags — the base image FK rejects anything else. */
  expressionSlug: string;
  label: string;
  layoutGroup: BaseLayoutGroup;
  subjectSide?: "left" | "right";
  /** Passed to the generator as the emotion/pose brief. */
  poseBrief: string;
  defaultSelected: boolean;
}

/**
 * One pack covers the reactions a Vietnamese fanpage actually posts, across the
 * three layout groups so captions have somewhere to live.
 */
export const BASE_PACK_RECIPES: BasePackRecipe[] = [
  { id: "neutral-portrait", expressionSlug: "neutral", label: "Bình thường", layoutGroup: "medium_portrait", poseBrief: "bình thản, nhìn thẳng, thân thiện", defaultSelected: true },
  { id: "happy-closeup", expressionSlug: "happy", label: "Vui", layoutGroup: "tight_closeup", poseBrief: "cười tươi, mắt cong, phấn khởi", defaultSelected: true },
  { id: "laughing-closeup", expressionSlug: "laughing", label: "Cười lớn", layoutGroup: "tight_closeup", poseBrief: "cười ngặt nghẽo, há miệng, nhắm mắt", defaultSelected: true },
  { id: "side-eye-closeup", expressionSlug: "side_eye", label: "Liếc xéo", layoutGroup: "tight_closeup", poseBrief: "liếc xéo sang bên, môi mím, đầy phán xét", defaultSelected: true },
  { id: "skeptical-closeup", expressionSlug: "skeptical", label: "Nghi ngờ", layoutGroup: "tight_closeup", poseBrief: "nhướn một bên mày, ánh mắt không tin", defaultSelected: true },
  { id: "shocked-closeup", expressionSlug: "shocked", label: "Sốc", layoutGroup: "tight_closeup", poseBrief: "mắt trợn tròn, miệng há to vì sốc", defaultSelected: true },
  { id: "panic-closeup", expressionSlug: "panic", label: "Hoảng", layoutGroup: "tight_closeup", poseBrief: "hoảng loạn, mồ hôi, hai tay ôm đầu", defaultSelected: true },
  { id: "crying-closeup", expressionSlug: "crying", label: "Khóc", layoutGroup: "tight_closeup", poseBrief: "khóc oà, nước mắt chảy thành dòng", defaultSelected: true },
  { id: "angry-closeup", expressionSlug: "angry", label: "Giận", layoutGroup: "tight_closeup", poseBrief: "giận dữ, cau mày, mặt đỏ", defaultSelected: true },
  { id: "tired-portrait", expressionSlug: "tired", label: "Mệt", layoutGroup: "medium_portrait", poseBrief: "uể oải, mắt lim dim, vai xuôi", defaultSelected: true },
  { id: "exhausted-portrait", expressionSlug: "exhausted", label: "Kiệt sức", layoutGroup: "medium_portrait", poseBrief: "kiệt sức, gục xuống bàn, quầng thâm mắt", defaultSelected: true },
  { id: "thinking-portrait", expressionSlug: "thinking", label: "Đang nghĩ", layoutGroup: "medium_portrait", poseBrief: "tay chống cằm, mắt nhìn lên suy nghĩ", defaultSelected: true },
  { id: "confused-portrait", expressionSlug: "confused", label: "Khó hiểu", layoutGroup: "medium_portrait", poseBrief: "ngơ ngác, nghiêng đầu, nhíu mày khó hiểu", defaultSelected: false },
  { id: "smug-portrait", expressionSlug: "smug", label: "Tự đắc", layoutGroup: "medium_portrait", poseBrief: "cười nửa miệng tự đắc, khoanh tay", defaultSelected: false },
  { id: "love-portrait", expressionSlug: "love", label: "Thả tim", layoutGroup: "medium_portrait", poseBrief: "mắt hình trái tim, hai tay ôm ngực", defaultSelected: false },
  { id: "chill-offset-left", expressionSlug: "chill", label: "Chill", layoutGroup: "offset_composition", subjectSide: "left", poseBrief: "thư giãn, ngồi tựa lưng, thảnh thơi", defaultSelected: false },
  { id: "proud-offset-right", expressionSlug: "proud", label: "Tự hào", layoutGroup: "offset_composition", subjectSide: "right", poseBrief: "đứng thẳng, ngẩng cao đầu, tay chống hông", defaultSelected: false },
  { id: "dead-inside-offset-left", expressionSlug: "dead_inside", label: "Hết hồn hết vía", layoutGroup: "offset_composition", subjectSide: "left", poseBrief: "mắt vô hồn, đứng bất động, hết cảm xúc", defaultSelected: false },
];

export const DEFAULT_PACK_RECIPE_IDS = BASE_PACK_RECIPES.filter((recipe) => recipe.defaultSelected).map(
  (recipe) => recipe.id
);

/** Base packs bill through the existing `character` action; nothing new to price. */
export function estimatePackCost(imageCount: number): number {
  return Math.max(0, imageCount) * POINT_COSTS.character;
}

export function recipeById(id: string): BasePackRecipe | undefined {
  return BASE_PACK_RECIPES.find((recipe) => recipe.id === id);
}
