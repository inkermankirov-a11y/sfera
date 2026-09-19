export type Priority = 1 | 2 | 3 | 4;
export type TaskStatus = "active" | "done";
export type Filter = "all" | "today" | "inbox" | "overdue" | "done";

export type Reminder = {
  id: string;
  at: string;
};

export type TaskComment = {
  id: string;
  body: string;
  createdAt: string;
};

export type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  parentId: string | null;
  projectId: string | null;
  order: number;
  date: string | null;
  time: string | null;
  deadline: string | null;
  durationMinutes: number | null;
  recurrence: string | null;
  priority: Priority;
  labels: string[];
  reminders: Reminder[];
  comments: TaskComment[];
  collapsed: boolean;
  showCompletedSubtasks: boolean;
  resetSubtasks: boolean;
  uncompletable: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export const STORAGE_KEY = "sfera.tasks.v2";
const OLD_STORAGE_KEY = "sfera.tasks.v1";

export function isoToday() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function isoTomorrow() {
  const d = new Date(isoToday() + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function nowIso() {
  return new Date().toISOString();
}

export function createTask(partial: Partial<Task> & Pick<Task, "title">): Task {
  const now = nowIso();
  return {
    id: partial.id ?? crypto.randomUUID(),
    title: partial.title,
    description: partial.description ?? "",
    status: partial.status ?? "active",
    parentId: partial.parentId ?? null,
    projectId: partial.projectId ?? null,
    order: partial.order ?? 0,
    date: partial.date ?? null,
    time: partial.time ?? null,
    deadline: partial.deadline ?? null,
    durationMinutes: partial.durationMinutes ?? null,
    recurrence: partial.recurrence ?? null,
    priority: partial.priority ?? 4,
    labels: partial.labels ?? [],
    reminders: partial.reminders ?? [],
    comments: partial.comments ?? [],
    collapsed: partial.collapsed ?? false,
    showCompletedSubtasks: partial.showCompletedSubtasks ?? false,
    resetSubtasks: partial.resetSubtasks ?? false,
    uncompletable: partial.uncompletable ?? false,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    completedAt: partial.completedAt ?? null
  };
}

export function seedTasks(): Task[] {
  const today = isoToday();
  const parent = createTask({
    title: "Подготовить поездку",
    date: today,
    priority: 1,
    labels: ["личное"],
    order: 10,
    description: "Главная задача с подзадачами. Можно сворачивать дерево и открывать каждую подзадачу отдельно.",
    projectId: "sphere-family"
  });
  const dates = createTask({
    title: "Согласовать даты",
    parentId: parent.id,
    projectId: "sphere-family",
    priority: 2,
    order: 10
  });
  const tickets = createTask({
    title: "Купить билеты",
    parentId: parent.id,
    priority: 2,
    order: 20,
    labels: ["покупки"],
    description: "Посмотреть варианты после 18:00.",
    projectId: "sphere-family"
  });
  const hotel = createTask({
    title: "Забронировать гостиницу",
    parentId: parent.id,
    projectId: "sphere-family",
    priority: 3,
    order: 30
  });
  const docs = createTask({
    title: "Проверить документы",
    parentId: tickets.id,
    projectId: "sphere-family",
    priority: 4,
    order: 10
  });

  return [
    createTask({
      title: "Позвонить клиенту",
      date: today,
      time: "14:00",
      durationMinutes: 30,
      priority: 1,
      labels: ["работа", "звонок"],
      order: 0,
      description: "Обсудить следующую встречу.",
      projectId: "project-practice"
    }),
    parent,
    dates,
    tickets,
    hotel,
    docs,
    createTask({
      title: "Еженедельный обзор",
      date: today,
      recurrence: "каждую неделю",
      priority: 2,
      resetSubtasks: true,
      order: 30
    }),
    createTask({
      title: "Разобрать фотографии",
      priority: 4,
      order: 40
    })
  ];
}

function migrateOldTask(raw: any, index: number): Task {
  const priorityMap: Record<string, Priority> = {
    high: 1,
    medium: 3,
    low: 4
  };

  return createTask({
    id: raw.id,
    title: raw.title ?? "Без названия",
    description: raw.description ?? "",
    status: raw.status === "done" ? "done" : "active",
    parentId: null,
    projectId: raw.projectId ?? null,
    order: index * 10,
    date: raw.date ?? null,
    priority: priorityMap[raw.priority] ?? 4,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt
  } as any);
}

export function readTasks(): Task[] {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) {
      const parsed = JSON.parse(current);
      if (Array.isArray(parsed)) return parsed.map((task) => ({ ...task, projectId: task.projectId ?? null })) as Task[];
    }

    const old = localStorage.getItem(OLD_STORAGE_KEY);
    if (old) {
      const parsed = JSON.parse(old);
      if (Array.isArray(parsed)) return parsed.map(migrateOldTask);
    }
  } catch {
    // fall through to seed
  }

  return seedTasks();
}

export function formatDate(date: string | null) {
  if (!date) return "Без даты";
  if (date === isoToday()) return "Сегодня";
  if (date === isoTomorrow()) return "Завтра";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short"
  }).format(new Date(date + "T12:00:00"));
}

export function formatDuration(minutes: number | null) {
  if (!minutes) return "";
  if (minutes < 60) return minutes + " мин";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

export function childrenOf(tasks: Task[], parentId: string | null) {
  return tasks
    .filter((task) => task.parentId === parentId)
    .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

export function descendantsOf(tasks: Task[], parentId: string): Task[] {
  const direct = childrenOf(tasks, parentId);
  return direct.flatMap((child) => [child, ...descendantsOf(tasks, child.id)]);
}

export function depthOf(tasks: Task[], task: Task) {
  let depth = 0;
  let current = task;
  const seen = new Set<string>();

  while (current.parentId && depth < 12) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    const parent = tasks.find((item) => item.id === current.parentId);
    if (!parent) break;
    depth += 1;
    current = parent;
  }

  return depth;
}

export function nextOrder(tasks: Task[], parentId: string | null) {
  const siblings = childrenOf(tasks, parentId);
  return siblings.length ? Math.max(...siblings.map((task) => task.order)) + 10 : 10;
}

function weekdayIndex(name: string) {
  const key = name.toLowerCase();
  const map: Record<string, number> = {
    mon: 1, monday: 1, пн: 1, понедельник: 1,
    tue: 2, tuesday: 2, вт: 2, вторник: 2,
    wed: 3, wednesday: 3, ср: 3, среда: 3,
    thu: 4, thursday: 4, чт: 4, четверг: 4,
    fri: 5, friday: 5, пт: 5, пятница: 5,
    sat: 6, saturday: 6, сб: 6, суббота: 6,
    sun: 0, sunday: 0, вс: 0, воскресенье: 0
  };
  return map[key];
}

export function nextRecurringDate(date: string | null, rule: string | null) {
  if (!rule) return null;
  const base = new Date((date ?? isoToday()) + "T12:00:00");
  const r = rule.trim().toLowerCase();

  if (/^(каждый день|ежедневно|every day|daily)$/.test(r)) {
    base.setDate(base.getDate() + 1);
  } else if (/^(каждую неделю|еженедельно|every week|weekly)$/.test(r)) {
    base.setDate(base.getDate() + 7);
  } else if (/^(каждый месяц|ежемесячно|every month|monthly)$/.test(r)) {
    base.setMonth(base.getMonth() + 1);
  } else if (/^(каждый год|ежегодно|every year|yearly)$/.test(r)) {
    base.setFullYear(base.getFullYear() + 1);
  } else if (/^(по будням|каждый будний день|every weekday|every workday)$/.test(r)) {
    do {
      base.setDate(base.getDate() + 1);
    } while (base.getDay() === 0 || base.getDay() === 6);
  } else {
    const m = r.match(/^(?:кажд(?:ый|ую)|every)\s+([a-zа-яё]+)/i);
    if (!m) return null;
    const target = weekdayIndex(m[1]);
    if (target === undefined) return null;
    do {
      base.setDate(base.getDate() + 1);
    } while (base.getDay() !== target);
  }

  return base.toISOString().slice(0, 10);
}

export type ParsedQuickAdd = {
  title: string;
  priority: Priority;
  labels: string[];
  date: string | null;
  time: string | null;
  deadline: string | null;
  recurrence: string | null;
  uncompletable: boolean;
};

export function parseQuickAdd(input: string): ParsedQuickAdd {
  let text = input.trim();
  let priority: Priority = 4;
  const p = text.match(/(?:^|\s)p([1-4])(?:\s|$)/i);
  if (p) {
    priority = Number(p[1]) as Priority;
    text = text.replace(p[0], " ");
  }

  const labels: string[] = [];
  text = text.replace(/(?:^|\s)%([\p{L}\p{N}_-]+)/gu, (_, label) => {
    labels.push(label);
    return " ";
  });

  let deadline: string | null = null;
  text = text.replace(/\{(\d{4}-\d{2}-\d{2})\}/, (_, value) => {
    deadline = value;
    return " ";
  });

  let date: string | null = null;
  let time: string | null = null;
  if (/\b(сегодня|today)\b/i.test(text)) {
    date = isoToday();
    text = text.replace(/\b(сегодня|today)\b/gi, " ");
  } else if (/\b(завтра|tomorrow)\b/i.test(text)) {
    date = isoTomorrow();
    text = text.replace(/\b(завтра|tomorrow)\b/gi, " ");
  }

  const tm = text.match(/(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)(?:\s|$)/);
  if (tm) {
    time = tm[1].padStart(2, "0") + ":" + tm[2];
    text = text.replace(tm[0], " ");
  }

  let recurrence: string | null = null;
  const recurrencePatterns = [
    "каждый день",
    "каждую неделю",
    "каждый месяц",
    "каждый год",
    "по будням",
    "every day",
    "every week",
    "every month",
    "every year",
    "every weekday"
  ];

  for (const rule of recurrencePatterns) {
    if (text.toLowerCase().includes(rule)) {
      recurrence = rule;
      text = text.replace(new RegExp(rule, "i"), " ");
      if (!date) date = isoToday();
      break;
    }
  }

  const uncompletable = /^\*\s+/.test(text);
  text = text.replace(/^\*\s+/, "");

  return {
    title: text.replace(/\s+/g, " ").trim(),
    priority,
    labels,
    date,
    time,
    deadline,
    recurrence,
    uncompletable
  };
}
