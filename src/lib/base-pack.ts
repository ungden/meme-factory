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
 * One recipe per reaction in the taxonomy, so a mascot can be built out in a single
 * run and then reused forever. Framing follows the feeling: sharp reactions read
 * best close up, calmer ones need the body, and a few sit off to one side to leave
 * a column for longer captions.
 */
export const BASE_PACK_RECIPES: BasePackRecipe[] = [
  // Anchor first: the calm, straight-on look every other image is matched against.
  { id: "neutral", expressionSlug: "neutral", label: "Bình thường", layoutGroup: "medium_portrait", poseBrief: "bình thản, nhìn thẳng, thân thiện", defaultSelected: true },

  // Positive
  { id: "happy", expressionSlug: "happy", label: "Vui", layoutGroup: "tight_closeup", poseBrief: "cười tươi, mắt cong, phấn khởi", defaultSelected: true },
  { id: "laughing", expressionSlug: "laughing", label: "Cười lớn", layoutGroup: "tight_closeup", poseBrief: "cười ngặt nghẽo, há miệng, nhắm tịt mắt", defaultSelected: true },
  { id: "excited", expressionSlug: "excited", label: "Hào hứng", layoutGroup: "medium_portrait", poseBrief: "mắt sáng rực, hai tay giơ lên, nhún người", defaultSelected: true },
  { id: "love", expressionSlug: "love", label: "Thả tim", layoutGroup: "medium_portrait", poseBrief: "mắt hình trái tim, hai tay ôm ngực", defaultSelected: true },
  { id: "chill", expressionSlug: "chill", label: "Chill", layoutGroup: "offset_composition", subjectSide: "left", poseBrief: "thư giãn, ngả người, thảnh thơi", defaultSelected: true },
  { id: "proud", expressionSlug: "proud", label: "Tự hào", layoutGroup: "offset_composition", subjectSide: "right", poseBrief: "ưỡn ngực, ngẩng cao đầu, tay chống hông", defaultSelected: true },

  // Playful
  { id: "cool", expressionSlug: "cool", label: "Ngầu", layoutGroup: "tight_closeup", poseBrief: "đeo kính râm, nhếch mép, cực kỳ tự tin", defaultSelected: true },
  { id: "side_eye", expressionSlug: "side_eye", label: "Liếc xéo", layoutGroup: "tight_closeup", poseBrief: "liếc xéo sang bên, môi mím, đầy phán xét", defaultSelected: true },
  { id: "skeptical", expressionSlug: "skeptical", label: "Nghi ngờ", layoutGroup: "tight_closeup", poseBrief: "nhướn một bên mày, ánh mắt không tin", defaultSelected: true },
  { id: "smug", expressionSlug: "smug", label: "Tự đắc", layoutGroup: "medium_portrait", poseBrief: "cười nửa miệng tự đắc, khoanh tay", defaultSelected: true },
  { id: "gossip", expressionSlug: "gossip", label: "Hóng chuyện", layoutGroup: "medium_portrait", poseBrief: "che miệng ghé tai, mắt láo liên hóng chuyện", defaultSelected: true },
  { id: "sarcastic", expressionSlug: "sarcastic", label: "Mỉa mai", layoutGroup: "tight_closeup", poseBrief: "cười khẩy mỉa mai, một bên mày nhướn cao", defaultSelected: true },

  // Neutral / thinking
  { id: "thinking", expressionSlug: "thinking", label: "Đang nghĩ", layoutGroup: "medium_portrait", poseBrief: "tay chống cằm, mắt nhìn lên suy nghĩ", defaultSelected: true },
  { id: "confused", expressionSlug: "confused", label: "Khó hiểu", layoutGroup: "medium_portrait", poseBrief: "ngơ ngác, nghiêng đầu, nhíu mày khó hiểu", defaultSelected: true },
  { id: "overthinking", expressionSlug: "overthinking", label: "Nghĩ nhiều", layoutGroup: "medium_portrait", poseBrief: "hai tay ôm đầu, mắt đờ đẫn vì nghĩ quá nhiều", defaultSelected: true },
  { id: "awkward", expressionSlug: "awkward", label: "Ngượng", layoutGroup: "tight_closeup", poseBrief: "cười gượng, gãi đầu, mắt né đi chỗ khác", defaultSelected: true },
  { id: "bored", expressionSlug: "bored", label: "Chán", layoutGroup: "medium_portrait", poseBrief: "chống cằm lơ đãng, mắt lim dim chán chường", defaultSelected: true },

  // Negative
  { id: "sad", expressionSlug: "sad", label: "Buồn", layoutGroup: "tight_closeup", poseBrief: "cúi mặt, mắt buồn rười rượi, môi trề", defaultSelected: true },
  { id: "crying", expressionSlug: "crying", label: "Khóc", layoutGroup: "tight_closeup", poseBrief: "khóc oà, nước mắt chảy thành dòng", defaultSelected: true },
  { id: "angry", expressionSlug: "angry", label: "Giận", layoutGroup: "tight_closeup", poseBrief: "giận dữ, cau mày, mặt đỏ bừng", defaultSelected: true },
  { id: "tired", expressionSlug: "tired", label: "Mệt", layoutGroup: "medium_portrait", poseBrief: "uể oải, mắt lim dim, vai xuôi xuống", defaultSelected: true },
  { id: "exhausted", expressionSlug: "exhausted", label: "Kiệt sức", layoutGroup: "medium_portrait", poseBrief: "gục xuống bàn, quầng thâm mắt, hết sức", defaultSelected: true },
  { id: "dead_inside", expressionSlug: "dead_inside", label: "Hết hồn hết vía", layoutGroup: "offset_composition", subjectSide: "left", poseBrief: "mắt vô hồn, đứng bất động, cạn cảm xúc", defaultSelected: true },

  // Intense
  { id: "surprised", expressionSlug: "surprised", label: "Bất ngờ", layoutGroup: "tight_closeup", poseBrief: "mắt mở to, chân mày nhướn hết cỡ, miệng chữ O", defaultSelected: true },
  { id: "shocked", expressionSlug: "shocked", label: "Sốc", layoutGroup: "tight_closeup", poseBrief: "trợn tròn mắt, há hốc miệng vì sốc", defaultSelected: true },
  { id: "panic", expressionSlug: "panic", label: "Hoảng", layoutGroup: "tight_closeup", poseBrief: "hoảng loạn, mồ hôi túa ra, hai tay ôm đầu", defaultSelected: true },
  { id: "scared", expressionSlug: "scared", label: "Sợ", layoutGroup: "medium_portrait", poseBrief: "co rúm người, run rẩy, mắt sợ hãi", defaultSelected: true },
  { id: "savage", expressionSlug: "savage", label: "Gắt", layoutGroup: "tight_closeup", poseBrief: "mặt gắt gỏng, ánh mắt sắc lẹm, sẵn sàng đốp lại", defaultSelected: true },
];

/** The image every other one is matched against; generated and approved first. */
export const ANCHOR_RECIPE_ID = "neutral";

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

/**
 * Recipes a mascot does not have artwork for yet. Drives "carry on where you left
 * off" so a run that stopped halfway never has to be paid for twice.
 */
export function missingRecipes(existingExpressionSlugs: Iterable<string>): BasePackRecipe[] {
  const owned = new Set(existingExpressionSlugs);
  return BASE_PACK_RECIPES.filter((recipe) => !owned.has(recipe.expressionSlug));
}
