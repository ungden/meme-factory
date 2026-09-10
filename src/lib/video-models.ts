export const SEEDANCE_25_IMAGE_MODEL =
  "bytedance/seedance-2.5/image-to-video" as const;
export const SEEDANCE_25_TEXT_MODEL =
  "bytedance/seedance-2.5/text-to-video" as const;
export const SEEDANCE_20_FAST_IMAGE_MODEL =
  "bytedance/seedance-2.0-fast/image-to-video" as const;
export const SEEDANCE_20_FAST_TEXT_MODEL =
  "bytedance/seedance-2.0-fast/text-to-video" as const;

export const SEEDANCE_VARIANTS = [
  {
    id: "seedance-2.5",
    label: "Seedance 2.5",
    description: "Chất lượng cao",
    imageModel: SEEDANCE_25_IMAGE_MODEL,
    textModel: SEEDANCE_25_TEXT_MODEL,
    maxDurationSeconds: 30,
  },
  {
    id: "seedance-2.0-fast",
    label: "Seedance 2.0 Fast",
    description: "Tiết kiệm",
    imageModel: SEEDANCE_20_FAST_IMAGE_MODEL,
    textModel: SEEDANCE_20_FAST_TEXT_MODEL,
    maxDurationSeconds: 15,
  },
] as const;

export type SeedanceVariant = (typeof SEEDANCE_VARIANTS)[number]["id"];
export type FilmVideoModel =
  (typeof SEEDANCE_VARIANTS)[number]["imageModel"];

export function isSeedanceVariant(value: unknown): value is SeedanceVariant {
  return SEEDANCE_VARIANTS.some((item) => item.id === value);
}

export function seedanceVariant(value: unknown): SeedanceVariant {
  if (isSeedanceVariant(value)) return value;
  if (
    value === SEEDANCE_20_FAST_IMAGE_MODEL ||
    value === SEEDANCE_20_FAST_TEXT_MODEL
  )
    return "seedance-2.0-fast";
  return "seedance-2.5";
}

export function seedanceModel(
  variant: SeedanceVariant,
  mode: "text" | "image",
) {
  const item = SEEDANCE_VARIANTS.find((candidate) => candidate.id === variant)!;
  return mode === "text" ? item.textModel : item.imageModel;
}

export function seedanceImageModel(value: unknown): FilmVideoModel {
  return seedanceVariant(value) === "seedance-2.0-fast"
    ? SEEDANCE_20_FAST_IMAGE_MODEL
    : SEEDANCE_25_IMAGE_MODEL;
}

export function seedanceMaxDuration(value: unknown) {
  const variant = seedanceVariant(value);
  return SEEDANCE_VARIANTS.find((item) => item.id === variant)!
    .maxDurationSeconds;
}

export function validSeedanceDuration(value: unknown, model: unknown) {
  const duration = Number(value);
  return (
    Number.isInteger(duration) &&
    duration >= 4 &&
    duration <= seedanceMaxDuration(model)
  );
}
