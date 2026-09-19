export type ProjectKind = "sphere" | "project";

export type ProjectNode = {
  id: string;
  title: string;
  parentId: string | null;
  kind: ProjectKind;
  order: number;
  collapsed: boolean;
  createdAt: string;
  updatedAt: string;
};

export const PROJECTS_STORAGE_KEY = "sfera.projects.v1";

function nowIso() {
  return new Date().toISOString();
}

export function createProject(partial: Partial<ProjectNode> & Pick<ProjectNode, "title">): ProjectNode {
  const now = nowIso();
  return {
    id: partial.id ?? crypto.randomUUID(),
    title: partial.title,
    parentId: partial.parentId ?? null,
    kind: partial.kind ?? "project",
    order: partial.order ?? 0,
    collapsed: partial.collapsed ?? false,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now
  };
}

export function seedProjects(): ProjectNode[] {
  return [
    createProject({ id: "sphere-family", title: "Семья", kind: "sphere", order: 10 }),
    createProject({ id: "project-home", title: "Мой дом", parentId: "sphere-family", order: 10 }),
    createProject({ id: "project-repair", title: "Ремонт", parentId: "project-home", order: 10 }),
    createProject({ id: "project-bills", title: "Дом и платежи", parentId: "project-home", order: 20 }),

    createProject({ id: "sphere-business", title: "Бизнес", kind: "sphere", order: 20 }),
    createProject({ id: "project-practice", title: "Практика", parentId: "sphere-business", order: 10 }),
    createProject({ id: "project-content", title: "Контент", parentId: "sphere-business", order: 20 }),

    createProject({ id: "sphere-hobbies", title: "Увлечения", kind: "sphere", order: 30 }),
    createProject({ id: "project-3d", title: "3D-печать", parentId: "sphere-hobbies", order: 10 }),
    createProject({ id: "project-music", title: "Музыка", parentId: "sphere-hobbies", order: 20 })
  ];
}

export function readProjects(): ProjectNode[] {
  try {
    const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => createProject(item));
      }
    }
  } catch {
    // fall through
  }
  return seedProjects();
}

export function projectChildren(projects: ProjectNode[], parentId: string | null) {
  return projects
    .filter((project) => project.parentId === parentId)
    .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

export function projectDescendants(projects: ProjectNode[], parentId: string): ProjectNode[] {
  const direct = projectChildren(projects, parentId);
  return direct.flatMap((child) => [child, ...projectDescendants(projects, child.id)]);
}

export function nextProjectOrder(projects: ProjectNode[], parentId: string | null) {
  const siblings = projectChildren(projects, parentId);
  return siblings.length ? Math.max(...siblings.map((item) => item.order)) + 10 : 10;
}

export function projectPath(projects: ProjectNode[], projectId: string | null | undefined) {
  if (!projectId) return "";
  const chain: ProjectNode[] = [];
  let current = projects.find((item) => item.id === projectId);
  const seen = new Set<string>();

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.parentId ? projects.find((item) => item.id === current!.parentId) : undefined;
  }

  return chain.map((item) => item.title).join(" / ");
}

export function flattenProjects(projects: ProjectNode[]) {
  const result: Array<{ project: ProjectNode; depth: number; path: string }> = [];

  function walk(parentId: string | null, depth: number, prefix: string[]) {
    for (const project of projectChildren(projects, parentId)) {
      const path = [...prefix, project.title];
      result.push({ project, depth, path: path.join(" / ") });
      walk(project.id, depth + 1, path);
    }
  }

  walk(null, 0, []);
  return result;
}
