/** Private storage paths are literal project-prefixed object keys, never URLs. */
export function isProjectMediaPath(projectId: string, path: unknown): path is string {
  if (typeof path !== "string" || !path.startsWith(`${projectId}/`)) return false;
  if (/[\\%?#\u0000-\u001f]/.test(path)) return false;
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}
