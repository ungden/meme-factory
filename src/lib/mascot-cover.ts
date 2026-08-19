/**
 * Picks the picture that represents a mascot.
 *
 * A mascot usually has no avatar_url — nothing in the app sets one automatically —
 * and its base images stay in `draft` until a human approves them. Resolving only
 * from approved artwork leaves a brand new mascot showing a bare letter, so fall
 * all the way through to the raw pose the user uploaded.
 */
export function resolveMascotCover(params: {
  avatarUrl?: string | null;
  baseImages?: { image_url: string | null; status?: string }[];
  poses?: { image_url: string | null }[];
}): string | null {
  const usable = (url: string | null | undefined): url is string =>
    typeof url === "string" && url.length > 0 && !url.startsWith("/mock/");

  if (usable(params.avatarUrl)) return params.avatarUrl;

  const images = params.baseImages ?? [];
  const ready = images.find((image) => image.status === "ready" && usable(image.image_url));
  if (ready?.image_url) return ready.image_url;

  const any = images.find((image) => image.status !== "archived" && usable(image.image_url));
  if (any?.image_url) return any.image_url;

  const pose = (params.poses ?? []).find((entry) => usable(entry.image_url));
  return pose?.image_url ?? null;
}
