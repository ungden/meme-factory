export function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("vi-VN");
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function slugifyProjectName(name: string) {
  return (name || "du-an")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function buildProjectSlug(name: string) {
  return `${slugifyProjectName(name)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildPoseUploadPath(projectId: string, characterId: string, extension: string) {
  return `${projectId}/${characterId}/${Date.now()}.${extension}`;
}
