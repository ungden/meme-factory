export const VISUAL_EVIDENCE_KINDS = [
  "cast",
  "prop",
  "count",
  "text",
  "spatial",
  "reveal",
] as const;

export type VisualEvidenceKind = (typeof VISUAL_EVIDENCE_KINDS)[number];

export type VisualRequirement = {
  id: string;
  kind: VisualEvidenceKind;
  description: string;
  visibleWhen: "opening" | "during" | "reveal" | "ending";
  importance: "critical" | "supporting";
  legibility: "recognizable" | "countable" | "readable";
};

export type DirectorReferenceImage = {
  id: string;
  role: "scene" | "character" | "prop" | "environment";
  purpose: string;
  framing: string;
  moment: string;
  prompt: string;
  requirementIds: string[];
};

export type SceneReferencePlan = {
  version: 1;
  storyMechanism: string;
  audienceMustSee: string[];
  characterKnowledge: string[];
  requirements: VisualRequirement[];
  referenceImages: DirectorReferenceImage[];
};

const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export function validateSceneReferencePlan(value: unknown): SceneReferencePlan {
  const plan = value as SceneReferencePlan;
  if (!plan || plan.version !== 1) throw new Error("REFERENCE_PLAN_INVALID");
  const requirements = Array.isArray(plan.requirements) ? plan.requirements : [];
  const images = Array.isArray(plan.referenceImages) ? plan.referenceImages : [];
  if (
    !clean(plan.storyMechanism, 800) ||
    requirements.length < 1 ||
    requirements.length > 24 ||
    images.length < 1 ||
    images.length > 16 ||
    new Set(requirements.map((item) => item.id)).size !== requirements.length ||
    new Set(images.map((item) => item.id)).size !== images.length
  )
    throw new Error("REFERENCE_PLAN_SHAPE_INVALID");
  const requirementIds = new Set(requirements.map((item) => item.id));
  if (
    requirements.some(
      (item) =>
        !ID.test(item.id) ||
        !VISUAL_EVIDENCE_KINDS.includes(item.kind) ||
        !["opening", "during", "reveal", "ending"].includes(item.visibleWhen) ||
        !["critical", "supporting"].includes(item.importance) ||
        !["recognizable", "countable", "readable"].includes(item.legibility) ||
        !clean(item.description, 700),
    ) ||
    images.some(
      (item) =>
        !ID.test(item.id) ||
        !["scene", "character", "prop", "environment"].includes(item.role) ||
        !clean(item.purpose, 500) ||
        !clean(item.framing, 300) ||
        !clean(item.moment, 500) ||
        !clean(item.prompt, 1800) ||
        !Array.isArray(item.requirementIds) ||
        !item.requirementIds.length ||
        item.requirementIds.some((id) => !requirementIds.has(id)),
    ) ||
    !images.some((item) => item.role === "scene")
  )
    throw new Error("REFERENCE_PLAN_ITEM_INVALID");
  for (const requirement of requirements.filter((item) => item.importance === "critical")) {
    const covering = images.filter((item) =>
      item.requirementIds.includes(requirement.id),
    );
    if (!covering.length)
      throw new Error(`REFERENCE_REQUIREMENT_UNCOVERED:${requirement.id}`);
  }
  return {
    version: 1,
    storyMechanism: clean(plan.storyMechanism, 800),
    audienceMustSee: (plan.audienceMustSee || []).map((x) => clean(x, 500)).filter(Boolean).slice(0, 12),
    characterKnowledge: (plan.characterKnowledge || []).map((x) => clean(x, 500)).filter(Boolean).slice(0, 12),
    requirements,
    referenceImages: images,
  };
}
