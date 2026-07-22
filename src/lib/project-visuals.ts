const PROJECT_COVERS = {
  creator: "/media-studio/project-creator-ungden.webp",
  beauty: "/media-studio/project-beauty.webp",
  travel: "/media-studio/project-travel.webp",
  saigon: "/media-studio/project-saigon.webp",
  finance: "/media-studio/project-bull-bear.png",
  developer: "/media-studio/project-dev-memes.png",
} as const;

function normalizeProjectText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

export function getProjectCover(name: string, description = ""): string {
  const context = normalizeProjectText(`${name} ${description}`);

  if (/lam dep|my pham|skincare|beauty|360 do dep/.test(context)) return PROJECT_COVERS.beauty;
  if (/sai gon|ho chi minh|thanh pho/.test(context)) return PROJECT_COVERS.saigon;
  if (/du lich|phuot|travel|noi xa|kham pha/.test(context)) return PROJECT_COVERS.travel;
  if (/finance|tai chinh|chung khoan|dau tu|cau vang/.test(context)) return PROJECT_COVERS.finance;
  if (/dev|developer|lap trinh|code|cong nghe/.test(context)) return PROJECT_COVERS.developer;
  return PROJECT_COVERS.creator;
}

export function getProjectRouteRef(project: { id: string; slug?: string | null }): string {
  return project.slug?.trim() || project.id;
}
