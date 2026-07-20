import type {
  ContinuityPolicy,
  DroppedReference,
  Provider,
  ReferenceEntry,
} from "./types";

const ROLE_ORDER: Record<ReferenceEntry["role"], number> = {
  edit_base: 0,
  identity_face: 1,
  identity_body: 2,
  look: 3,
  item: 4,
  previous_shot: 5,
  environment: 6,
  style: 7,
};

export interface RouteReferencesInput {
  provider: Provider;
  model: string;
  policy: ContinuityPolicy;
  references: ReferenceEntry[];
  isRepair?: boolean;
}

export interface RouteReferencesResult {
  selected: ReferenceEntry[];
  dropped: DroppedReference[];
}

function sortDeterministically(entries: ReferenceEntry[]) {
  return [...entries].sort((a, b) => {
    const roleDelta = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
    if (roleDelta !== 0) return roleDelta;
    const priorityDelta = b.priority - a.priority;
    if (priorityDelta !== 0) return priorityDelta;
    return `${a.assetId}:${a.imageId}:${a.hash}`.localeCompare(
      `${b.assetId}:${b.imageId}:${b.hash}`
    );
  });
}

function categoryFor(reference: ReferenceEntry) {
  if (reference.role.startsWith("identity_")) return "character" as const;
  if (reference.role === "style") return "style" as const;
  if (reference.role === "look" || reference.role === "item") return "object" as const;
  return null;
}

export function routeReferences(input: RouteReferencesInput): RouteReferencesResult {
  const ordered = sortDeterministically(input.references);
  const selected: ReferenceEntry[] = [];
  const dropped: DroppedReference[] = [];
  const seenHashes = new Set<string>();
  const totalLimit = input.provider === "openai" ? 16 : 14;
  const isNanoBananaPro =
    input.provider === "google" && input.model.startsWith("gemini-3-pro-image");
  const isNanoBanana2 =
    input.provider === "google" && input.model.startsWith("gemini-3.1-flash-image");
  const categoryCaps = isNanoBananaPro
    ? { character: 5, object: 6, style: 3 }
    : isNanoBanana2
      ? { character: 4, object: 10, style: 14 }
    : null;
  const counts = { character: 0, object: 0, style: 0 };

  for (const reference of ordered) {
    if (seenHashes.has(reference.hash)) {
      dropped.push({ ...reference, reason: "Duplicate image hash already selected" });
      continue;
    }

    const category = categoryFor(reference);
    if (categoryCaps && category && counts[category] >= categoryCaps[category]) {
      dropped.push({
        ...reference,
        reason: `${input.model} ${category} reference limit reached`,
      });
      continue;
    }
    if (selected.length >= totalLimit) {
      dropped.push({
        ...reference,
        reason: `${input.provider} total reference limit reached`,
      });
      continue;
    }

    selected.push(reference);
    seenHashes.add(reference.hash);
    if (category) counts[category] += 1;
  }

  if (input.isRepair && input.provider === "openai") {
    const editIndex = selected.findIndex((entry) => entry.role === "edit_base");
    if (editIndex < 0) {
      throw new Error("OpenAI mask repair requires an edit_base reference");
    }
    if (editIndex > 0) selected.unshift(...selected.splice(editIndex, 1));
  }

  return { selected, dropped };
}
