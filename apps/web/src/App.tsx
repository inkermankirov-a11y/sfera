import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Filter,
  Priority,
  STORAGE_KEY,
  Task,
  TaskComment,
  childrenOf,
  createTask,
  depthOf,
  descendantsOf,
  formatDate,
  formatDuration,
  isoToday,
  nextOrder,
  nextRecurringDate,
  nowIso,
  parseQuickAdd,
  readTasks
} from "./tasks-model";
import {
  PROJECTS_STORAGE_KEY,
  ProjectNode,
  createProject,
  flattenProjects,
  nextProjectOrder,
  projectChildren,
  projectDescendants,
  projectPath,
  readProjects
} from "./projects-model";
import {
  NOTES_STORAGE_KEY,
  Note,
  NoteKind,
  createNote,
  readNotes
} from "./notes-model";
import {
  GOALS_STORAGE_KEY,
  Goal,
  createGoal,
  readGoals
} from "./goals-model";
import {
  RELATIONS_STORAGE_KEY,
  EntityType,
  ObjectRef,
  Relation,
  areLinked,
  createRelation,
  otherRef,
  readRelations,
  relationsFor,
  removeRelationsFor
} from "./relations-model";
import {
  ATTACHMENTS_STORAGE_KEY,
  Attachment,
  attachmentsFor,
  readAttachments,
  removeAttachmentLink
} from "./attachments-model";
import { CalendarMiniMonth } from "./calendar/CalendarMiniMonth";
import { DesktopCalendar } from "./calendar/DesktopCalendar";
import { RelationsGraph } from "./RelationsGraph";
import {
  addDaysIso,
  calendarRangeLabel,
  inclusiveDayCount,
  isoDate,
  isoRange,
  monthCells
} from "./calendar/calendar-utils";

const PROFILE_NAME_STORAGE_KEY = "sfera.profile.name";
const DAILY_FOCUS_STORAGE_KEY = "sfera.dashboard.daily-focus";

const filterLabels: Record<Filter, string> = {
  all: "Все",
  today: "Сегодня",
  inbox: "Без даты",
  overdue: "Просрочено",
  done: "Выполнено"
};

type Section = "home" | "projects" | "tasks" | "notes" | "photos" | "calendar" | "relations";
type TaskView = Filter | "week";
type NoteView = "all" | "ideas" | "diary" | "collections" | "lists" | "favorites";
type ProjectTab = "overview" | "tasks" | "notes" | "photos" | "goals" | "history";
type CalendarMode = "day" | "week" | "month" | "history";

const noteKindLabels: Record<NoteKind, string> = {
  note: "Заметка",
  idea: "Идея",
  diary: "Дневник",
  collection: "Коллекция",
  list: "Список"
};

function localIso(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function currentWeekDates() {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(now.getDate() - day + 1);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return {
      iso: localIso(date),
      short: new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(date).replace(".", ""),
      day: date.getDate()
    };
  });
}

const priorityLabels: Record<Priority, string> = {
  1: "Высокий",
  2: "Средний",
  3: "Низкий",
  4: "Без приоритета"
};

function russianPlural(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const moonPhases = [
  { icon: "🌑", name: "Новолуние" },
  { icon: "🌒", name: "Растущий серп" },
  { icon: "🌓", name: "Первая четверть" },
  { icon: "🌔", name: "Растущая Луна" },
  { icon: "🌕", name: "Полнолуние" },
  { icon: "🌖", name: "Убывающая Луна" },
  { icon: "🌗", name: "Последняя четверть" },
  { icon: "🌘", name: "Убывающий серп" }
] as const;

function moonPhaseFor(date: Date) {
  const synodicMonth = 29.530588853;
  const knownNewMoonUtc = Date.UTC(2000, 0, 6, 18, 14);
  const localNoonUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const daysSinceNewMoon = (localNoonUtc - knownNewMoonUtc) / 86_400_000;
  const age = ((daysSinceNewMoon % synodicMonth) + synodicMonth) % synodicMonth;
  const phaseIndex = Math.floor((age / synodicMonth) * 8 + 0.5) % 8;
  return moonPhases[phaseIndex];
}

function recentActivityLabel(at: string) {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "недавно";
  const activityDay = localIso(date);
  const today = isoToday();
  if (activityDay === today) return "сегодня";
  if (activityDay === addDaysIso(today, -1)) return "вчера";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" })
    .format(date)
    .replace(".", "");
}

function rootSphereId(projects: ProjectNode[], projectId: string | null | undefined) {
  if (!projectId) return null;
  let current = projects.find((item) => item.id === projectId);
  const seen = new Set<string>();
  while (current?.parentId && !seen.has(current.id)) {
    seen.add(current.id);
    current = projects.find((item) => item.id === current!.parentId);
  }
  return current?.id ?? null;
}

function sphereTone(projects: ProjectNode[], projectId: string | null | undefined) {
  const rootId = rootSphereId(projects, projectId);
  if (!rootId) return "neutral";
  const roots = projectChildren(projects, null);
  const index = Math.max(0, roots.findIndex((item) => item.id === rootId));
  return ["teal", "green", "violet", "coral", "amber", "blue"][index % 6];
}

function dateTimeLocalValue(at: string) {
  const d = new Date(at);
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function dateTimeLocalToIso(value: string) {
  return value ? new Date(value).toISOString() : "";
}

export function App() {
  const [tasks, setTasks] = useState<Task[]>(() => readTasks());
  const [filter, setFilter] = useState<Filter>("all");
  const [taskView, setTaskView] = useState<TaskView>("all");
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const match = location.hash.match(/^#task=(.+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  });
  const [quickTitle, setQuickTitle] = useState("");
  const [quickPriority, setQuickPriority] = useState<Priority>(4);
  const [quickOptionsOpen, setQuickOptionsOpen] = useState(false);
  const [quickDate, setQuickDate] = useState("");
  const [quickTime, setQuickTime] = useState("");
  const [quickDeadline, setQuickDeadline] = useState("");
  const [calendarComposerOpen, setCalendarComposerOpen] = useState(false);
  const [calendarComposerPosition, setCalendarComposerPosition] = useState({ left: 360, top: 120 });
  const calendarComposerRef = useRef<HTMLFormElement | null>(null);
  const [quickRelationType, setQuickRelationType] = useState<EntityType>("project");
  const [quickRelationTargetId, setQuickRelationTargetId] = useState("");
  const [projectView, setProjectView] = useState<"grid" | "list">(() => {
    try { return localStorage.getItem("sfera.projectView") === "list" ? "list" : "grid"; } catch { return "grid"; }
  });
  const [relations, setRelations] = useState<Relation[]>(() => readRelations());
  const [attachments, setAttachments] = useState<Attachment[]>(() => readAttachments());
  const [linkType, setLinkType] = useState<EntityType>("project");
  const [linkTargetId, setLinkTargetId] = useState("");
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [projectEditOpen, setProjectEditOpen] = useState(false);
  const [editProjectTitle, setEditProjectTitle] = useState("");
  const [editProjectParentId, setEditProjectParentId] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [mobileQuickOpen, setMobileQuickOpen] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState<Section>("home");
  const [projects, setProjects] = useState<ProjectNode[]>(() => readProjects());
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectCreateOpen, setProjectCreateOpen] = useState(false);
  const [projectTitle, setProjectTitle] = useState("");
  const [projectParentId, setProjectParentId] = useState("");
  const [quickProjectId, setQuickProjectId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>(() => readNotes());
  const [goals, setGoals] = useState<Goal[]>(() => readGoals());
  const [noteView, setNoteView] = useState<NoteView>("all");
  const [noteCreateOpen, setNoteCreateOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteKind, setNoteKind] = useState<NoteKind>("note");
  const [noteProjectId, setNoteProjectId] = useState<string | null>(null);
  const [projectTab, setProjectTab] = useState<ProjectTab>("overview");
  const [goalTitle, setGoalTitle] = useState("");
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("month");
  const [calendarCursor, setCalendarCursor] = useState(() => new Date());
  const [calendarRangeStart, setCalendarRangeStart] = useState(() => isoToday());
  const [calendarRangeEnd, setCalendarRangeEnd] = useState(() => addDaysIso(isoToday(), 6));
  const [calendarPickingEnd, setCalendarPickingEnd] = useState(false);
  const [profileName, setProfileName] = useState(() => {
    try {
      return localStorage.getItem(PROFILE_NAME_STORAGE_KEY)?.trim() || "Лаура";
    } catch {
      return "Лаура";
    }
  });
  const [profileDraft, setProfileDraft] = useState(profileName);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [dailyFocus, setDailyFocus] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(DAILY_FOCUS_STORAGE_KEY) ?? "null") as { date?: string; text?: string } | null;
      return stored?.date === isoToday() && typeof stored.text === "string" ? stored.text : "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(PROFILE_NAME_STORAGE_KEY, profileName);
    } catch {}
  }, [profileName]);

  useEffect(() => {
    try {
      localStorage.setItem(DAILY_FOCUS_STORAGE_KEY, JSON.stringify({ date: isoToday(), text: dailyFocus }));
    } catch {}
  }, [dailyFocus]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
  }, [notes]);

  useEffect(() => {
    localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(goals));
  }, [goals]);

  useEffect(() => {
    localStorage.setItem(RELATIONS_STORAGE_KEY, JSON.stringify(relations));
  }, [relations]);

  useEffect(() => {
    try {
      localStorage.setItem(ATTACHMENTS_STORAGE_KEY, JSON.stringify(attachments));
    } catch {
      setToast("Не удалось сохранить вложение: локальное хранилище заполнено");
    }
  }, [attachments]);

  useEffect(() => {
    if (!selectedProjectId) setProjectTab("overview");
  }, [selectedProjectId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onHash = () => {
      const match = location.hash.match(/^#task=(.+)$/);
      setSelectedId(match ? decodeURIComponent(match[1]) : null);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const el = event.target as HTMLElement | null;
      const typing = el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.tagName === "SELECT";
      if (!typing && event.key.toLowerCase() === "q") {
        event.preventDefault();
        document.getElementById("quick-add")?.focus();
      }
      if (event.key === "Escape" && selectedId) closeDetail();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  const selected = tasks.find((task) => task.id === selectedId) ?? null;
  const selectedParent = selected?.parentId
    ? tasks.find((task) => task.id === selected.parentId) ?? null
    : null;

  const activeCount = tasks.filter((task) => task.status === "active").length;
  const selectedProject = selectedProjectId
    ? projects.find((project) => project.id === selectedProjectId) ?? null
    : null;
  const selectedNote = selectedNoteId
    ? notes.find((note) => note.id === selectedNoteId) ?? null
    : null;
  const flattenedProjects = useMemo(() => flattenProjects(projects), [projects]);
  const todayTasks = useMemo(
    () => tasks
      .filter((task) => task.status === "active" && task.date === isoToday())
      .sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99") || a.order - b.order),
    [tasks]
  );
  const overdueTasks = useMemo(
    () => tasks
      .filter((task) => task.status === "active" && task.date && task.date < isoToday())
      .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")),
    [tasks]
  );
  const rootSpheres = useMemo(() => projectChildren(projects, null), [projects]);
  const dashboardDate = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date());
  const moonPhase = moonPhaseFor(new Date());
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер";
  const dayPart = hour < 6 ? "night" : hour < 12 ? "morning" : hour < 18 ? "day" : "evening";
  const weekDates = useMemo(() => currentWeekDates(), []);
  const weekTasks = useMemo(
    () => tasks.filter((task) => task.date && weekDates.some((day) => day.iso === task.date)),
    [tasks, weekDates]
  );
  const weekTaskCount = weekTasks.filter((task) => task.status === "active").length;
  const weekCompletedCount = weekTasks.filter((task) => task.status === "done").length;
  const weekProgress = weekTasks.length ? Math.round((weekCompletedCount / weekTasks.length) * 100) : 0;
  const completedTodayCount = useMemo(
    () => tasks.filter((task) => task.status === "done" && task.date === isoToday()).length,
    [tasks]
  );
  const todayTaskCount = todayTasks.length + completedTodayCount;
  const todayProgress = todayTaskCount ? Math.round((completedTodayCount / todayTaskCount) * 100) : 0;
  const upcomingTask = useMemo(() => {
    const today = isoToday();
    const currentTime = new Date().toTimeString().slice(0, 5);
    const candidates = tasks
      .filter((task) => task.status === "active" && task.date && task.date >= today)
      .sort((a, b) =>
        (a.date ?? "").localeCompare(b.date ?? "") ||
        (a.time ?? "99:99").localeCompare(b.time ?? "99:99") ||
        a.order - b.order
      );
    return candidates.find((task) => task.date !== today || !task.time || task.time >= currentTime) ?? candidates[0] ?? null;
  }, [tasks]);
  const sphereSummaries = useMemo(() => {
    const today = isoToday();
    return rootSpheres.map((sphere) => {
      const descendants = projectDescendants(projects, sphere.id);
      const scopeIds = new Set([sphere.id, ...descendants.map((project) => project.id)]);
      const sphereTasks = tasks.filter((task) => task.projectId && scopeIds.has(task.projectId));
      const activeTasks = sphereTasks.filter((task) => task.status === "active");
      const completedCount = sphereTasks.filter((task) => task.status === "done").length;
      const sphereNotes = notes.filter((note) => note.projectId && scopeIds.has(note.projectId));
      const datedActiveTasks = activeTasks
        .filter((task) => task.date && task.date >= today)
        .sort((a, b) =>
          (a.date ?? "").localeCompare(b.date ?? "") ||
          (a.time ?? "99:99").localeCompare(b.time ?? "99:99") ||
          a.order - b.order
        );
      const nextTask = datedActiveTasks[0] ?? [...activeTasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
      const activityDates = [
        sphere.updatedAt,
        ...descendants.map((project) => project.updatedAt),
        ...sphereTasks.map((task) => task.updatedAt),
        ...sphereNotes.map((note) => note.updatedAt)
      ].sort();

      return {
        sphere,
        activeCount: activeTasks.length,
        noteCount: sphereNotes.length,
        totalCount: sphereTasks.length,
        completedCount,
        progress: sphereTasks.length ? Math.round((completedCount / sphereTasks.length) * 100) : 0,
        nextTask,
        lastActivity: activityDates.at(-1) ?? sphere.updatedAt
      };
    });
  }, [rootSpheres, projects, tasks, notes]);
  const visibleNotes = useMemo(() => {
    if (noteView === "ideas") return notes.filter((note) => note.kind === "idea");
    if (noteView === "diary") return notes.filter((note) => note.kind === "diary");
    if (noteView === "collections") return notes.filter((note) => note.kind === "collection");
    if (noteView === "lists") return notes.filter((note) => note.kind === "list");
    if (noteView === "favorites") return notes.filter((note) => note.favorite);
    return notes;
  }, [notes, noteView]);
  const calendarCells = useMemo(() => monthCells(calendarCursor), [calendarCursor]);
  const calendarTitle = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(calendarCursor);
  const desktopCalendarDates = useMemo(() => isoRange(calendarRangeStart, calendarRangeEnd), [calendarRangeStart, calendarRangeEnd]);
  const desktopCalendarTitle = calendarRangeLabel(calendarRangeStart, calendarRangeEnd);
  const desktopCalendarDayCount = desktopCalendarDates.length;
  const timezoneHours = -new Date().getTimezoneOffset() / 60;
  const timezoneLabel = "GMT" + (timezoneHours >= 0 ? "+" : "") + (Number.isInteger(timezoneHours) ? timezoneHours : timezoneHours.toFixed(1));
  const historyEvents = useMemo(() => {
    const taskEvents = tasks.flatMap((task) => {
      const events = [
        { id: "task-created-" + task.id, at: task.createdAt, icon: "✓", title: task.title, meta: "Задача создана" }
      ];
      if (task.completedAt) events.push({ id: "task-done-" + task.id, at: task.completedAt, icon: "✓", title: task.title, meta: "Задача выполнена" });
      return events;
    });
    const noteEvents = notes.map((note) => ({
      id: "note-" + note.id,
      at: note.createdAt,
      icon: "✎",
      title: note.title,
      meta: noteKindLabels[note.kind]
    }));
    const goalEvents = goals.map((goal) => ({
      id: "goal-" + goal.id,
      at: goal.createdAt,
      icon: "◎",
      title: goal.title,
      meta: "Цель"
    }));
    return [...taskEvents, ...noteEvents, ...goalEvents]
      .filter((event) => !!event.at)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 40);
  }, [tasks, notes, goals]);

  function matchesFilter(task: Task) {
    const normalized = query.trim().toLowerCase();
    if (normalized) {
      const haystack = [
        task.title,
        task.description,
        task.labels.join(" ")
      ].join(" ").toLowerCase();
      if (!haystack.includes(normalized)) return false;
    }

    if (filter === "today") return task.status === "active" && task.date === isoToday();
    if (filter === "inbox") return task.status === "active" && task.date === null;
    if (filter === "overdue") return task.status === "active" && !!task.date && task.date < isoToday();
    if (filter === "done") return task.status === "done";
    return task.status === "active";
  }

  function hasMatchingDescendant(task: Task) {
    return descendantsOf(tasks, task.id).some(matchesFilter);
  }

  const topLevelForView = useMemo(() => {
    return childrenOf(tasks, null).filter((task) => matchesFilter(task) || hasMatchingDescendant(task));
  }, [tasks, filter, query]);

  function patchTask(id: string, patch: Partial<Task>) {
    setTasks((current) =>
      current.map((task) =>
        task.id === id ? { ...task, ...patch, updatedAt: nowIso() } : task
      )
    );
  }

  function patchProject(id: string, patch: Partial<ProjectNode>) {
    setProjects((current) =>
      current.map((project) =>
        project.id === id
          ? { ...project, ...patch, updatedAt: nowIso() }
          : project
      )
    );
  }

  function addProject(event?: FormEvent) {
    event?.preventDefault();
    const title = projectTitle.trim();
    if (!title) return;
    const parentId = projectParentId || null;
    const project = createProject({
      title,
      parentId,
      kind: parentId ? "project" : "sphere",
      order: nextProjectOrder(projects, parentId)
    });
    setProjects((current) => [...current, project]);
    setProjectTitle("");
    setProjectCreateOpen(false);
    setProjectParentId("");
    setSelectedProjectId(project.id);
    setToast(parentId ? "Проект создан" : "Сфера жизни создана");
  }

  function chooseTaskView(view: TaskView) {
    setTaskView(view);
    if (view === "week") return;
    setFilter(view);
  }

  function addNote(event?: FormEvent) {
    event?.preventDefault();
    const title = noteTitle.trim();
    if (!title) return;
    const note = createNote({
      title,
      body: noteBody.trim(),
      kind: noteKind,
      projectId: noteProjectId,
      date: noteKind === "diary" ? isoToday() : null
    });
    setNotes((current) => [note, ...current]);
    setNoteTitle("");
    setNoteBody("");
    setNoteKind("note");
    setNoteProjectId(null);
    setNoteCreateOpen(false);
    setNoteView(note.kind === "idea" ? "ideas" : note.kind === "diary" ? "diary" : note.kind === "collection" ? "collections" : note.kind === "list" ? "lists" : "all");
    setMobileSection("notes");
    setToast("Запись сохранена");
  }

  function addGoal(event?: FormEvent) {
    event?.preventDefault();
    const title = goalTitle.trim();
    if (!title || !selectedProject) return;
    const goal = createGoal({
      title,
      projectId: selectedProject.id,
      progress: 0
    });
    setGoals((current) => [goal, ...current]);
    setGoalTitle("");
    setToast("Цель добавлена");
  }

  function patchGoal(id: string, patch: Partial<Goal>) {
    setGoals((current) => current.map((goal) =>
      goal.id === id ? { ...goal, ...patch, updatedAt: nowIso() } : goal
    ));
  }

  function openCalendar(mode: CalendarMode = "month") {
    setCalendarMode(mode);
    setMobileSection("calendar");
  }

  function setMonthOffset(delta: number) {
    setCalendarCursor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  function setDesktopCalendarPeriod(start: string, days: number) {
    const safeDays = Math.max(1, Math.min(14, days));
    setCalendarRangeStart(start);
    setCalendarRangeEnd(addDaysIso(start, safeDays - 1));
    setCalendarPickingEnd(false);
    setCalendarCursor(isoDate(start));
  }

  function selectMiniCalendarDay(iso: string) {
    if (!calendarPickingEnd) {
      setCalendarRangeStart(iso);
      setCalendarRangeEnd(iso);
      setCalendarPickingEnd(true);
      setCalendarCursor(isoDate(iso));
      return;
    }

    const anchor = calendarRangeStart;
    let start = anchor <= iso ? anchor : iso;
    let end = anchor <= iso ? iso : anchor;
    if (inclusiveDayCount(start, end) > 14) {
      if (iso >= anchor) end = addDaysIso(anchor, 13);
      else start = addDaysIso(anchor, -13);
    }
    setCalendarRangeStart(start);
    setCalendarRangeEnd(end);
    setCalendarPickingEnd(false);
    setCalendarCursor(isoDate(start));
  }

  function moveDesktopCalendarPeriod(direction: -1 | 1) {
    const days = inclusiveDayCount(calendarRangeStart, calendarRangeEnd);
    const nextStart = addDaysIso(calendarRangeStart, days * direction);
    setDesktopCalendarPeriod(nextStart, days);
  }

  function chooseTodayPeriod() {
    setDesktopCalendarPeriod(isoToday(), desktopCalendarDayCount);
  }

  function setTaskProject(task: Task, projectId: string | null) {
    const ids = new Set([task.id, ...descendantsOf(tasks, task.id).map((item) => item.id)]);
    setTasks((current) =>
      current.map((item) =>
        ids.has(item.id)
          ? { ...item, projectId, updatedAt: nowIso() }
          : item
      )
    );
    setToast(projectId ? "Проект назначен" : "Задача без проекта");
  }

  function projectTaskCount(projectId: string, includeChildren = true) {
    const ids = new Set([projectId]);
    if (includeChildren) {
      projectDescendants(projects, projectId).forEach((project) => ids.add(project.id));
    }
    return tasks.filter((task) => task.status === "active" && task.projectId && ids.has(task.projectId)).length;
  }

  function projectScopeIds(projectId: string) {
    return new Set([projectId, ...projectDescendants(projects, projectId).map((project) => project.id)]);
  }

  function taskInProjectScope(task: Task, projectId: string) {
    const ids = projectScopeIds(projectId);
    if (task.projectId && ids.has(task.projectId)) return true;
    return Array.from(ids).some((id) => areLinked(relations, { type: "task", id: task.id }, { type: "project", id }));
  }

  function noteInProjectScope(note: Note, projectId: string) {
    const ids = projectScopeIds(projectId);
    if (note.projectId && ids.has(note.projectId)) return true;
    return Array.from(ids).some((id) => areLinked(relations, { type: "note", id: note.id }, { type: "project", id }));
  }

  function projectNoteCount(projectId: string) {
    return notes.filter((note) => noteInProjectScope(note, projectId)).length;
  }

  function entityTitle(ref: ObjectRef) {
    if (ref.type === "project") {
      const project = projects.find((item) => item.id === ref.id);
      return project ? projectPath(projects, project.id) : "Удалённый проект";
    }
    if (ref.type === "task") return tasks.find((item) => item.id === ref.id)?.title ?? "Удалённая задача";
    return notes.find((item) => item.id === ref.id)?.title ?? "Удалённая заметка";
  }

  function graphEntityTitle(ref: ObjectRef) {
    if (ref.type === "project") {
      return projects.find((item) => item.id === ref.id)?.title ?? "Удалённый проект";
    }
    if (ref.type === "task") return tasks.find((item) => item.id === ref.id)?.title ?? "Удалённая задача";
    return notes.find((item) => item.id === ref.id)?.title ?? "Удалённая заметка";
  }

  function entityTypeLabel(type: EntityType) {
    return type === "project" ? "Сфера / проект" : type === "task" ? "Задача" : "Заметка";
  }

  function relationTargetOptions(type: EntityType, source: ObjectRef) {
    if (type === "project") {
      return flattenedProjects
        .filter(({ project }) => !(source.type === "project" && source.id === project.id))
        .map(({ project, path }) => ({ id: project.id, label: path }));
    }
    if (type === "task") {
      return tasks
        .filter((task) => !(source.type === "task" && source.id === task.id))
        .map((task) => ({ id: task.id, label: task.title }));
    }
    return notes
      .filter((note) => !(source.type === "note" && source.id === note.id))
      .map((note) => ({ id: note.id, label: note.title }));
  }

  function addObjectRelation(source: ObjectRef) {
    if (!linkTargetId) return;
    const target: ObjectRef = { type: linkType, id: linkTargetId };
    if (source.type === target.type && source.id === target.id) return;
    if (areLinked(relations, source, target)) {
      setToast("Эта связь уже существует");
      return;
    }
    setRelations((current) => [...current, createRelation(source, target)]);
    setLinkTargetId("");
    setToast("Связь добавлена");
  }

  function openLinkedObject(ref: ObjectRef) {
    if (ref.type === "project") {
      setSelectedProjectId(ref.id);
      setMobileSection("projects");
      setSelectedNoteId(null);
      if (selectedId) closeDetail();
      return;
    }
    if (ref.type === "task") {
      setSelectedNoteId(null);
      openDetail(ref.id);
      return;
    }
    setSelectedNoteId(ref.id);
    if (selectedId) closeDetail();
  }

  function renderRelationsPanel(source: ObjectRef) {
    const linked = relationsFor(relations, source);
    const options = relationTargetOptions(linkType, source);
    return (
      <section className="detail-section linked-objects-section">
        <div className="section-heading">
          <h3>Связи</h3>
          <span>{linked.length}</span>
        </div>
        {linked.length > 0 && (
          <div className="linked-object-list">
            {linked.map((relation) => {
              const ref = otherRef(relation, source);
              return (
                <div className="linked-object-chip" key={relation.id}>
                  <button onClick={() => openLinkedObject(ref)}>
                    <small>{entityTypeLabel(ref.type)}</small>
                    <strong>{entityTitle(ref)}</strong>
                  </button>
                  <button
                    className="linked-remove"
                    aria-label="Удалить связь"
                    onClick={() => setRelations((current) => current.filter((item) => item.id !== relation.id))}
                  >×</button>
                </div>
              );
            })}
          </div>
        )}
        <div className="link-object-form">
          <select value={linkType} onChange={(event) => { setLinkType(event.target.value as EntityType); setLinkTargetId(""); }}>
            <option value="project">Сфера / проект</option>
            <option value="task">Задача</option>
            <option value="note">Заметка</option>
          </select>
          <select value={linkTargetId} onChange={(event) => setLinkTargetId(event.target.value)}>
            <option value="">Выбрать объект…</option>
            {options.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}
          </select>
          <button disabled={!linkTargetId} onClick={() => addObjectRelation(source)}>Связать</button>
        </div>
      </section>
    );
  }

  async function attachFiles(ref: ObjectRef, fileList: FileList | null) {
    if (!fileList?.length) return;
    const files = Array.from(fileList);
    const accepted: Attachment[] = [];
    for (const file of files) {
      if (file.size > 1_200_000) {
        setToast("Файл слишком большой для локального прототипа — максимум 1,2 МБ");
        continue;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      accepted.push({
        id: crypto.randomUUID(),
        name: file.name,
        mime: file.type || "application/octet-stream",
        size: file.size,
        dataUrl,
        links: [ref],
        createdAt: new Date().toISOString()
      });
    }
    if (accepted.length) {
      setAttachments((current) => [...accepted, ...current]);
      setToast(accepted.length === 1 ? "Файл прикреплён" : "Файлы прикреплены");
    }
  }

  function removeAttachmentFrom(ref: ObjectRef, attachmentId: string) {
    setAttachments((current) => current
      .map((attachment) => attachment.id === attachmentId ? removeAttachmentLink(attachment, ref) : attachment)
      .filter((attachment) => attachment.links.length > 0));
  }

  function renderAttachmentsPanel(ref: ObjectRef) {
    const items = attachmentsFor(attachments, ref);
    return (
      <section className="detail-section object-attachments-section">
        <div className="section-heading">
          <h3>Файлы и фото</h3>
          <span>{items.length}</span>
        </div>
        {items.length > 0 && (
          <div className="object-attachment-grid">
            {items.map((attachment) => (
              <article className="object-attachment" key={attachment.id}>
                {attachment.mime.startsWith("image/") ? (
                  <img src={attachment.dataUrl} alt={attachment.name} />
                ) : (
                  <span className="attachment-file-icon">▤</span>
                )}
                <div>
                  <strong>{attachment.name}</strong>
                  <small>{Math.max(1, Math.round(attachment.size / 1024))} КБ</small>
                </div>
                <a href={attachment.dataUrl} download={attachment.name} aria-label="Открыть файл">↗</a>
                <button onClick={() => removeAttachmentFrom(ref, attachment.id)} aria-label="Открепить файл">×</button>
              </article>
            ))}
          </div>
        )}
        <label className="attachment-upload">
          <span>＋ Прикрепить фото или файл</span>
          <input
            type="file"
            multiple
            accept="image/*,.pdf,.txt,.doc,.docx,.xls,.xlsx,.zip"
            onChange={(event) => { void attachFiles(ref, event.currentTarget.files); event.currentTarget.value = ""; }}
          />
        </label>
        <small className="attachment-limit">Сейчас локально: до 1,2 МБ на файл. Голосовые с расшифровкой — следующий слой этой модели.</small>
      </section>
    );
  }

  function patchNote(id: string, patch: Partial<Note>) {
    setNotes((current) => current.map((note) => note.id === id ? { ...note, ...patch, updatedAt: nowIso() } : note));
  }

  function deleteNote(note: Note) {
    if (!window.confirm(`Удалить заметку «${note.title}»?`)) return;
    const ref: ObjectRef = { type: "note", id: note.id };
    setNotes((current) => current.filter((item) => item.id !== note.id));
    setRelations((current) => removeRelationsFor(current, ref));
    setAttachments((current) => current
      .map((attachment) => removeAttachmentLink(attachment, ref))
      .filter((attachment) => attachment.links.length > 0));
    setSelectedNoteId(null);
    setToast("Заметка удалена");
  }

  function openProjectEditor(project: ProjectNode) {
    setEditProjectTitle(project.title);
    setEditProjectParentId(project.parentId ?? "");
    setProjectEditOpen(true);
  }

  function saveProjectEdit(event?: FormEvent) {
    event?.preventDefault();
    if (!selectedProject) return;
    const title = editProjectTitle.trim();
    if (!title) return;
    const invalidParents = new Set([selectedProject.id, ...projectDescendants(projects, selectedProject.id).map((item) => item.id)]);
    const parentId = editProjectParentId && !invalidParents.has(editProjectParentId) ? editProjectParentId : null;
    patchProject(selectedProject.id, {
      title,
      parentId,
      kind: parentId ? "project" : "sphere"
    });
    setProjectEditOpen(false);
    setToast("Проект обновлён");
  }

  function deleteProjectNode(project: ProjectNode) {
    if (!window.confirm(`Удалить «${project.title}»? Подпроекты будут подняты на уровень выше.`)) return;
    const ref: ObjectRef = { type: "project", id: project.id };
    const parentId = project.parentId;
    setProjects((current) => current
      .filter((item) => item.id !== project.id)
      .map((item) => item.parentId === project.id ? { ...item, parentId, updatedAt: nowIso() } : item));
    setTasks((current) => current.map((task) => task.projectId === project.id ? { ...task, projectId: parentId, updatedAt: nowIso() } : task));
    setNotes((current) => current.map((note) => note.projectId === project.id ? { ...note, projectId: parentId, updatedAt: nowIso() } : note));
    setRelations((current) => removeRelationsFor(current, ref));
    setAttachments((current) => current
      .map((attachment) => removeAttachmentLink(attachment, ref))
      .filter((attachment) => attachment.links.length > 0));
    setSelectedProjectId(parentId);
    setProjectEditOpen(false);
    setToast("Проект удалён");
  }

  function setProjectViewMode(mode: "grid" | "list") {
    setProjectView(mode);
    try { localStorage.setItem("sfera.projectView", mode); } catch {}
  }

  function renderProjectLocationPicker(
    value: string,
    onChange: (value: string) => void,
    rootLabel = "Без проекта / корень",
    excludeIds: Set<string> = new Set()
  ) {
    const selectedProject = value ? projects.find((project) => project.id === value) ?? null : null;
    const selectedTone = selectedProject ? sphereTone(projects, selectedProject.id) : "neutral";
    return (
      <details className="project-location-picker">
        <summary className={`project-location-summary tone-${selectedTone} ${selectedProject ? "has-project" : "is-root"}`}>
          <span className="project-location-swatch" />
          <span>
            <strong>{selectedProject ? selectedProject.title : rootLabel}</strong>
            {selectedProject && <small>{projectPath(projects, selectedProject.id)}</small>}
          </span>
          <b>⌄</b>
        </summary>
        <div className="project-location-menu">
          <button
            type="button"
            className={`project-location-option tone-neutral depth-0 ${!value ? "selected" : ""}`}
            onClick={(event) => {
              onChange("");
              event.currentTarget.closest("details")?.removeAttribute("open");
            }}
          >
            <span className="project-location-swatch" />
            <span className="project-location-copy"><strong>{rootLabel}</strong><small>Верхний уровень</small></span>
            {!value && <b>✓</b>}
          </button>
          {flattenedProjects
            .filter(({ project }) => !excludeIds.has(project.id))
            .map(({ project, depth, path }) => {
              const tone = sphereTone(projects, project.id);
              return (
                <button
                  type="button"
                  key={project.id}
                  className={`project-location-option tone-${tone} depth-${Math.min(depth, 4)} ${value === project.id ? "selected" : ""}`}
                  onClick={(event) => {
                    onChange(project.id);
                    event.currentTarget.closest("details")?.removeAttribute("open");
                  }}
                >
                  <span className="project-location-swatch" />
                  <span className="project-location-copy">
                    <strong>{project.title}</strong>
                    <small>{depth === 0 ? "Сфера жизни" : path}</small>
                  </span>
                  {value === project.id && <b>✓</b>}
                </button>
              );
            })}
        </div>
      </details>
    );
  }

  function renderProjectGrid(parentId: string | null) {
    const items = projectChildren(projects, parentId);
    return (
      <div className="project-grid">
        {items.map((project) => {
          const children = projectChildren(projects, project.id);
          const tone = sphereTone(projects, project.id);
          return (
            <button
              className={`project-tile sphere-tone-${tone} ${project.kind === "sphere" ? "sphere-root-tile" : "sphere-child-tile"}`}
              key={project.id}
              onClick={() => setSelectedProjectId(project.id)}
            >
              <span className="project-tile-icon">{project.kind === "sphere" ? "◇" : "▰"}</span>
              <strong>{project.title}</strong>
              <small>{projectTaskCount(project.id)} задач · {children.length} {russianPlural(children.length, "подпроект", "подпроекта", "подпроектов")}</small>
              <b>›</b>
            </button>
          );
        })}
      </div>
    );
  }

  function renderProjectTree(parentId: string | null, depth = 0): React.ReactNode {
    return projectChildren(projects, parentId).map((project) => {
      const children = projectChildren(projects, project.id);
      return (
        <div className="project-tree-node" key={project.id}>
          <div className={`project-tree-row project-depth-${Math.min(depth, 4)} sphere-tone-${sphereTone(projects, project.id)} ${depth === 0 ? "sphere-root-row" : "sphere-child-row"}`}>
            <button
              className="project-toggle"
              disabled={children.length === 0}
              onClick={() => patchProject(project.id, { collapsed: !project.collapsed })}
              aria-label={project.collapsed ? "Развернуть" : "Свернуть"}
            >
              {children.length ? (project.collapsed ? "›" : "⌄") : ""}
            </button>
            <button className="project-main" onClick={() => setSelectedProjectId(project.id)}>
              <span className="project-folder-icon">{project.kind === "sphere" ? "◇" : "▰"}</span>
              <span>
                <strong>{project.title}</strong>
                <small>{projectTaskCount(project.id)} активных задач</small>
              </span>
            </button>
            <button className="project-open" aria-label={`Открыть ${project.kind === "sphere" ? "сферу" : "проект"} «${project.title}»`} onClick={() => setSelectedProjectId(project.id)}>›</button>
          </div>
          {!project.collapsed && children.length > 0 && (
            <div className="project-subtree">{renderProjectTree(project.id, depth + 1)}</div>
          )}
        </div>
      );
    });
  }

  function saveProfileName(event?: FormEvent) {
    event?.preventDefault();
    const nextName = profileDraft.trim();
    if (!nextName) return;
    setProfileName(nextName);
    setProfileDraft(nextName);
    setProfileMenuOpen(false);
  }

  function openProfileNamePicker() {
    setProfileDraft(profileName);
    setProfileMenuOpen((value) => !value);
  }

  function startNewTask(projectId: string | null) {
    setQuickTitle("");
    setQuickDate(isoToday());
    setQuickTime("");
    setQuickDeadline("");
    setQuickProjectId(projectId);
    setQuickPriority(4);
    setQuickOptionsOpen(false);
    setFilter("today");
    setTaskView("today");
    setMobileSection("tasks");
    window.setTimeout(() => document.getElementById("quick-add")?.focus(), 0);
  }

  function openNewTask() {
    startNewTask(null);
  }

  function openNewNote() {
    setNoteKind("note");
    setNoteTitle("");
    setNoteBody("");
    setNoteProjectId(null);
    setNoteCreateOpen(true);
  }

  function openDetail(id: string, replace = false) {
    const hash = "#task=" + encodeURIComponent(id);
    if (replace) history.replaceState(null, "", hash);
    else history.pushState(null, "", hash);
    setSelectedId(id);
  }

  function closeDetail() {
    if (location.hash.startsWith("#task=")) {
      history.pushState(null, "", location.pathname + location.search);
    }
    setSelectedId(null);
  }

  function addTask(event?: FormEvent) {
    event?.preventDefault();
    const parsed = parseQuickAdd(quickTitle);
    if (!parsed.title) return;

    const task = createTask({
      title: parsed.title,
      parentId: null,
      projectId: quickProjectId,
      order: nextOrder(tasks, null),
      date: quickDate || (filter === "today" && !parsed.date ? isoToday() : parsed.date),
      time: quickTime || parsed.time,
      deadline: quickDeadline || parsed.deadline,
      recurrence: parsed.recurrence,
      priority: quickPriority < 4 ? quickPriority : parsed.priority,
      labels: parsed.labels,
      uncompletable: parsed.uncompletable
    });

    setTasks((current) => [...current, task]);
    if (quickRelationTargetId) {
      setRelations((current) => [
        ...current,
        createRelation(
          { type: "task", id: task.id },
          { type: quickRelationType, id: quickRelationTargetId }
        )
      ]);
    }
    setQuickTitle("");
    setQuickPriority(4);
    setQuickDate("");
    setQuickTime("");
    setQuickDeadline("");
    setQuickRelationType("project");
    setQuickRelationTargetId("");
    setQuickOptionsOpen(false);
    setQuickProjectId(null);
    setMobileQuickOpen(false);
    setCalendarComposerOpen(false);
    setToast("Задача добавлена");
  }

  function resetQuickTaskDraft() {
    setQuickTitle("");
    setQuickProjectId(null);
    setQuickPriority(4);
    setQuickDate("");
    setQuickTime("");
    setQuickDeadline("");
    setQuickRelationType("project");
    setQuickRelationTargetId("");
    setQuickOptionsOpen(false);
  }

  function closeCalendarTaskComposer() {
    setCalendarComposerOpen(false);
    resetQuickTaskDraft();
  }

  function openCalendarTaskCreator(date: string, time: string | null, position: { x: number; y: number }) {
    resetQuickTaskDraft();
    setQuickDate(date);
    setQuickTime(time ?? "");

    const width = 420;
    const heightEstimate = 520;
    const viewportMargin = 14;
    const sidebarSafeLeft = window.innerWidth > 720 ? 274 : viewportMargin;
    const left = Math.max(
      sidebarSafeLeft,
      Math.min(window.innerWidth - width - viewportMargin, position.x - 34)
    );
    const top = Math.max(
      viewportMargin,
      Math.min(window.innerHeight - heightEstimate - viewportMargin, position.y - 68)
    );

    setCalendarComposerPosition({ left, top });
    setCalendarComposerOpen(true);
  }

  useLayoutEffect(() => {
    if (!calendarComposerOpen) return;

    const element = calendarComposerRef.current;
    if (!element) return;

    const viewportMargin = 14;
    const sidebarSafeLeft = window.innerWidth > 720 ? 274 : viewportMargin;
    const rect = element.getBoundingClientRect();
    const maxLeft = Math.max(sidebarSafeLeft, window.innerWidth - rect.width - viewportMargin);
    const maxTop = Math.max(viewportMargin, window.innerHeight - rect.height - viewportMargin);

    const nextLeft = Math.min(Math.max(calendarComposerPosition.left, sidebarSafeLeft), maxLeft);
    const nextTop = Math.min(Math.max(calendarComposerPosition.top, viewportMargin), maxTop);

    if (Math.abs(nextLeft - calendarComposerPosition.left) > 0.5 || Math.abs(nextTop - calendarComposerPosition.top) > 0.5) {
      setCalendarComposerPosition({ left: nextLeft, top: nextTop });
    }
  }, [calendarComposerOpen, quickOptionsOpen, calendarComposerPosition.left, calendarComposerPosition.top]);

  function calendarEndTime() {
    if (!quickTime) return "";
    const [hours, minutes] = quickTime.split(":").map(Number);
    const total = (hours * 60 + minutes + 60) % (24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  function addSubtask(parent: Task) {
    const parsed = parseQuickAdd(subtaskTitle);
    if (!parsed.title) return;
    const depth = depthOf(tasks, parent);
    if (depth >= 7) {
      setToast("Достигнут предел вложенности");
      return;
    }

    const task = createTask({
      title: parsed.title,
      parentId: parent.id,
      projectId: parent.projectId,
      order: nextOrder(tasks, parent.id),
      date: parsed.date,
      time: parsed.time,
      deadline: parsed.deadline,
      recurrence: parsed.recurrence,
      priority: parsed.priority,
      labels: parsed.labels,
      uncompletable: parsed.uncompletable
    });

    setTasks((current) =>
      current
        .map((item) => item.id === parent.id ? { ...item, collapsed: false } : item)
        .concat(task)
    );
    setSubtaskTitle("");
    setToast("Подзадача добавлена");
  }

  function reopenDirectSubtasks(parentId: string) {
    setTasks((current) =>
      current.map((task) =>
        task.parentId === parentId
          ? { ...task, status: "active", completedAt: null, updatedAt: nowIso() }
          : task
      )
    );
  }

  function completeTask(task: Task, forever = false) {
    if (task.uncompletable) return;

    if (task.status === "done") {
      patchTask(task.id, { status: "active", completedAt: null });
      setToast("Задача возвращена");
      return;
    }

    if (task.recurrence && !forever) {
      const nextDate = nextRecurringDate(task.date, task.recurrence);
      if (nextDate) {
        patchTask(task.id, { date: nextDate, completedAt: null, status: "active" });
        if (task.resetSubtasks) reopenDirectSubtasks(task.id);
        setToast("Выполнено · назначен следующий повтор");
        return;
      }
    }

    const ids = new Set([task.id, ...descendantsOf(tasks, task.id).map((item) => item.id)]);
    const completedAt = nowIso();
    setTasks((current) =>
      current.map((item) =>
        ids.has(item.id)
          ? { ...item, status: "done", completedAt, updatedAt: completedAt }
          : item
      )
    );
    setToast("Задача выполнена");
  }

  function duplicateTask(task: Task) {
    const all = [task, ...descendantsOf(tasks, task.id)];
    const idMap = new Map<string, string>();
    all.forEach((item) => idMap.set(item.id, crypto.randomUUID()));
    const now = nowIso();

    const copies = all.map((item, index) => ({
      ...item,
      id: idMap.get(item.id)!,
      title: index === 0 ? item.title + " — копия" : item.title,
      parentId: item.id === task.id
        ? task.parentId
        : item.parentId
          ? idMap.get(item.parentId) ?? task.parentId
          : null,
      order: item.id === task.id ? nextOrder(tasks, task.parentId) : item.order,
      status: "active" as const,
      completedAt: null,
      comments: [],
      createdAt: now,
      updatedAt: now
    }));

    setTasks((current) => [...current, ...copies]);
    openDetail(copies[0].id);
    setToast("Задача продублирована");
  }

  function deleteTask(task: Task) {
    if (!window.confirm(`Удалить «${task.title}» и все вложенные подзадачи?`)) return;
    const ids = new Set([task.id, ...descendantsOf(tasks, task.id).map((item) => item.id)]);
    setTasks((current) => current.filter((item) => !ids.has(item.id)));
    closeDetail();
    setToast("Задача удалена");
  }

  function copyTaskLink(task: Task) {
    const url = location.origin + location.pathname + location.search + "#task=" + encodeURIComponent(task.id);
    navigator.clipboard?.writeText(url).then(
      () => setToast("Ссылка скопирована"),
      () => setToast("Не удалось скопировать ссылку")
    );
  }

  function moveSibling(task: Task, delta: -1 | 1) {
    const siblings = childrenOf(tasks, task.parentId);
    const index = siblings.findIndex((item) => item.id === task.id);
    const otherIndex = index + delta;
    if (index < 0 || otherIndex < 0 || otherIndex >= siblings.length) return;
    const other = siblings[otherIndex];

    setTasks((current) =>
      current.map((item) => {
        if (item.id === task.id) return { ...item, order: other.order, updatedAt: nowIso() };
        if (item.id === other.id) return { ...item, order: task.order, updatedAt: nowIso() };
        return item;
      })
    );
  }

  function indentTask(task: Task) {
    const siblings = childrenOf(tasks, task.parentId);
    const index = siblings.findIndex((item) => item.id === task.id);
    if (index <= 0) return;
    const newParent = siblings[index - 1];
    if (depthOf(tasks, newParent) >= 7) return;
    patchTask(task.id, {
      parentId: newParent.id,
      projectId: newParent.projectId,
      order: nextOrder(tasks, newParent.id)
    });
    patchTask(newParent.id, { collapsed: false });
    setToast("Задача стала подзадачей");
  }

  function outdentTask(task: Task) {
    if (!task.parentId) return;
    const parent = tasks.find((item) => item.id === task.parentId);
    if (!parent) return;
    patchTask(task.id, {
      parentId: parent.parentId,
      order: nextOrder(tasks, parent.parentId)
    });
    setToast("Уровень вложенности уменьшен");
  }

  function dropBefore(target: Task) {
    if (!draggedId || draggedId === target.id) return;
    const dragged = tasks.find((item) => item.id === draggedId);
    if (!dragged || dragged.parentId !== target.parentId) {
      setToast("Перетаскивать можно между соседями одного уровня");
      return;
    }

    const siblings = childrenOf(tasks, target.parentId).filter((item) => item.id !== dragged.id);
    const targetIndex = siblings.findIndex((item) => item.id === target.id);
    siblings.splice(Math.max(0, targetIndex), 0, dragged);
    const orderMap = new Map(siblings.map((item, index) => [item.id, (index + 1) * 10]));
    setTasks((current) =>
      current.map((item) =>
        orderMap.has(item.id)
          ? { ...item, order: orderMap.get(item.id)!, updatedAt: nowIso() }
          : item
      )
    );
    setDraggedId(null);
  }

  function addReminder(task: Task) {
    const at = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    patchTask(task.id, {
      reminders: [...task.reminders, { id: crypto.randomUUID(), at }]
    });
  }

  function addComment(task: Task) {
    const body = commentBody.trim();
    if (!body) return;
    const comment: TaskComment = {
      id: crypto.randomUUID(),
      body,
      createdAt: nowIso()
    };
    patchTask(task.id, { comments: [...task.comments, comment] });
    setCommentBody("");
  }

  function renderTree(parentId: string | null, depth = 0): React.ReactNode {
    const children = childrenOf(tasks, parentId).filter((task) => {
      if (parentId && filter !== "done") {
        const parent = tasks.find((item) => item.id === parentId);
        if (task.status === "done" && !parent?.showCompletedSubtasks) return false;
      }
      return matchesFilter(task) || hasMatchingDescendant(task);
    });

    return children.map((task) => {
      const directChildren = childrenOf(tasks, task.id);
      const activeChildren = directChildren.filter((item) => item.status === "active");
      const completedChildren = directChildren.length - activeChildren.length;
      const showNested = !task.collapsed;

      return (
        <div className="tree-node" key={task.id}>
          <article
            className={`task-row task-depth-${Math.min(depth, 4)} ${selectedId === task.id ? "selected" : ""}`}
            draggable
            onDragStart={() => setDraggedId(task.id)}
            onDragEnd={() => setDraggedId(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => dropBefore(task)}
          >
            <button
              className="tree-toggle"
              disabled={directChildren.length === 0}
              onClick={() => patchTask(task.id, { collapsed: !task.collapsed })}
              aria-label={task.collapsed ? "Развернуть подзадачи" : "Свернуть подзадачи"}
            >
              {directChildren.length ? (task.collapsed ? "›" : "⌄") : ""}
            </button>

            {task.uncompletable ? (
              <span className="uncompletable-mark" aria-label="Незавершаемая задача">◆</span>
            ) : (
              <button
                className={`check-button priority-ring p${task.priority} ${task.status === "done" ? "checked" : ""}`}
                aria-label={task.status === "done" ? `Вернуть задачу «${task.title}»` : `Выполнить задачу «${task.title}»`}
                onClick={() => completeTask(task)}
              >
                {task.status === "done" ? "✓" : ""}
              </button>
            )}

            <button className="task-main" onClick={() => openDetail(task.id)}>
              <span className={`task-title ${task.status === "done" ? "done" : ""}`}>
                {task.title}
              </span>
              <span className="task-meta">
                {task.date && <span className={task.date < isoToday() ? "overdue" : ""}>{formatDate(task.date)}{task.time ? " · " + task.time : ""}</span>}
                {task.recurrence && <span>↻ {task.recurrence}</span>}
                {task.deadline && <span>◷ до {formatDate(task.deadline)}</span>}
                {task.durationMinutes && <span>{formatDuration(task.durationMinutes)}</span>}
                <span className={`priority-flag p${task.priority}`} title={priorityLabels[task.priority]} aria-label={`Приоритет: ${priorityLabels[task.priority]}`}>⚑</span>
                {task.projectId && <span className="task-project-path">◇ {projectPath(projects, task.projectId)}</span>}
                {task.labels.map((label) => <span key={label}>%{label}</span>)}
                {activeChildren.length > 0 && <span>▤ {activeChildren.length}</span>}
                {completedChildren > 0 && <span>✓ {completedChildren}</span>}
              </span>
            </button>

            <button className="row-more" aria-label={`Открыть задачу «${task.title}»`} onClick={() => openDetail(task.id)}>›</button>
          </article>

          {showNested && directChildren.length > 0 && (
            <div className="subtree">{renderTree(task.id, depth + 1)}</div>
          )}
        </div>
      );
    });
  }

  const relationGraphObjects: ObjectRef[] = [
    ...projects.map((project) => ({ type: "project" as const, id: project.id })),
    ...tasks.filter((task) => task.status === "active").map((task) => ({ type: "task" as const, id: task.id })),
    ...notes.map((note) => ({ type: "note" as const, id: note.id }))
  ];

  const relationGraphStructureEdges = [
    ...projects
      .filter((project) => project.parentId)
      .map((project) => ({
        id: `project-parent:${project.id}`,
        a: { type: "project" as const, id: project.parentId! },
        b: { type: "project" as const, id: project.id }
      })),
    ...tasks
      .filter((task) => task.status === "active" && task.projectId)
      .map((task) => ({
        id: `task-project:${task.id}`,
        a: { type: "project" as const, id: task.projectId! },
        b: { type: "task" as const, id: task.id }
      })),
    ...notes
      .filter((note) => note.projectId)
      .map((note) => ({
        id: `note-project:${note.id}`,
        a: { type: "project" as const, id: note.projectId! },
        b: { type: "note" as const, id: note.id }
      }))
  ];

  const visibleCount = topLevelForView.length;

  return (
    <div className={`app-shell section-${mobileSection} ${selected ? "has-detail" : ""}`}>
      <aside className="sidebar" aria-label="Навигация СФЕРА">
        <button className="brand brand-button" onClick={() => setMobileSection("home")} aria-label="Главная СФЕРА">
          <img className="brand-logo" src="/sfera/sfera-logo.webp?v=20260920-clean" alt="СФЕРА" />
        </button>

        <nav className="side-nav">
          <button className={mobileSection === "home" ? "active" : ""} onClick={() => setMobileSection("home")}><span>⌂</span>Главная</button>
          <button className={mobileSection === "projects" ? "active" : ""} onClick={() => setMobileSection("projects")}><span>◇</span>Сферы</button>
          <button className={mobileSection === "tasks" ? "active" : ""} onClick={() => setMobileSection("tasks")}><span>✓</span>Задачи</button>
          <button className={mobileSection === "notes" ? "active" : ""} onClick={() => setMobileSection("notes")}><span>✎</span>Заметки</button>
          <button className={mobileSection === "photos" ? "active" : ""} onClick={() => setMobileSection("photos")}><span>▧</span>Фото</button>
          <div className={`calendar-nav-group ${mobileSection === "calendar" ? "open" : ""}`}>
            <button className={mobileSection === "calendar" ? "active" : ""} onClick={() => openCalendar("month")}><span>▦</span>Календарь</button>
            {mobileSection === "calendar" && (
              <CalendarMiniMonth
                title={calendarTitle}
                cells={calendarCells}
                rangeStart={calendarRangeStart}
                rangeEnd={calendarRangeEnd}
                pickingEnd={calendarPickingEnd}
                dayCount={desktopCalendarDayCount}
                todayIso={isoToday()}
                onPreviousMonth={() => setMonthOffset(-1)}
                onNextMonth={() => setMonthOffset(1)}
                onSelectDay={selectMiniCalendarDay}
                onSetDays={(days) => setDesktopCalendarPeriod(calendarRangeStart, days)}
              />
            )}
          </div>
          <button className={mobileSection === "relations" ? "active" : ""} onClick={() => setMobileSection("relations")}><span>↔</span>Связи</button>
        </nav>

        <div className="sidebar-bottom">
          <button className="ghost-button" onClick={() => setSettingsOpen(true)}>⚙ Настройки</button>
        </div>
      </aside>

      <main className={`tasks-page section-${mobileSection}`}>
        <header className="desktop-topbar">
          <button className="desktop-search" onClick={() => { setMobileSection("tasks"); setSearchOpen(true); }}>
            <span>⌕</span>
            <span>Поиск по задачам, сферам, проектам и заметкам...</span>
          </button>
          <div className="desktop-user-area">
            <button className="desktop-bell" aria-label="Уведомления">♢</button>
            <div className="desktop-profile-picker">
              <button
                type="button"
                className="desktop-user"
                onClick={openProfileNamePicker}
                aria-expanded={profileMenuOpen}
                aria-label="Выбрать имя пользователя"
              >
                <span className="desktop-avatar">{profileName.slice(0, 1).toUpperCase()}</span>
                <strong>{profileName}</strong>
                <span className={profileMenuOpen ? "desktop-user-chevron open" : "desktop-user-chevron"}>⌄</span>
              </button>

              {profileMenuOpen && (
                <>
                  <button
                    type="button"
                    className="profile-picker-dismiss"
                    aria-label="Закрыть выбор имени"
                    onClick={() => setProfileMenuOpen(false)}
                  />
                  <form className="profile-name-menu" onSubmit={saveProfileName}>
                    <span>Имя пользователя</span>
                    <input
                      autoFocus
                      value={profileDraft}
                      onChange={(event) => setProfileDraft(event.target.value)}
                      placeholder="Введите имя"
                      maxLength={40}
                    />
                    <small>Это имя показывается в профиле и приветствии на главной.</small>
                    <div>
                      <button type="button" onClick={() => setProfileMenuOpen(false)}>Отмена</button>
                      <button type="submit" disabled={!profileDraft.trim()}>Сохранить</button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>
        </header>

        <header className="mobile-topbar mobile-appbar">
          <button className="mobile-profile-mark mobile-home-mark" onClick={() => setMobileSection("home")} aria-label="На главную">S</button>
          <div className="mobile-app-title">
            <strong>СФЕРА</strong>
            <span>{mobileSection === "home" ? "Сегодня" : mobileSection === "projects" ? "Сферы" : mobileSection === "tasks" ? "Задачи" : mobileSection === "notes" ? "Заметки" : mobileSection === "photos" ? "Фото" : mobileSection === "relations" ? "Связи" : "Календарь"}</span>
          </div>
          <div className="mobile-app-actions">
            {mobileSection === "tasks" && (
              <button className="mobile-icon-action" aria-label="Поиск" onClick={() => setSearchOpen((value) => !value)}>⌕</button>
            )}
            <button className="mobile-icon-action" aria-label="Настройки" onClick={() => setSettingsOpen(true)}>⚙</button>
          </div>
        </header>

        <section className={`home-dashboard ${mobileSection === "home" ? "active" : ""}`} aria-hidden={mobileSection !== "home"}>
          <header className={`dashboard-hero dashboard-hero-${dayPart}`}>
            <div className="dashboard-hero-copy">
              <div className="dashboard-wordmark">СФЕРА</div>
              <p className="dashboard-date">
                <span>{dashboardDate}</span>
                <span className="dashboard-moon-phase" aria-label={`Фаза Луны: ${moonPhase.name}`}>
                  <span aria-hidden="true">· {moonPhase.icon}</span> {moonPhase.name}
                </span>
              </p>
              <h1>{greeting}, {profileName}!</h1>
            </div>
            <div className="dashboard-hero-actions">
              <button className="dashboard-primary-action" onClick={openNewTask}>
                <span>＋</span> Новая задача
              </button>
              <button className="dashboard-secondary-action" onClick={openNewNote}>
                <span>✎</span> Новая заметка
              </button>
            </div>
          </header>

          <div className="dashboard-focus">
            <label htmlFor="daily-focus">
              <span>◎</span>
              <strong>Фокус дня</strong>
            </label>
            <input
              id="daily-focus"
              value={dailyFocus}
              onChange={(event) => setDailyFocus(event.target.value)}
              placeholder="Что сегодня действительно важно?"
              maxLength={120}
            />
            <small>{dailyFocus.trim() ? "Сохранено" : "Можно изменить в любой момент"}</small>
          </div>

          <div className="dashboard-layout">
            <section className="dashboard-card dashboard-today">
              <div className="dashboard-card-head">
                <div>
                  <h2>Задачи на сегодня</h2>
                  <span className="dashboard-progress-copy">
                    {todayTaskCount ? `${completedTodayCount} из ${todayTaskCount} выполнено` : "День пока свободен"}
                  </span>
                </div>
                <button className="dashboard-count-link" onClick={() => { chooseTaskView("today"); setMobileSection("tasks"); }}>
                  Все задачи ›
                </button>
              </div>
              <div className="dashboard-progress" aria-label={`Выполнено ${todayProgress}% задач на сегодня`}>
                <span style={{ width: `${todayProgress}%` }} />
              </div>

              <div className="dashboard-task-list">
                {todayTasks.length === 0 ? (
                  <div className="dashboard-empty dashboard-empty-actionable">
                    <span>✓</span>
                    <div>
                      <strong>{todayTaskCount ? "Все задачи на сегодня выполнены" : "На сегодня всё свободно"}</strong>
                      <small>{rootSpheres.length ? "Можно добавить задачу сразу в нужную сферу." : "Создай первую сферу или добавь задачу."}</small>
                      {rootSpheres.length > 0 && (
                        <div className="dashboard-empty-spheres">
                          {rootSpheres.slice(0, 3).map((sphere) => (
                            <button key={sphere.id} onClick={() => startNewTask(sphere.id)}>＋ {sphere.title}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  todayTasks.map((task) => (
                    <div className={`dashboard-task-row ${task.id === upcomingTask?.id ? "is-next" : ""}`} key={task.id}>
                      {task.uncompletable ? (
                        <span className="dashboard-task-dot">◆</span>
                      ) : (
                        <button
                          className={`check-button priority-ring p${task.priority}`}
                          onClick={() => completeTask(task)}
                          aria-label={`Выполнить задачу «${task.title}»`}
                        />
                      )}
                      <span className="dashboard-task-time">{task.time || "—"}</span>
                      <button className="dashboard-task-main" onClick={() => openDetail(task.id)}>
                        <strong>{task.title}</strong>
                        {task.id === upcomingTask?.id && <small>Ближайшая</small>}
                      </button>
                      {task.projectId && (
                        <span className="dashboard-project-pill">
                          {projectPath(projects, task.projectId).split(" / ").at(-1)}
                        </span>
                      )}
                      <button className="dashboard-row-arrow" aria-label={`Открыть задачу «${task.title}»`} onClick={() => openDetail(task.id)}>›</button>
                    </div>
                  ))
                )}
              </div>
            </section>

            <aside className="dashboard-side dashboard-summary-cards">
              <button className={`dashboard-summary-card dashboard-summary-overdue ${overdueTasks.length ? "has-value" : ""}`} onClick={() => { chooseTaskView("overdue"); setMobileSection("tasks"); }}>
                <span className="dashboard-summary-icon">!</span>
                <span className="dashboard-summary-copy">
                  <small>Просрочено</small>
                  <strong>{overdueTasks.length ? `${overdueTasks.length} ${russianPlural(overdueTasks.length, "задача", "задачи", "задач")}` : "Ничего"}</strong>
                  <em>{overdueTasks.length ? "Нужно разобрать" : "Всё под контролем"}</em>
                </span>
                <b>›</b>
              </button>

              <button className="dashboard-summary-card dashboard-summary-next" onClick={() => upcomingTask ? openDetail(upcomingTask.id) : openNewTask()}>
                <span className="dashboard-summary-icon">◷</span>
                <span className="dashboard-summary-copy">
                  <small>Ближайшая задача</small>
                  <strong>{upcomingTask?.title ?? "План свободен"}</strong>
                  <em>
                    {upcomingTask?.date
                      ? `${upcomingTask.date === isoToday() ? "Сегодня" : formatDate(upcomingTask.date)}${upcomingTask.time ? `, ${upcomingTask.time}` : ""}`
                      : "Добавить задачу"}
                  </em>
                </span>
                <b>›</b>
              </button>

              <button className="dashboard-summary-card dashboard-summary-week" onClick={() => { chooseTaskView("week"); setMobileSection("tasks"); }}>
                <span className="dashboard-summary-icon">▦</span>
                <span className="dashboard-summary-copy">
                  <small>Текущая неделя</small>
                  <strong>{weekTasks.length ? `${weekCompletedCount} из ${weekTasks.length} выполнено` : "Задач пока нет"}</strong>
                  <span className="dashboard-week-progress"><i style={{ width: `${weekProgress}%` }} /></span>
                </span>
                <b>›</b>
              </button>
            </aside>
          </div>

          <section className="dashboard-section">
            <div className="dashboard-section-head">
              <div>
                <h2>Мои сферы жизни</h2>
              </div>
              <button onClick={() => { setSelectedProjectId(null); setMobileSection("projects"); }}>Все сферы ›</button>
            </div>

            <div className="sphere-card-grid">
              {sphereSummaries.map((summary, index) => (
                <button
                  className={`sphere-card sphere-card-rich sphere-tone-${index % 6}`}
                  key={summary.sphere.id}
                  onClick={() => { setSelectedProjectId(summary.sphere.id); setMobileSection("projects"); }}
                >
                  <span className="sphere-symbol">{["⌂","☾","✦","▣","✈","♡"][index % 6]}</span>
                  <span className="sphere-info">
                    <strong>{summary.sphere.title}</strong>
                    <small className="sphere-next-task">
                      {summary.nextTask
                        ? `${summary.nextTask.date ? (summary.nextTask.date === isoToday() ? "Сегодня" : formatDate(summary.nextTask.date)) : "Без даты"}${summary.nextTask.time ? `, ${summary.nextTask.time}` : ""} · ${summary.nextTask.title}`
                        : "Нет активных задач"}
                    </small>
                    <span className="sphere-card-meta">
                      {summary.activeCount} {russianPlural(summary.activeCount, "активная задача", "активные задачи", "активных задач")} · {summary.noteCount} {russianPlural(summary.noteCount, "заметка", "заметки", "заметок")}
                    </span>
                    <span className="sphere-card-progress-copy">
                      <span>{summary.totalCount ? `Готово ${summary.progress}%` : "Задач пока нет"}</span>
                      <span>{summary.totalCount ? `${summary.completedCount}/${summary.totalCount}` : ""}</span>
                    </span>
                    <span className="sphere-card-progress" aria-hidden="true">
                      <i style={{ width: `${summary.progress}%` }} />
                    </span>
                    <span className="sphere-last-activity">Обновлено {recentActivityLabel(summary.lastActivity)}</span>
                  </span>
                  <b>›</b>
                </button>
              ))}
              <button className="sphere-card sphere-create sphere-card-rich" onClick={() => { setProjectParentId(""); setProjectCreateOpen(true); }}>
                <span className="sphere-symbol">＋</span>
                <span className="sphere-info">
                  <strong>Новая сфера</strong>
                  <small className="sphere-next-task">Добавить новую область жизни</small>
                </span>
                <b>›</b>
              </button>
            </div>
          </section>

          <div className="home-function-strip">
            <button onClick={() => { chooseTaskView("week"); setMobileSection("tasks"); }}>
              <span>▦</span><strong>Неделя</strong><small>{weekTaskCount} {russianPlural(weekTaskCount, "задача", "задачи", "задач")}</small>
            </button>
            <button onClick={() => { setSelectedProjectId(rootSpheres[0]?.id ?? null); setProjectTab("goals"); setMobileSection("projects"); }}>
              <span>◎</span><strong>Цели</strong><small>{goals.length} активных</small>
            </button>
            <button onClick={() => openCalendar("month")}>
              <span>◫</span><strong>Календарь</strong><small>Даты и история</small>
            </button>
          </div>

        </section>

        <div className={`tasks-module-content ${mobileSection === "tasks" ? "mobile-section-active" : "mobile-section-hidden"}`}>
        <div className="page-header">
          <div>
            <p className="eyebrow">Модуль</p>
            <h1>Задачи</h1>
            <p className="subtitle">{activeCount} активных · иерархия и подзадачи</p>
          </div>

          <div className="desktop-actions">
            <button className="icon-button" aria-label="Поиск" onClick={() => setSearchOpen((value) => !value)}>⌕</button>
            <button className="primary-button" onClick={() => document.getElementById("quick-add")?.focus()}>
              ＋ Добавить
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="search-row">
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Название, описание или метка"
              aria-label="Поиск по задачам"
            />
            <button className="ghost-button" onClick={() => { setQuery(""); setSearchOpen(false); }}>Закрыть</button>
          </div>
        )}

        <div className="filter-strip task-view-strip" role="tablist" aria-label="Режим задач">
          <button className={taskView === "today" ? "active" : ""} onClick={() => chooseTaskView("today")}>Сегодня</button>
          <button className={taskView === "week" ? "active" : ""} onClick={() => chooseTaskView("week")}>Неделя</button>
          <button className={taskView === "all" ? "active" : ""} onClick={() => chooseTaskView("all")}>Все</button>
          <button className={taskView === "inbox" ? "active" : ""} onClick={() => chooseTaskView("inbox")}>Без даты</button>
          <button className={taskView === "overdue" ? "active" : ""} onClick={() => chooseTaskView("overdue")}>Просрочено</button>
          <button className={taskView === "done" ? "active" : ""} onClick={() => chooseTaskView("done")}>Выполнено</button>
        </div>

        <div className="simple-quick-add">
          <form className="quick-add advanced" onSubmit={addTask}>
            <span className="quick-plus">＋</span>
            <input
              id="quick-add"
              value={quickTitle}
              onChange={(event) => setQuickTitle(event.target.value)}
              placeholder="Добавить задачу…"
              aria-label="Новая задача"
            />
            <button
              type="button"
              className={quickOptionsOpen ? "quick-options-toggle active" : "quick-options-toggle"}
              onClick={() => setQuickOptionsOpen((value) => !value)}
              aria-label="Параметры задачи"
              title="Параметры"
            >•••</button>
            <button type="submit" disabled={!quickTitle.trim()}>Добавить</button>
          </form>

          {quickOptionsOpen && (
            <div className="quick-options-panel">
              <label><span>Дата</span><input type="date" value={quickDate} onChange={(event) => setQuickDate(event.target.value)} /></label>
              <label><span>Время</span><input type="time" value={quickTime} onChange={(event) => setQuickTime(event.target.value)} /></label>
              <label><span>Дедлайн</span><input type="date" value={quickDeadline} onChange={(event) => setQuickDeadline(event.target.value)} /></label>
              <div className="quick-options-project">
                <span>Проект</span>
                {renderProjectLocationPicker(quickProjectId ?? "", (value) => setQuickProjectId(value || null), "Без проекта")}
              </div>
              <div className="quick-options-priority">
                <span>Приоритет</span>
                <div className="quick-priority-picker" role="group" aria-label="Приоритет">
                  {([1, 2, 3, 4] as Priority[]).map((priority) => (
                    <button
                      type="button"
                      key={priority}
                      className={`quick-priority-choice p${priority} ${quickPriority === priority ? "active" : ""}`}
                      onClick={() => setQuickPriority(priority)}
                      title={priorityLabels[priority]}
                    >⚑</button>
                  ))}
                </div>
              </div>
              <div className="quick-options-link">
                <span>Связь</span>
                <select value={quickRelationType} onChange={(event) => { setQuickRelationType(event.target.value as EntityType); setQuickRelationTargetId(""); }}>
                  <option value="project">Проект</option>
                  <option value="task">Задача</option>
                  <option value="note">Заметка</option>
                </select>
                <select value={quickRelationTargetId} onChange={(event) => setQuickRelationTargetId(event.target.value)}>
                  <option value="">Не выбрана</option>
                  {relationTargetOptions(quickRelationType, { type: "task", id: "__new__" }).map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {taskView === "week" ? (
          <section className="week-planner" aria-label="Недельное планирование">
            <div className="week-board">
              {weekDates.map((day) => {
                const dayTasks = tasks
                  .filter((task) => task.status === "active" && task.date === day.iso)
                  .sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99") || a.order - b.order);
                return (
                  <div
                    className={`week-day ${day.iso === isoToday() ? "today" : ""}`}
                    key={day.iso}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (!draggedId) return;
                      patchTask(draggedId, { date: day.iso });
                      setDraggedId(null);
                      setToast("Задача перенесена");
                    }}
                  >
                    <header><span>{day.short}</span><strong>{day.day}</strong></header>
                    <div className="week-day-tasks">
                      {dayTasks.length === 0 ? (
                        <span className="week-empty">Свободно</span>
                      ) : dayTasks.map((task) => (
                        <button
                          className={`week-task p${task.priority}`}
                          key={task.id}
                          draggable
                          onDragStart={() => setDraggedId(task.id)}
                          onDragEnd={() => setDraggedId(null)}
                          onClick={() => openDetail(task.id)}
                        >
                          <strong>{task.time ?? "Без времени"}</strong>
                          <span>{task.title}</span>
                          {task.projectId && <small>{projectPath(projects, task.projectId)}</small>}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div
              className="week-inbox"
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (!draggedId) return;
                patchTask(draggedId, { date: null });
                setDraggedId(null);
                setToast("Задача перенесена в «Без даты»");
              }}
            >
              <div className="week-inbox-head"><strong>Без даты</strong><span>Перетащи сюда задачу, если день ещё не выбран</span></div>
              <div className="week-inbox-items">
                {tasks.filter((task) => task.status === "active" && !task.date).slice(0, 8).map((task) => (
                  <button key={task.id} draggable onDragStart={() => setDraggedId(task.id)} onDragEnd={() => setDraggedId(null)} onClick={() => openDetail(task.id)}>
                    <span>○</span><strong>{task.title}</strong>
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : (
          <section className="task-list todo-tree" aria-live="polite">
            {visibleCount === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">✓</div>
                <h2>{query ? "Ничего не найдено" : "Здесь пока нет задач"}</h2>
                <p>{query ? "Измени запрос или сбрось фильтр." : "Добавь первую задачу. Внутри неё можно создавать подзадачи любого уровня."}</p>
                {query && <button className="secondary-button" onClick={() => setQuery("")}>Сбросить поиск</button>}
              </div>
            ) : (
              <div className="task-rows tree-rows">{renderTree(null)}</div>
            )}
          </section>
        )}

        </div>

        <section className={`mobile-module-screen projects-screen ${mobileSection === "projects" ? "active" : ""}`} aria-hidden={mobileSection !== "projects"}>
          {!selectedProject ? (
            <>
              <header className="projects-header">
                <button className="module-back-button" onClick={() => setMobileSection("home")} aria-label="Назад">←</button>
                <div>
                  <span>Сферы жизни</span>
                  <h2>Сферы</h2>
                </div>
                <div className="projects-header-actions">
                  <div className="project-view-toggle" role="group" aria-label="Вид сфер">
                    <button className={projectView === "grid" ? "active" : ""} onClick={() => setProjectViewMode("grid")} aria-label="Плитка" title="Плитка">▦</button>
                    <button className={projectView === "list" ? "active" : ""} onClick={() => setProjectViewMode("list")} aria-label="Список" title="Список">☷</button>
                  </div>
                  <button className="projects-add-root" aria-label="Создать сферу жизни" onClick={() => { setProjectParentId(""); setProjectCreateOpen(true); }}>＋</button>
                </div>
              </header>
              {projectView === "grid" ? renderProjectGrid(null) : (
                <div className="project-tree-card">
                  {renderProjectTree(null)}
                </div>
              )}
            </>
          ) : (
            <>
              <header className="project-detail-header">
                <button
                  className="project-back"
                  onClick={() => setSelectedProjectId(selectedProject.parentId)}
                  aria-label="Назад"
                >←</button>
                <div>
                  <span>{projectPath(projects, selectedProject.parentId) || "Сферы жизни"}</span>
                  <h2>{selectedProject.title}</h2>
                </div>
                <div className="project-detail-actions">
                  <button
                    className="project-edit-button"
                    aria-label="Редактировать проект"
                    onClick={() => openProjectEditor(selectedProject)}
                  >✎</button>
                  <button
                    className="project-add-folder"
                    aria-label="Добавить подпроект"
                    onClick={() => { setProjectParentId(selectedProject.id); setProjectCreateOpen(true); }}
                  >＋</button>
                </div>
              </header>

              <div className="project-summary-grid">
                <div><strong>{projectTaskCount(selectedProject.id, false)}</strong><span>задач</span></div>
                <div><strong>{projectChildren(projects, selectedProject.id).length}</strong><span>{russianPlural(projectChildren(projects, selectedProject.id).length, "подпроект", "подпроекта", "подпроектов")}</span></div>
                <div><strong>{projectNoteCount(selectedProject.id)}</strong><span>заметок</span></div>
                <div><strong>{attachmentsFor(attachments, { type: "project", id: selectedProject.id }).filter((item) => item.mime.startsWith("image/")).length}</strong><span>фото</span></div>
              </div>

              <div className="project-detail-tabs" role="tablist" aria-label="Раздел проекта">
                {([
                  ["overview", "Обзор"],
                  ["tasks", "Задачи"],
                  ["notes", "Заметки"],
                  ["photos", "Фото"],
                  ["goals", "Цели"],
                  ["history", "История"]
                ] as Array<[ProjectTab, string]>).map(([value, label]) => (
                  <button key={value} className={projectTab === value ? "active" : ""} onClick={() => setProjectTab(value)}>{label}</button>
                ))}
              </div>

              {projectTab === "overview" && (
                <>
                  <section className="project-overview-actions">
                    <button onClick={() => { setProjectParentId(selectedProject.id); setProjectCreateOpen(true); }}>＋ Подпроект</button>
                    <button onClick={() => { setQuickProjectId(selectedProject.id); setMobileQuickOpen(true); }}>＋ Задача</button>
                    <button onClick={() => { setNoteKind("note"); setNoteProjectId(selectedProject.id); setNoteCreateOpen(true); }}>＋ Заметка</button>
                  </section>
                  {projectChildren(projects, selectedProject.id).length > 0 && (
                    <section className="project-section-card project-children-section">
                      <div className="project-section-title-row">
                        <div className="project-section-title">Подпроекты</div>
                        <div className="project-view-toggle compact" role="group" aria-label="Вид подпроектов">
                          <button aria-label="Плитка" title="Плитка" className={projectView === "grid" ? "active" : ""} onClick={() => setProjectViewMode("grid")}>▦</button>
                          <button aria-label="Список" title="Список" className={projectView === "list" ? "active" : ""} onClick={() => setProjectViewMode("list")}>☷</button>
                        </div>
                      </div>
                      {projectView === "grid" ? renderProjectGrid(selectedProject.id) : <div className="project-subtree-list">{renderProjectTree(selectedProject.id)}</div>}
                    </section>
                  )}
                  <section className="project-overview-cards">
                    <button onClick={() => setProjectTab("tasks")}><span>✓</span><strong>Задачи</strong><small>{tasks.filter((task) => task.status === "active" && taskInProjectScope(task, selectedProject.id)).length} активных</small></button>
                    <button onClick={() => setProjectTab("notes")}><span>✎</span><strong>Заметки</strong><small>{projectNoteCount(selectedProject.id)} записей</small></button>
                    <button onClick={() => setProjectTab("goals")}><span>◎</span><strong>Цели</strong><small>{goals.filter((goal) => goal.projectId === selectedProject.id).length} целей</small></button>
                    <button onClick={() => setProjectTab("history")}><span>◴</span><strong>История</strong><small>Хронология проекта</small></button>
                  </section>
                  {renderRelationsPanel({ type: "project", id: selectedProject.id })}
                  {renderAttachmentsPanel({ type: "project", id: selectedProject.id })}
                </>
              )}

              {projectTab === "tasks" && (
                <section className="project-section-card">
                  <div className="project-section-title">Задачи</div>
                  {tasks.filter((task) => task.status === "active" && taskInProjectScope(task, selectedProject.id)).length === 0 ? (
                    <div className="project-empty-row">В этом проекте и его подпроектах пока нет задач.</div>
                  ) : tasks
                    .filter((task) => task.status === "active" && taskInProjectScope(task, selectedProject.id))
                    .sort((a, b) => a.order - b.order)
                    .map((task) => (
                      <button className="project-task-row" key={task.id} onClick={() => openDetail(task.id)}>
                        <span className={`project-task-check p${task.priority}`} />
                        <span><strong>{task.title}</strong><small>{task.date ? formatDate(task.date) : "Без даты"}</small></span>
                        <b>›</b>
                      </button>
                    ))}
                  <button className="project-add-task" onClick={() => { setQuickProjectId(selectedProject.id); setMobileQuickOpen(true); }}>＋ Добавить задачу</button>
                </section>
              )}

              {projectTab === "notes" && (
                <section className="project-section-card">
                  <div className="project-section-title">Заметки</div>
                  {notes.filter((note) => noteInProjectScope(note, selectedProject.id)).length === 0 ? (
                    <div className="project-empty-row">У проекта пока нет заметок.</div>
                  ) : notes.filter((note) => noteInProjectScope(note, selectedProject.id)).map((note) => (
                    <button className="project-note-row" key={note.id} onClick={() => setSelectedNoteId(note.id)}>
                      <span>{note.kind === "diary" ? "☼" : note.kind === "idea" ? "✦" : "✎"}</span>
                      <div><strong>{note.title}</strong><small>{noteKindLabels[note.kind]}{note.projectId ? " · " + projectPath(projects, note.projectId) : ""}</small></div>
                    </button>
                  ))}
                  <button className="project-add-task" onClick={() => { setNoteKind("note"); setNoteProjectId(selectedProject.id); setNoteCreateOpen(true); }}>＋ Добавить заметку</button>
                </section>
              )}

              {projectTab === "photos" && (
                <section className="project-section-card">
                  <div className="project-section-title">Фото и файлы</div>
                  {renderAttachmentsPanel({ type: "project", id: selectedProject.id })}
                </section>
              )}

              {projectTab === "goals" && (
                <section className="project-section-card">
                  <div className="project-section-title">Цели проекта</div>
                  {goals.filter((goal) => goal.projectId === selectedProject.id).map((goal) => (
                    <div className="goal-row" key={goal.id}>
                      <div><strong>{goal.title}</strong><small>{goal.progress}% выполнено</small></div>
                      <div className="goal-progress"><span style={{ width: goal.progress + "%" }} /></div>
                      <input aria-label="Прогресс цели" type="range" min="0" max="100" value={goal.progress} onChange={(event) => patchGoal(goal.id, { progress: Number(event.target.value) })} />
                    </div>
                  ))}
                  <form className="goal-add-form" onSubmit={addGoal}>
                    <input value={goalTitle} onChange={(event) => setGoalTitle(event.target.value)} placeholder="Новая цель проекта" />
                    <button disabled={!goalTitle.trim()}>Добавить</button>
                  </form>
                </section>
              )}

              {projectTab === "history" && (
                <section className="project-section-card">
                  <div className="project-section-title">История проекта</div>
                  {[
                    ...tasks.filter((task) => task.projectId === selectedProject.id).map((task) => ({ id: "t-" + task.id, at: task.updatedAt, icon: "✓", title: task.title, meta: task.status === "done" ? "Задача выполнена" : "Задача изменена" })),
                    ...notes.filter((note) => note.projectId === selectedProject.id).map((note) => ({ id: "n-" + note.id, at: note.updatedAt, icon: "✎", title: note.title, meta: noteKindLabels[note.kind] })),
                    ...goals.filter((goal) => goal.projectId === selectedProject.id).map((goal) => ({ id: "g-" + goal.id, at: goal.updatedAt, icon: "◎", title: goal.title, meta: "Цель · " + goal.progress + "%" }))
                  ].sort((a, b) => b.at.localeCompare(a.at)).map((event) => (
                    <div className="history-row" key={event.id}>
                      <span>{event.icon}</span>
                      <div><strong>{event.title}</strong><small>{event.meta}</small></div>
                      <time>{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(event.at))}</time>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
        </section>

        <section className={`mobile-module-screen notes-screen ${mobileSection === "notes" ? "active" : ""}`} aria-hidden={mobileSection !== "notes"}>
          <header className="module-page-header">
            <div><span>Личная база знаний</span><h2>Заметки</h2></div>
            <button aria-label="Создать заметку" onClick={openNewNote}>＋</button>
          </header>

          <div className="section-tabs notes-tabs" role="tablist" aria-label="Типы заметок">
            {([
              ["all", "Все"],
              ["ideas", "Идеи"],
              ["diary", "Дневник"],
              ["collections", "Коллекции"],
              ["lists", "Списки"],
              ["favorites", "Важное"]
            ] as Array<[NoteView, string]>).map(([value, label]) => (
              <button key={value} className={noteView === value ? "active" : ""} onClick={() => setNoteView(value)}>{label}</button>
            ))}
          </div>

          {noteView === "collections" && (
            <div className="collection-presets">
              {["Рецепты", "Книги", "Фильмы", "Клиенты"].map((name, index) => (
                <button key={name} onClick={() => { setNoteKind("collection"); setNoteTitle(name); setNoteProjectId(null); setNoteCreateOpen(true); }}>
                  <span>{["⌑","▤","▷","◎"][index]}</span><strong>{name}</strong><small>Коллекция</small>
                </button>
              ))}
            </div>
          )}

          <div className="notes-grid">
            {visibleNotes.length === 0 ? (
              <div className="module-empty-card"><strong>Здесь пока пусто</strong><span>Создай первую запись через кнопку «+».</span></div>
            ) : visibleNotes.map((note) => (
              <article className={`note-card note-kind-${note.kind}`} key={note.id} onClick={() => setSelectedNoteId(note.id)}>
                <div className="note-card-top">
                  <span>{note.kind === "diary" ? "☼" : note.kind === "idea" ? "✦" : note.kind === "collection" ? "▦" : note.kind === "list" ? "☷" : "✎"}</span>
                  <small>{noteKindLabels[note.kind]}</small>
                  <button className={note.favorite ? "favorite active" : "favorite"} aria-label={note.favorite ? "Убрать из важного" : "Добавить в важное"} onClick={(event) => { event.stopPropagation(); setNotes((current) => current.map((item) => item.id === note.id ? { ...item, favorite: !item.favorite, updatedAt: nowIso() } : item)); }}>☆</button>
                </div>
                <h3>{note.title}</h3>
                {note.body && <p>{note.body}</p>}
                <footer>
                  <span>{note.date ? formatDate(note.date) : new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(note.updatedAt))}</span>
                  {note.projectId && <span>{projectPath(projects, note.projectId)}</span>}
                </footer>
              </article>
            ))}
          </div>
        </section>

        <section className={`mobile-module-screen photos-screen ${mobileSection === "photos" ? "active" : ""}`} aria-hidden={mobileSection !== "photos"}>
          <header className="module-page-header">
            <button className="module-back-button" onClick={() => setMobileSection("home")} aria-label="Назад">←</button>
            <div><span>Визуальная память</span><h2>Фото</h2></div>
            <button aria-label="Добавить фото" onClick={() => setToast("Загрузка фото — следующий функциональный шаг")}>＋</button>
          </header>
          <div className="section-tabs photo-tabs">
            {["Все", "Последние", "По проектам", "По сферам", "Альбомы", "Без проекта"].map((label, index) => (
              <button key={label} className={index === 0 ? "active" : ""}>{label}</button>
            ))}
          </div>
          <div className="photo-architecture-card">
            <div className="photo-architecture-icon">▧</div>
            <div>
              <strong>Единая фотогалерея</strong>
              <p>Фото хранится один раз и может быть прикреплено к проекту, задаче или заметке.</p>
            </div>
          </div>
          {attachments.filter((item) => item.mime.startsWith("image/")).length === 0 ? (
            <div className="module-empty-card">
              <strong>Фото пока нет</strong>
              <span>Прикрепи фото внутри сферы, задачи или заметки — оно появится здесь автоматически.</span>
            </div>
          ) : (
            <div className="global-photo-grid">
              {attachments.filter((item) => item.mime.startsWith("image/")).map((item) => (
                <article key={item.id}>
                  <img src={item.dataUrl} alt={item.name} />
                  <div><strong>{item.name}</strong><small>{item.links.map((ref) => entityTitle(ref)).join(" · ")}</small></div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className={`mobile-module-screen calendar-screen ${mobileSection === "calendar" ? "active" : ""}`} aria-hidden={mobileSection !== "calendar"}>
          <DesktopCalendar
            tasks={tasks}
            projects={projects}
            dates={desktopCalendarDates}
            title={desktopCalendarTitle}
            dayCount={desktopCalendarDayCount}
            timezoneLabel={timezoneLabel}
            todayIso={isoToday()}
            onOpenTask={openDetail}
            onCreateTask={openCalendarTaskCreator}
            onToday={chooseTodayPeriod}
            onMovePeriod={moveDesktopCalendarPeriod}
            onSetPeriod={setDesktopCalendarPeriod}
          />

          <div className="mobile-calendar-view">
          <header className="module-page-header calendar-page-header">
            <button className="module-back-button" onClick={() => setMobileSection("home")} aria-label="Назад">←</button>
            <div><span>Время и хронология</span><h2>Календарь</h2></div>
            <button onClick={() => setCalendarCursor(new Date())}>Сегодня</button>
          </header>

          <div className="section-tabs calendar-tabs">
            {([
              ["day", "День"],
              ["week", "Неделя"],
              ["month", "Месяц"],
              ["history", "История"]
            ] as Array<[CalendarMode, string]>).map(([value, label]) => (
              <button key={value} className={calendarMode === value ? "active" : ""} onClick={() => setCalendarMode(value)}>{label}</button>
            ))}
          </div>

          {calendarMode === "month" && (
            <section className="calendar-month-card">
              <header className="calendar-month-head">
                <button aria-label="Предыдущий месяц" onClick={() => setMonthOffset(-1)}>←</button>
                <h3>{calendarTitle}</h3>
                <button aria-label="Следующий месяц" onClick={() => setMonthOffset(1)}>→</button>
              </header>
              <div className="calendar-weekdays">{["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map((day) => <span key={day}>{day}</span>)}</div>
              <div className="calendar-grid">
                {calendarCells.map((cell) => {
                  const cellTasks = tasks.filter((task) => task.status === "active" && task.date === cell.iso);
                  return (
                    <button className={`calendar-cell ${cell.inMonth ? "" : "muted"} ${cell.iso === isoToday() ? "today" : ""}`} key={cell.iso}>
                      <strong>{cell.day}</strong>
                      {cellTasks.length > 0 && <span>{cellTasks.length}</span>}
                      {cellTasks.slice(0, 1).map((task) => <small key={task.id}>{task.title}</small>)}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {calendarMode === "day" && (
            <section className="calendar-list-card">
              <div className="calendar-list-title"><strong>Сегодня</strong><span>{todayTasks.length} {russianPlural(todayTasks.length, "задача", "задачи", "задач")}</span></div>
              {todayTasks.length === 0 ? <p className="project-empty-row">На сегодня ничего не запланировано.</p> : todayTasks.map((task) => (
                <button className="calendar-event-row" key={task.id} onClick={() => openDetail(task.id)}>
                  <time>{task.time ?? "—"}</time><div><strong>{task.title}</strong><small>{task.projectId ? projectPath(projects, task.projectId) : "Без проекта"}</small></div><b>›</b>
                </button>
              ))}
            </section>
          )}

          {calendarMode === "week" && (
            <section className="calendar-week-list">
              {weekDates.map((day) => {
                const dayTasks = tasks.filter((task) => task.status === "active" && task.date === day.iso);
                return (
                  <div className="calendar-week-row" key={day.iso}>
                    <div><strong>{day.short}</strong><span>{day.day}</span></div>
                    <div>{dayTasks.length === 0 ? <small>Свободно</small> : dayTasks.map((task) => <button key={task.id} onClick={() => openDetail(task.id)}>{task.time ?? "—"} · {task.title}</button>)}</div>
                  </div>
                );
              })}
            </section>
          )}

          {calendarMode === "history" && (
            <section className="calendar-list-card history-timeline">
              <div className="calendar-list-title"><strong>История СФЕРЫ</strong><span>последние изменения</span></div>
              {historyEvents.map((event) => (
                <div className="history-row" key={event.id}>
                  <span>{event.icon}</span>
                  <div><strong>{event.title}</strong><small>{event.meta}</small></div>
                  <time>{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(event.at))}</time>
                </div>
              ))}
            </section>
          )}

          </div>
        </section>

        <section className={`mobile-module-screen relations-screen ${mobileSection === "relations" ? "active" : ""}`} aria-hidden={mobileSection !== "relations"}>
          <header className="module-page-header">
            <button className="module-back-button" onClick={() => setMobileSection("home")} aria-label="Назад">←</button>
            <div><span>Связанные объекты</span><h2>Связи</h2></div>
            <span className="relations-count">{relationGraphObjects.length}</span>
          </header>

          {relationGraphObjects.length === 0 ? (
            <div className="module-empty-card">
              <strong>Объектов пока нет</strong>
              <span>Создай сферу, проект, задачу или заметку — они сразу появятся на карте.</span>
            </div>
          ) : (
            <>
              <RelationsGraph
                relations={relations}
                objects={relationGraphObjects}
                structureEdges={relationGraphStructureEdges}
                getTitle={graphEntityTitle}
                getTypeLabel={entityTypeLabel}
                onOpen={openLinkedObject}
              />
              <details className="relations-list-disclosure">
                <summary>Ручные связи · {relations.length}</summary>
                {relations.length === 0 ? (
                  <div className="relations-list-empty">Ручных связей пока нет. Пунктирные связи на карте строятся автоматически из структуры проектов.</div>
                ) : (
                  <div className="relations-page-list">
                    {relations.map((relation) => (
                      <article className="relations-page-card" key={relation.id}>
                        <button onClick={() => openLinkedObject(relation.a)}>
                          <small>{entityTypeLabel(relation.a.type)}</small>
                          <strong>{entityTitle(relation.a)}</strong>
                        </button>
                        <span className="relation-arrow">↔</span>
                        <button onClick={() => openLinkedObject(relation.b)}>
                          <small>{entityTypeLabel(relation.b.type)}</small>
                          <strong>{entityTitle(relation.b)}</strong>
                        </button>
                        <button
                          className="relation-delete"
                          aria-label="Удалить связь"
                          onClick={() => setRelations((current) => current.filter((item) => item.id !== relation.id))}
                        >×</button>
                      </article>
                    ))}
                  </div>
                )}
              </details>
            </>
          )}
        </section>

        <button className="fab" aria-label="Быстрое добавление" onClick={() => setQuickMenuOpen(true)}>＋</button>

        <nav className="bottom-nav mobile-tabbar" aria-label="Основная навигация">
          <button className={mobileSection === "projects" && !settingsOpen ? "active" : ""} onClick={() => { setMobileSection("projects"); setSettingsOpen(false); }}><span>◇</span>Сферы</button>
          <button className={mobileSection === "tasks" && !settingsOpen ? "active" : ""} onClick={() => { setMobileSection("tasks"); setSettingsOpen(false); }}><span>✓</span>Задачи</button>
          <button className={mobileSection === "notes" && !settingsOpen ? "active" : ""} onClick={() => { setMobileSection("notes"); setSettingsOpen(false); }}><span>✎</span>Заметки</button>
          <button className={mobileSection === "photos" && !settingsOpen ? "active" : ""} onClick={() => { setMobileSection("photos"); setSettingsOpen(false); }}><span>▧</span>Фото</button>
        </nav>

        {quickMenuOpen && (
          <div className="mobile-quick-backdrop" onClick={() => setQuickMenuOpen(false)}>
            <div className="mobile-quick-sheet quick-type-sheet" onClick={(event) => event.stopPropagation()}>
              <div className="mobile-sheet-handle" />
              <div className="mobile-quick-head"><strong>Что добавить?</strong><button onClick={() => setQuickMenuOpen(false)}>Отмена</button></div>
              <div className="quick-type-grid">
                <button onClick={() => {
                  setQuickMenuOpen(false);
                  setQuickProjectId(mobileSection === "projects" && selectedProject ? selectedProject.id : null);
                  setMobileQuickOpen(true);
                }}><span>✓</span><strong>Задачу</strong><small>Дело, дата, приоритет</small></button>
                <button onClick={() => { setQuickMenuOpen(false); setNoteKind("note"); setNoteProjectId(mobileSection === "projects" && selectedProject ? selectedProject.id : null); setNoteCreateOpen(true); }}><span>✎</span><strong>Заметку</strong><small>Мысль или запись</small></button>
                <button onClick={() => { setQuickMenuOpen(false); setNoteKind("diary"); setNoteProjectId(mobileSection === "projects" && selectedProject ? selectedProject.id : null); setNoteCreateOpen(true); }}><span>☼</span><strong>Дневник</strong><small>Запись сегодняшнего дня</small></button>
                <button onClick={() => { setQuickMenuOpen(false); setMobileSection("photos"); setToast("Открыт раздел фото"); }}><span>▧</span><strong>Фото</strong><small>Визуальные материалы</small></button>
                <button onClick={() => { setQuickMenuOpen(false); setProjectParentId(selectedProject?.id ?? ""); setProjectCreateOpen(true); }}><span>◇</span><strong>Проект</strong><small>Сфера или подпроект</small></button>
              </div>
            </div>
          </div>
        )}

        {noteCreateOpen && (
          <div className="mobile-quick-backdrop" onClick={() => setNoteCreateOpen(false)}>
            <form className="mobile-quick-sheet note-create-sheet" onSubmit={addNote} onClick={(event) => event.stopPropagation()}>
              <div className="mobile-sheet-handle" />
              <div className="mobile-quick-head">
                <strong>Новая запись</strong>
                <button type="button" onClick={() => setNoteCreateOpen(false)}>Отмена</button>
              </div>
              <div className="note-kind-picker">
                {([
                  ["note", "Заметка"],
                  ["idea", "Идея"],
                  ["diary", "Дневник"],
                  ["collection", "Коллекция"],
                  ["list", "Список"]
                ] as Array<[NoteKind, string]>).map(([value, label]) => (
                  <button type="button" key={value} className={noteKind === value ? "active" : ""} onClick={() => setNoteKind(value)}>{label}</button>
                ))}
              </div>
              <input className="project-title-input" autoFocus value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} placeholder="Название" />
              <textarea value={noteBody} onChange={(event) => setNoteBody(event.target.value)} placeholder="Текст, мысль, список..." rows={5} />
              <div className="project-parent-select">
                <span>Основное расположение</span>
                {renderProjectLocationPicker(noteProjectId ?? "", (value) => setNoteProjectId(value || null), "Без проекта")}
              </div>
              <button className="mobile-add-submit" disabled={!noteTitle.trim()}>Сохранить</button>
            </form>
          </div>
        )}

        {projectCreateOpen && (
          <div className="mobile-quick-backdrop" onClick={() => setProjectCreateOpen(false)}>
            <form className="mobile-quick-sheet project-create-sheet" onSubmit={addProject} onClick={(event) => event.stopPropagation()}>
              <div className="mobile-sheet-handle" />
              <div className="mobile-quick-head">
                <strong>{projectParentId ? "Новый подпроект" : "Новая сфера жизни"}</strong>
                <button type="button" onClick={() => setProjectCreateOpen(false)}>Отмена</button>
              </div>
              <input
                className="project-title-input"
                autoFocus
                value={projectTitle}
                onChange={(event) => setProjectTitle(event.target.value)}
                placeholder={projectParentId ? "Название проекта" : "Например: Семья"}
              />
              <div className="project-parent-select">
                <span>Расположение</span>
                {renderProjectLocationPicker(projectParentId, setProjectParentId, "Корень · новая сфера жизни")}
              </div>
              <button className="mobile-add-submit" disabled={!projectTitle.trim()}>
                {projectParentId ? "Создать проект" : "Создать сферу"}
              </button>
            </form>
          </div>
        )}

        {projectEditOpen && selectedProject && (
          <div className="mobile-quick-backdrop" onClick={() => setProjectEditOpen(false)}>
            <form className="mobile-quick-sheet project-create-sheet" onSubmit={saveProjectEdit} onClick={(event) => event.stopPropagation()}>
              <div className="mobile-sheet-handle" />
              <div className="mobile-quick-head">
                <strong>Редактировать проект</strong>
                <button type="button" onClick={() => setProjectEditOpen(false)}>Отмена</button>
              </div>
              <input className="project-title-input" autoFocus value={editProjectTitle} onChange={(event) => setEditProjectTitle(event.target.value)} placeholder="Название" />
              <div className="project-parent-select">
                <span>Расположение</span>
                {renderProjectLocationPicker(
                  editProjectParentId,
                  setEditProjectParentId,
                  "Корень · сфера жизни",
                  new Set([selectedProject.id, ...projectDescendants(projects, selectedProject.id).map((item) => item.id)])
                )}
              </div>
              <button className="mobile-add-submit" disabled={!editProjectTitle.trim()}>Сохранить</button>
              <button type="button" className="danger-sheet-button" onClick={() => deleteProjectNode(selectedProject)}>Удалить проект</button>
            </form>
          </div>
        )}

        {calendarComposerOpen && (
          <div className="calendar-popover-layer" onClick={closeCalendarTaskComposer}>
            <form
              ref={calendarComposerRef}
              className="calendar-task-popover"
              style={{ left: calendarComposerPosition.left, top: calendarComposerPosition.top }}
              onSubmit={addTask}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="calendar-popover-top">
                <span className="calendar-drag-mark">≡</span>
                <button type="button" className="calendar-popover-close" onClick={closeCalendarTaskComposer} aria-label="Закрыть">×</button>
              </div>

              <input
                className="calendar-popover-title"
                autoFocus
                value={quickTitle}
                onChange={(event) => setQuickTitle(event.target.value)}
                placeholder="Добавьте название"
              />

              <div className="calendar-popover-tabs">
                <button type="button" className="active">Задача</button>
                <button type="button" onClick={() => setToast("События добавим отдельным типом объекта")}>Событие</button>
                <button type="button" onClick={() => setToast("Расписание встреч — следующий слой календаря")}>Расписание встреч</button>
              </div>

              <div className="calendar-popover-rows">
                <div className="calendar-popover-row calendar-date-row">
                  <span className="calendar-row-icon">◷</span>
                  <div className="calendar-date-controls">
                    <input type="date" value={quickDate} onChange={(event) => setQuickDate(event.target.value)} />
                    {quickTime ? (
                      <div className="calendar-time-range">
                        <input type="time" value={quickTime} onChange={(event) => setQuickTime(event.target.value)} />
                        <span>–</span>
                        <strong>{calendarEndTime()}</strong>
                      </div>
                    ) : (
                      <button type="button" className="calendar-all-day-pill">Весь день</button>
                    )}
                    <small>{timezoneLabel} · не повторять</small>
                  </div>
                </div>

                <div className="calendar-popover-row">
                  <span className="calendar-row-icon">◇</span>
                  <div className="calendar-row-content">
                    <span className="calendar-row-label">Проект</span>
                    {renderProjectLocationPicker(quickProjectId ?? "", (value) => setQuickProjectId(value || null), "Без проекта")}
                  </div>
                </div>

                <div className="calendar-popover-row">
                  <span className="calendar-row-icon">⚑</span>
                  <div className="calendar-row-content">
                    <span className="calendar-row-label">Приоритет</span>
                    <div className="quick-priority-picker calendar-priority-picker" role="group" aria-label="Приоритет">
                      {([1, 2, 3, 4] as Priority[]).map((priority) => (
                        <button
                          type="button"
                          key={priority}
                          className={`quick-priority-choice p${priority} ${quickPriority === priority ? "active" : ""}`}
                          onClick={() => setQuickPriority(priority)}
                          title={priorityLabels[priority]}
                        >⚑</button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="calendar-popover-row">
                  <span className="calendar-row-icon">↔</span>
                  <div className="calendar-row-content calendar-link-inline">
                    <span className="calendar-row-label">Связь</span>
                    <select value={quickRelationType} onChange={(event) => { setQuickRelationType(event.target.value as EntityType); setQuickRelationTargetId(""); }}>
                      <option value="project">Проект</option>
                      <option value="task">Задача</option>
                      <option value="note">Заметка</option>
                    </select>
                    <select value={quickRelationTargetId} onChange={(event) => setQuickRelationTargetId(event.target.value)}>
                      <option value="">Не выбрана</option>
                      {relationTargetOptions(quickRelationType, { type: "task", id: "__new__" }).map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {quickOptionsOpen && (
                  <div className="calendar-popover-row">
                    <span className="calendar-row-icon">▦</span>
                    <div className="calendar-row-content">
                      <span className="calendar-row-label">Дедлайн</span>
                      <input className="calendar-deadline-input" type="date" value={quickDeadline} onChange={(event) => setQuickDeadline(event.target.value)} />
                    </div>
                  </div>
                )}
              </div>

              <footer className="calendar-popover-footer">
                <button type="button" className="calendar-more-settings" onClick={() => setQuickOptionsOpen((value) => !value)}>
                  {quickOptionsOpen ? "Скрыть параметры" : "Другие параметры"}
                </button>
                <button type="submit" className="calendar-save-button" disabled={!quickTitle.trim()}>Сохранить</button>
              </footer>
            </form>
          </div>
        )}

        {mobileQuickOpen && (
          <div className="mobile-quick-backdrop" onClick={() => setMobileQuickOpen(false)}>
            <form className="mobile-quick-sheet" onSubmit={addTask} onClick={(event) => event.stopPropagation()}>
              <div className="mobile-sheet-handle" />
              <div className="mobile-quick-head">
                <div>
                  <strong>Новая задача</strong>
                  {quickProjectId && <small>{projectPath(projects, quickProjectId)}</small>}
                </div>
                <button type="button" onClick={() => { setMobileQuickOpen(false); setQuickProjectId(null); setQuickPriority(4); setQuickDate(""); setQuickTime(""); setQuickDeadline(""); setQuickRelationType("project"); setQuickRelationTargetId(""); setQuickOptionsOpen(false); }}>Отмена</button>
              </div>
              <textarea
                autoFocus
                value={quickTitle}
                onChange={(event) => setQuickTitle(event.target.value)}
                placeholder="Что нужно сделать?"
                rows={3}
              />
              {(quickDate || quickTime) && (
                <div className="calendar-create-context">
                  {quickDate && <span>▦ {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(isoDate(quickDate))}</span>}
                  {quickTime && <span>◴ {quickTime}</span>}
                </div>
              )}
              <button
                type="button"
                className="mobile-more-options"
                onClick={() => setQuickOptionsOpen((value) => !value)}
              >{quickOptionsOpen ? "Скрыть параметры" : "Параметры"}</button>
              {quickOptionsOpen && (
                <div className="mobile-quick-options">
                  <label><span>Дата</span><input type="date" value={quickDate} onChange={(event) => setQuickDate(event.target.value)} /></label>
                  <label><span>Время</span><input type="time" value={quickTime} onChange={(event) => setQuickTime(event.target.value)} /></label>
                  <label><span>Дедлайн</span><input type="date" value={quickDeadline} onChange={(event) => setQuickDeadline(event.target.value)} /></label>
                  <div className="quick-options-project">
                    <span>Проект</span>
                    {renderProjectLocationPicker(quickProjectId ?? "", (value) => setQuickProjectId(value || null), "Без проекта")}
                  </div>
                  <div className="quick-options-priority">
                    <span>Приоритет</span>
                    <div className="quick-priority-picker" role="group" aria-label="Приоритет">
                      {([1, 2, 3, 4] as Priority[]).map((priority) => (
                        <button
                          type="button"
                          key={priority}
                          className={`quick-priority-choice p${priority} ${quickPriority === priority ? "active" : ""}`}
                          onClick={() => setQuickPriority(priority)}
                          title={priorityLabels[priority]}
                        >⚑</button>
                      ))}
                    </div>
                  </div>
                  <div className="quick-options-link">
                    <span>Связь</span>
                    <select value={quickRelationType} onChange={(event) => { setQuickRelationType(event.target.value as EntityType); setQuickRelationTargetId(""); }}>
                      <option value="project">Проект</option>
                      <option value="task">Задача</option>
                      <option value="note">Заметка</option>
                    </select>
                    <select value={quickRelationTargetId} onChange={(event) => setQuickRelationTargetId(event.target.value)}>
                      <option value="">Не выбрана</option>
                      {relationTargetOptions(quickRelationType, { type: "task", id: "__new__" }).map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              <button className="mobile-add-submit" disabled={!quickTitle.trim()}>Добавить задачу</button>
            </form>
          </div>
        )}
      </main>

      <section className={`mobile-settings-screen ${settingsOpen ? "open" : ""}`} aria-hidden={!settingsOpen}>
        <header className="mobile-settings-header">
          <div />
          <h2>Настройки</h2>
          <button onClick={() => setSettingsOpen(false)}>Готово</button>
        </header>
        <div className="mobile-settings-content">
          <div className="settings-card">
            <button><span className="settings-icon">◎</span><span>Аккаунт</span><b>›</b></button>
            <button><span className="settings-icon">⚙</span><span>Основное</span><b>›</b></button>
            <button onClick={() => { setSettingsOpen(false); openCalendar("month"); }}><span className="settings-icon">▦</span><span>Календарь</span><b>›</b></button>
          </div>

          <p className="settings-section-label">ПОЛЬЗОВАТЕЛЬСКИЕ НАСТРОЙКИ</p>
          <div className="settings-card">
            <button><span className="settings-icon">◐</span><span>Тема</span><em>Системная</em><b>›</b></button>
            <button><span className="settings-icon">▤</span><span>Навигация</span><b>›</b></button>
            <button><span className="settings-icon">⊞</span><span>Быстрое добавление</span><b>›</b></button>
          </div>

          <p className="settings-section-label">ПРОДУКТИВНОСТЬ</p>
          <div className="settings-card">
            <button><span className="settings-icon">↗</span><span>Продуктивность</span><b>›</b></button>
            <button><span className="settings-icon">◴</span><span>Напоминания</span><b>›</b></button>
            <button><span className="settings-icon">♢</span><span>Уведомления</span><b>›</b></button>
          </div>

          <div className="settings-card settings-spaced">
            <button><span className="settings-icon">?</span><span>Поддержка и обратная связь</span><b>›</b></button>
            <button><span className="settings-icon">i</span><span>О СФЕРЕ</span><b>›</b></button>
            <button><span className="settings-icon">↻</span><span>Синхронизация</span><small>Локальные данные</small><b>›</b></button>
          </div>
        </div>
      </section>

      <aside className={`detail-pane note-detail ${selectedNote ? "open" : ""}`} aria-hidden={!selectedNote}>
        {selectedNote && (
          <>
            <header className="detail-header">
              <button className="back-button" onClick={() => setSelectedNoteId(null)} aria-label="Назад">←</button>
              <div className="detail-breadcrumb"><span>Заметка</span></div>
              <button className="icon-button danger-text" onClick={() => deleteNote(selectedNote)} aria-label="Удалить заметку">⌫</button>
            </header>
            <div className="detail-content">
              <input
                className="note-detail-title"
                value={selectedNote.title}
                onChange={(event) => patchNote(selectedNote.id, { title: event.target.value })}
              />
              <textarea
                className="note-detail-body"
                value={selectedNote.body}
                onChange={(event) => patchNote(selectedNote.id, { body: event.target.value })}
                placeholder="Текст заметки..."
                rows={8}
              />
              <div className="note-detail-properties">
                <label>
                  <span>Тип</span>
                  <select value={selectedNote.kind} onChange={(event) => patchNote(selectedNote.id, { kind: event.target.value as NoteKind })}>
                    {Object.entries(noteKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <div className="project-property-picker">
                  <span>Основное расположение</span>
                  {renderProjectLocationPicker(selectedNote.projectId ?? "", (value) => patchNote(selectedNote.id, { projectId: value || null }), "Без проекта")}
                </div>
              </div>
              {renderRelationsPanel({ type: "note", id: selectedNote.id })}
              {renderAttachmentsPanel({ type: "note", id: selectedNote.id })}
            </div>
          </>
        )}
      </aside>
      {selectedNote && <button className="detail-backdrop note-backdrop" aria-label="Закрыть заметку" onClick={() => setSelectedNoteId(null)} />}

      <aside className={`detail-pane todo-detail ${selected ? "open" : ""}`} aria-hidden={!selected}>
        {selected && (
          <>
            <header className="detail-header">
              <button className="back-button" onClick={closeDetail} aria-label="Назад к задачам">←</button>
              <div className="detail-breadcrumb">
                {selectedParent ? (
                  <button onClick={() => openDetail(selectedParent.id)}>{selectedParent.title}</button>
                ) : (
                  <span>Задача</span>
                )}
              </div>
              <details className="task-menu">
                <summary className="icon-button" aria-label="Меню задачи">⋯</summary>
                <div className="task-menu-popover">
                  <button onClick={() => duplicateTask(selected)}>Дублировать</button>
                  <button onClick={() => copyTaskLink(selected)}>Копировать ссылку</button>
                  {selected.recurrence && <button onClick={() => completeTask(selected, true)}>Выполнить навсегда</button>}
                  <button className="danger" onClick={() => deleteTask(selected)}>Удалить</button>
                </div>
              </details>
            </header>

            <div className="detail-content">
              <div className="detail-title-row">
                {selected.uncompletable ? (
                  <span className="uncompletable-mark large">◆</span>
                ) : (
                  <button
                    className={`check-button priority-ring p${selected.priority} ${selected.status === "done" ? "checked" : ""}`}
                    onClick={() => completeTask(selected)}
                    aria-label="Изменить статус"
                  >
                    {selected.status === "done" ? "✓" : ""}
                  </button>
                )}
                <textarea
                  id="task-title"
                  className="detail-title"
                  value={selected.title}
                  onChange={(event) => patchTask(selected.id, { title: event.target.value })}
                  rows={2}
                />
              </div>

              <textarea
                className="detail-description"
                value={selected.description}
                onChange={(event) => patchTask(selected.id, { description: event.target.value })}
                placeholder="Описание"
                rows={3}
              />

              <div className="task-chips">
                <label className="task-chip">
                  <span>Дата</span>
                  <input type="date" value={selected.date ?? ""} onChange={(event) => patchTask(selected.id, { date: event.target.value || null })} />
                </label>
                <label className="task-chip">
                  <span>Время</span>
                  <input type="time" value={selected.time ?? ""} onChange={(event) => patchTask(selected.id, { time: event.target.value || null })} />
                </label>
                <label className="task-chip">
                  <span>Дедлайн</span>
                  <input type="date" value={selected.deadline ?? ""} onChange={(event) => patchTask(selected.id, { deadline: event.target.value || null })} />
                </label>
                <label className="task-chip compact">
                  <span>Приоритет</span>
                  <div className="detail-priority-picker" role="group" aria-label="Приоритет">
                    {([1, 2, 3, 4] as Priority[]).map((priority) => (
                      <button
                        type="button"
                        key={priority}
                        className={`detail-priority-option p${priority} ${selected.priority === priority ? "active" : ""}`}
                        onClick={() => patchTask(selected.id, { priority })}
                        aria-pressed={selected.priority === priority}
                      >
                        <span className="priority-dot" aria-hidden="true" />
                        <span>{priorityLabels[priority]}</span>
                      </button>
                    ))}
                  </div>
                </label>
                <label className="task-chip compact">
                  <span>Длительность</span>
                  <select
                    value={selected.durationMinutes ?? ""}
                    onChange={(event) => patchTask(selected.id, { durationMinutes: event.target.value ? Number(event.target.value) : null })}
                    disabled={!selected.date || !selected.time}
                    title={!selected.date || !selected.time ? "Сначала укажи дату и время" : ""}
                  >
                    <option value="">—</option>
                    <option value="15">15 мин</option>
                    <option value="30">30 мин</option>
                    <option value="45">45 мин</option>
                    <option value="60">1 ч</option>
                    <option value="90">1,5 ч</option>
                    <option value="120">2 ч</option>
                    <option value="240">4 ч</option>
                    <option value="480">8 ч</option>
                  </select>
                </label>
              </div>

              <section className="detail-section property-section project-property">
                <div className="project-property-picker">
                  <span>Проект</span>
                  {renderProjectLocationPicker(selected.projectId ?? "", (value) => setTaskProject(selected, value || null), "Без проекта")}
                </div>
                {selected.projectId && (
                  <button className="open-project-button" onClick={() => { setSelectedProjectId(selected.projectId); setMobileSection("projects"); closeDetail(); }}>
                    ◇ {projectPath(projects, selected.projectId)}
                  </button>
                )}
              </section>

              {renderRelationsPanel({ type: "task", id: selected.id })}
              {renderAttachmentsPanel({ type: "task", id: selected.id })}

              <section className="detail-section property-section">
                <label>
                  <span>Повтор</span>
                  <input
                    value={selected.recurrence ?? ""}
                    onChange={(event) => patchTask(selected.id, { recurrence: event.target.value || null })}
                    placeholder="каждый день, каждую неделю, every monday…"
                  />
                </label>
                {selected.recurrence && (
                  <label className="switch-line">
                    <input
                      type="checkbox"
                      checked={selected.resetSubtasks}
                      onChange={(event) => patchTask(selected.id, { resetSubtasks: event.target.checked })}
                    />
                    <span>Сбрасывать прямые подзадачи при новом повторе</span>
                  </label>
                )}
              </section>

              <section className="detail-section property-section">
                <label>
                  <span>Метки</span>
                  <input
                    value={selected.labels.join(", ")}
                    onChange={(event) => patchTask(selected.id, {
                      labels: event.target.value.split(",").map((item) => item.trim()).filter(Boolean)
                    })}
                    placeholder="работа, звонки, дом"
                  />
                </label>
              </section>

              <section className="detail-section subtasks-section">
                <div className="section-heading">
                  <h3>Подзадачи</h3>
                  <span>{childrenOf(tasks, selected.id).filter((item) => item.status === "active").length} активных</span>
                </div>

                <div className="selected-subtasks">
                  {childrenOf(tasks, selected.id)
                    .filter((item) => item.status === "active" || selected.showCompletedSubtasks)
                    .map((subtask) => (
                      <div className="subtask-line" key={subtask.id}>
                        {subtask.uncompletable ? (
                          <span className="uncompletable-mark">◆</span>
                        ) : (
                          <button
                            className={`check-button priority-ring p${subtask.priority} ${subtask.status === "done" ? "checked" : ""}`}
                            aria-label={subtask.status === "done" ? `Вернуть подзадачу «${subtask.title}»` : `Выполнить подзадачу «${subtask.title}»`}
                            onClick={() => completeTask(subtask)}
                          >
                            {subtask.status === "done" ? "✓" : ""}
                          </button>
                        )}
                        <button className={subtask.status === "done" ? "done" : ""} onClick={() => openDetail(subtask.id)}>
                          {subtask.title}
                        </button>
                        <button className="mini-action" onClick={() => moveSibling(subtask, -1)} title="Выше">↑</button>
                        <button className="mini-action" onClick={() => moveSibling(subtask, 1)} title="Ниже">↓</button>
                      </div>
                    ))}
                </div>

                {childrenOf(tasks, selected.id).some((item) => item.status === "done") && (
                  <button
                    className="text-button"
                    onClick={() => patchTask(selected.id, { showCompletedSubtasks: !selected.showCompletedSubtasks })}
                  >
                    {selected.showCompletedSubtasks ? "Скрыть выполненные" : "Показать выполненные подзадачи"}
                  </button>
                )}

                <form className="subtask-add" onSubmit={(event) => { event.preventDefault(); addSubtask(selected); }}>
                  <span>＋</span>
                  <input
                    value={subtaskTitle}
                    onChange={(event) => setSubtaskTitle(event.target.value)}
                    placeholder="Добавить подзадачу"
                  />
                  <button disabled={!subtaskTitle.trim()}>Добавить</button>
                </form>
              </section>

              <section className="detail-section hierarchy-section">
                <h3>Положение в дереве</h3>
                <div className="hierarchy-actions">
                  <button onClick={() => moveSibling(selected, -1)}>↑ Выше</button>
                  <button onClick={() => moveSibling(selected, 1)}>↓ Ниже</button>
                  <button onClick={() => indentTask(selected)} disabled={childrenOf(tasks, selected.parentId).findIndex((item) => item.id === selected.id) <= 0}>→ Сделать подзадачей</button>
                  <button onClick={() => outdentTask(selected)} disabled={!selected.parentId}>← На уровень выше</button>
                </div>
              </section>

              <section className="detail-section reminders-section">
                <div className="section-heading">
                  <h3>Напоминания</h3>
                  <button className="text-button" onClick={() => addReminder(selected)}>＋ Добавить</button>
                </div>
                {selected.reminders.length === 0 ? (
                  <p className="muted">Напоминаний нет.</p>
                ) : (
                  <div className="reminder-list">
                    {selected.reminders.map((reminder) => (
                      <div key={reminder.id}>
                        <input
                          type="datetime-local"
                          value={dateTimeLocalValue(reminder.at)}
                          onChange={(event) => patchTask(selected.id, {
                            reminders: selected.reminders.map((item) =>
                              item.id === reminder.id ? { ...item, at: dateTimeLocalToIso(event.target.value) } : item
                            )
                          })}
                        />
                        <button
                          aria-label="Удалить напоминание"
                          onClick={() => patchTask(selected.id, {
                            reminders: selected.reminders.filter((item) => item.id !== reminder.id)
                          })}
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="detail-section comments-section">
                <div className="section-heading">
                  <h3>Комментарии</h3>
                  <span>{selected.comments.length}</span>
                </div>
                <div className="comments-list">
                  {selected.comments.map((comment) => (
                    <article key={comment.id}>
                      <p>{comment.body}</p>
                      <time>{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(comment.createdAt))}</time>
                    </article>
                  ))}
                </div>
                <form className="comment-add" onSubmit={(event) => { event.preventDefault(); addComment(selected); }}>
                  <textarea value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder="Добавить комментарий…" rows={2} />
                  <button disabled={!commentBody.trim()}>Отправить</button>
                </form>
              </section>

              <section className="detail-section history">
                <h3>Сведения</h3>
                <div><span>Создано</span><strong>{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(selected.createdAt))}</strong></div>
                <div><span>Изменено</span><strong>{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(selected.updatedAt))}</strong></div>
                <div><span>Уровень</span><strong>{depthOf(tasks, selected)}</strong></div>
              </section>
            </div>
          </>
        )}
      </aside>

      {selected && <button className="detail-backdrop" aria-label="Закрыть детали" onClick={closeDetail} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
