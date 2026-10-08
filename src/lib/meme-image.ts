import "server-only";
import {
  compileMemeImagePrompt,
  generateMemeImage,
  IMAGE_MODEL,
  type GeneratedImageResult,
  type GenerateMemeImageParams,
} from "@/lib/gemini-image";
import { estimateImageGenerationPrice, type ImagePriceEstimate } from "@/lib/ai-pricing";
import {
  OPENAI_IMAGE_MODEL,
  generateMemeImageWithOpenAI,
  openAiSizeFor,
} from "@/lib/openai-image";
import { hasOpenAiApiKey } from "@/lib/server-secrets";
import { buildMemeManifest } from "@/lib/continuity/meme-manifest";
import type { GenerationRecipe } from "@/lib/continuity/types";

export type MemeImagePlan = {
  providerParams: GenerateMemeImageParams;
  recipe: GenerationRecipe;
  priceEstimate: ImagePriceEstimate;
  useOpenAi: boolean;
};

/**
 * Chọn ảnh tham chiếu, dựng prompt và chọn model cho một meme.
 *
 * Tách khỏi route để luồng tạo meme phía server (tự sản xuất, bấm một nút)
 * dùng đúng cùng cách chọn tham chiếu và cùng model như trang Tạo ảnh — hai
 * bản sao sẽ lệch nhau ở lần sửa prompt kế tiếp.
 */
export function planMemeImage(params: GenerateMemeImageParams, sourceMemeId?: string): MemeImagePlan {
  const manifestInput = {
    model: IMAGE_MODEL,
    policy: "balanced" as const,
    aspectRatio: params.format,
    characters: params.characters,
    referenceImages: params.referenceImages,
    watermark: params.watermark,
    sourceMemeId,
  };
  const initialPlan = buildMemeManifest({ ...manifestInput, prompt: "" });
  const selectedCharacterIndexes = new Set(initialPlan.selectedCharacterIndexes);
  const selectedContextIndexes = new Set(initialPlan.selectedContextIndexes);
  const providerParams: GenerateMemeImageParams = {
    ...params,
    characters: params.characters.map((character, index) =>
      character.poseImageBase64 && !selectedCharacterIndexes.has(index)
        ? { ...character, poseImageBase64: undefined, poseMimeType: undefined }
        : character,
    ),
    referenceImages: params.referenceImages?.filter((_, index) => selectedContextIndexes.has(index)),
    watermark: params.watermark
      ? {
          ...params.watermark,
          logoBase64: initialPlan.includeWatermarkLogo ? params.watermark.logoBase64 : undefined,
          logoMimeType: initialPlan.includeWatermarkLogo ? params.watermark.logoMimeType : undefined,
        }
      : undefined,
  };
  const compiledPrompt = compileMemeImagePrompt(providerParams);
  const manifestPlan = buildMemeManifest({ ...manifestInput, prompt: compiledPrompt });
  // The caption is drawn by the model here, and Vietnamese diacritics are
  // where Gemini slips. GPT Image 2 is the provider OpenAI documents for
  // text rendering, and at medium quality it also costs less than Gemini 1K
  // (0.053 vs 0.067 USD), so text memes route there when a key exists.
  const wantsRenderedText = Boolean(params.headline?.trim() || params.subtext?.trim());
  const useOpenAi = wantsRenderedText && hasOpenAiApiKey();
  return {
    providerParams,
    useOpenAi,
    recipe: useOpenAi
      ? { ...manifestPlan.recipe, provider: "openai", model: OPENAI_IMAGE_MODEL }
      : manifestPlan.recipe,
    priceEstimate: useOpenAi
      ? estimateImageGenerationPrice({
          model: "gpt-image-2",
          resolution: openAiSizeFor(params.format).resolution,
          quality: "medium",
          inputImageCount: manifestPlan.recipe.references.length,
          prompt: compiledPrompt,
        })
      : estimateImageGenerationPrice({
          model: IMAGE_MODEL,
          resolution: "1K",
          inputImageCount: manifestPlan.recipe.references.length,
          prompt: compiledPrompt,
        }),
  };
}

export function runMemeImage(plan: MemeImagePlan): Promise<GeneratedImageResult> {
  return plan.useOpenAi
    ? generateMemeImageWithOpenAI({ ...plan.providerParams, quality: "medium" })
    : generateMemeImage(plan.providerParams);
}
