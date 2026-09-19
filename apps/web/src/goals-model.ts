export type Goal = {
  id: string;
  title: string;
  projectId: string | null;
  progress: number;
  targetDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export const GOALS_STORAGE_KEY = "sfera.goals.v1";

function nowIso() {
  return new Date().toISOString();
}

export function createGoal(partial: Partial<Goal> & Pick<Goal, "title">): Goal {
  const now = nowIso();
  return {
    id: partial.id ?? crypto.randomUUID(),
    title: partial.title,
    projectId: partial.projectId ?? null,
    progress: Math.max(0, Math.min(100, partial.progress ?? 0)),
    targetDate: partial.targetDate ?? null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now
  };
}

export function seedGoals(): Goal[] {
  return [
    createGoal({
      id: "goal-tarot-content",
      title: "Регулярно выпускать контент",
      projectId: "project-tarot-content",
      progress: 45
    }),
    createGoal({
      id: "goal-travel",
      title: "Подготовить следующую поездку",
      projectId: "sphere-travel",
      progress: 30
    })
  ];
}

export function readGoals(): Goal[] {
  try {
    const raw = localStorage.getItem(GOALS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((item) => createGoal(item));
    }
  } catch {
    // fall through
  }
  return seedGoals();
}
