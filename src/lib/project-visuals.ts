/** Covers are an explicit workspace asset, never an inference from a project name. */
export function getProjectCover(_name: string, _description = ""): string | null {
  void _name;
  void _description;
  return null;
}

export function getProjectRouteRef(project: { id: string; slug?: string | null }): string {
  return project.slug?.trim() || project.id;
}
