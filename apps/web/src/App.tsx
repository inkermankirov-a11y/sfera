import { FormEvent, useEffect, useMemo, useState } from "react";
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
import {
  addDaysIso,
  calendarRangeLabel,
  inclusiveDayCount,
  isoDate,
  isoRange,
  monthCells
} from "./calendar/calendar-utils";

const filterLabels: Record<Filter, string> = {
  all: "Все",
  today: "Сегодня",
  inbox: "Без даты",
  overdue: "Просрочено",
  done: "Выполнено"
};

type Section = "home" | "projects" | "tasks" | "notes" | "photos" | "calendar";
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
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер";
  const weekDates = useMemo(() => currentWeekDates(), []);
  const weekTaskCount = useMemo(
    () => tasks.filter((task) => task.status === "active" && task.date && weekDates.some((day) => day.iso === task.date)).length,
    [tasks, weekDates]
  );
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

  function entityTypeLabel(type: EntityType) {
    return type === "project" ? "Проект" : type === "task" ? "Задача" : "Заметка";
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
            <option value="project">Проект / сфера</option>
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
              <small>{projectTaskCount(project.id)} задач · {children.length} подпроектов</small>
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
            <button className="project-open" onClick={() => setSelectedProjectId(project.id)}>›</button>
          </div>
          {!project.collapsed && children.length > 0 && (
            <div className="project-subtree">{renderProjectTree(project.id, depth + 1)}</div>
          )}
        </div>
      );
    });
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
      date: filter === "today" && !parsed.date ? isoToday() : parsed.date,
      time: parsed.time,
      deadline: parsed.deadline,
      recurrence: parsed.recurrence,
      priority: quickPriority < 4 ? quickPriority : parsed.priority,
      labels: parsed.labels,
      uncompletable: parsed.uncompletable
    });

    setTasks((current) => [...current, task]);
    setQuickTitle("");
    setQuickPriority(4);
    setQuickProjectId(null);
    setMobileQuickOpen(false);
    setToast("Задача добавлена");
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
                aria-label={task.status === "done" ? "Вернуть задачу" : "Выполнить задачу"}
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

            <button className="row-more" aria-label="Открыть задачу" onClick={() => openDetail(task.id)}>›</button>
          </article>

          {showNested && directChildren.length > 0 && (
            <div className="subtree">{renderTree(task.id, depth + 1)}</div>
          )}
        </div>
      );
    });
  }

  const visibleCount = topLevelForView.length;

  return (
    <div className={`app-shell section-${mobileSection} ${selected ? "has-detail" : ""}`}>
      <aside className="sidebar" aria-label="Навигация SFERA">
        <button className="brand brand-button" onClick={() => setMobileSection("home")} aria-label="Главная SFERA">
          <div className="brand-mark">S</div>
          <div>
            <strong>SFERA</strong>
            <span>Гармония в каждом дне</span>
          </div>
        </button>

        <nav className="side-nav">
          <button className={mobileSection === "home" ? "active" : ""} onClick={() => setMobileSection("home")}><span>⌂</span>Главная</button>
          <button className={mobileSection === "projects" ? "active" : ""} onClick={() => setMobileSection("projects")}><span>◇</span>Проекты</button>
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
        </nav>

        <div className="sidebar-bottom">
          <button className="ghost-button" onClick={() => setSettingsOpen(true)}>⚙ Настройки</button>
        </div>
      </aside>

      <main className={`tasks-page section-${mobileSection}`}>
        <header className="desktop-topbar">
          <button className="desktop-search" onClick={() => { setMobileSection("tasks"); setSearchOpen(true); }}>
            <span>⌕</span>
            <span>Поиск по задачам, проектам, заметкам...</span>
          </button>
          <div className="desktop-user">
            <button className="desktop-bell" aria-label="Уведомления">♢</button>
            <span className="desktop-avatar">Л</span>
            <strong>Лаура</strong>
            <span>⌄</span>
          </div>
        </header>

        <header className="mobile-topbar mobile-appbar">
          <button className="mobile-profile-mark mobile-home-mark" onClick={() => setMobileSection("home")} aria-label="На главную">S</button>
          <div className="mobile-app-title">
            <strong>СФЕРА</strong>
            <span>{mobileSection === "home" ? "Сегодня" : mobileSection === "projects" ? "Проекты" : mobileSection === "tasks" ? "Задачи" : mobileSection === "notes" ? "Заметки" : mobileSection === "photos" ? "Фото" : "Календарь"}</span>
          </div>
          <div className="mobile-app-actions">
            {mobileSection === "tasks" && (
              <button className="mobile-icon-action" aria-label="Поиск" onClick={() => setSearchOpen((value) => !value)}>⌕</button>
            )}
            <button className="mobile-icon-action" aria-label="Настройки" onClick={() => setSettingsOpen(true)}>⚙</button>
          </div>
        </header>

        <section className={`home-dashboard ${mobileSection === "home" ? "active" : ""}`} aria-hidden={mobileSection !== "home"}>
          <header className="dashboard-hero">
            <div className="dashboard-hero-copy">
              <div className="dashboard-wordmark">SFERA</div>
              <p className="dashboard-date">{dashboardDate}</p>
              <h1>{greeting}, Лаура!</h1>
              <p className="dashboard-lead">Большие перемены начинаются<br />с маленьких шагов ✨</p>
            </div>
            <div className="dashboard-hero-motto">Гармония<br />в каждом дне<span /></div>
          </header>

          <div className="dashboard-layout">
            <section className="dashboard-card dashboard-today">
              <div className="dashboard-card-head">
                <h2>Сегодня</h2>
                <button onClick={() => { chooseTaskView("today"); setMobileSection("tasks"); }}>
                  {todayTasks.length} {todayTasks.length === 1 ? "задача" : todayTasks.length < 5 ? "задачи" : "задач"} ›
                </button>
              </div>

              <div className="dashboard-task-list">
                {todayTasks.length === 0 ? (
                  <div className="dashboard-empty">
                    <span>✓</span>
                    <div>
                      <strong>На сегодня всё свободно</strong>
                      <small>Добавь задачу или выбери один из проектов.</small>
                    </div>
                  </div>
                ) : (
                  todayTasks.slice(0, 4).map((task) => (
                    <div className="dashboard-task-row" key={task.id}>
                      {task.uncompletable ? (
                        <span className="dashboard-task-dot">◆</span>
                      ) : (
                        <button
                          className={`check-button priority-ring p${task.priority}`}
                          onClick={() => completeTask(task)}
                          aria-label="Выполнить задачу"
                        />
                      )}
                      <span className="dashboard-task-time">{task.time || "—"}</span>
                      <button className="dashboard-task-main" onClick={() => openDetail(task.id)}>
                        <strong>{task.title}</strong>
                      </button>
                      {task.projectId && (
                        <span className="dashboard-project-pill">
                          {projectPath(projects, task.projectId).split(" / ").at(-1)}
                        </span>
                      )}
                      <button className="dashboard-row-arrow" onClick={() => openDetail(task.id)}>›</button>
                    </div>
                  ))
                )}
              </div>
            </section>

            <aside className="dashboard-side dashboard-stat-tiles">
              <button className="stat-tile stat-overdue" onClick={() => { chooseTaskView("overdue"); setMobileSection("tasks"); }}>
                <span className="stat-icon">!</span><b>›</b>
                <strong>{overdueTasks.length}</strong>
                <small>Просрочено</small>
              </button>
              <button className="stat-tile stat-projects" onClick={() => { setSelectedProjectId(null); setMobileSection("projects"); }}>
                <span className="stat-icon">▰</span><b>›</b>
                <strong>{rootSpheres.length}</strong>
                <small>Проекты</small>
              </button>
              <button className="stat-tile stat-notes" onClick={() => setMobileSection("notes")}>
                <span className="stat-icon">▤</span><b>›</b>
                <strong>{notes.length}</strong>
                <small>Заметки</small>
              </button>
              <button className="stat-tile stat-photos" onClick={() => setMobileSection("photos")}>
                <span className="stat-icon">▧</span><b>›</b>
                <strong>0</strong>
                <small>Фото</small>
              </button>
            </aside>
          </div>

          <section className="dashboard-section">
            <div className="dashboard-section-head">
              <div>
                <h2>Мои сферы жизни</h2>
              </div>
              <button onClick={() => { setSelectedProjectId(null); setMobileSection("projects"); }}>Все проекты ›</button>
            </div>

            <div className="sphere-card-grid">
              {rootSpheres.slice(0, 6).map((sphere, index) => (
                <button
                  className={`sphere-card sphere-tone-${index % 6}`}
                  key={sphere.id}
                  onClick={() => { setSelectedProjectId(sphere.id); setMobileSection("projects"); }}
                >
                  <span className="sphere-symbol">{["⌂","☾","✦","▣","✈","♡"][index % 6]}</span>
                  <span className="sphere-info">
                    <strong>{sphere.title}</strong>
                    <small>{projectTaskCount(sphere.id)} задач · 0 заметок</small>
                  </span>
                  <b>›</b>
                </button>
              ))}
              <button className="sphere-card sphere-create" onClick={() => { setProjectParentId(""); setProjectCreateOpen(true); }}>
                <span className="sphere-symbol">＋</span>
                <span className="sphere-info">
                  <strong>Новая сфера</strong>
                  <small>Добавить область жизни</small>
                </span>
              </button>
            </div>
          </section>

          <div className="home-function-strip">
            <button onClick={() => { chooseTaskView("week"); setMobileSection("tasks"); }}>
              <span>▦</span><strong>Неделя</strong><small>{weekTaskCount} задач</small>
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

        <form className="quick-add advanced" onSubmit={addTask}>
          <span className="quick-plus">＋</span>
          <input
            id="quick-add"
            value={quickTitle}
            onChange={(event) => setQuickTitle(event.target.value)}
            placeholder="Задача · попробуй: Купить корм завтра 18:00 p1 %дом"
            aria-label="Новая задача"
          />
          <span className="quick-hint">Q</span>
          <button type="submit" disabled={!quickTitle.trim()}>Добавить</button>
        </form>

        <div className="quick-guide">
          <span><b>p1–p4</b> приоритет</span>
          <span><b>%метка</b> метка</span>
          <span><b>сегодня / завтра</b> дата</span>
          <span><b>* Заголовок</b> незавершаемая</span>
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
                  <h2>Проекты</h2>
                </div>
                <div className="projects-header-actions">
                  <div className="project-view-toggle" role="group" aria-label="Вид проектов">
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
                  <span>{projectPath(projects, selectedProject.parentId) || "Проекты"}</span>
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
                <div><strong>{projectChildren(projects, selectedProject.id).length}</strong><span>подпроектов</span></div>
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
                          <button className={projectView === "grid" ? "active" : ""} onClick={() => setProjectViewMode("grid")}>▦</button>
                          <button className={projectView === "list" ? "active" : ""} onClick={() => setProjectViewMode("list")}>☷</button>
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
            <button onClick={() => { setNoteKind("note"); setNoteProjectId(null); setNoteCreateOpen(true); }}>＋</button>
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
                  <button className={note.favorite ? "favorite active" : "favorite"} onClick={(event) => { event.stopPropagation(); setNotes((current) => current.map((item) => item.id === note.id ? { ...item, favorite: !item.favorite, updatedAt: nowIso() } : item)); }}>☆</button>
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
            <button onClick={() => setToast("Загрузка фото — следующий функциональный шаг")}>＋</button>
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
              <p>Фото будет храниться один раз и показываться здесь, внутри проекта и внутри сферы жизни.</p>
            </div>
          </div>
          <div className="photo-placeholder-grid photo-structure-grid">
            {["Последние", "Семья", "Таро", "Путешествия", "Альбомы", "Без проекта"].map((label) => (
              <button key={label}><span>▧</span><strong>{label}</strong><small>0 фото</small></button>
            ))}
          </div>
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
                <button onClick={() => setMonthOffset(-1)}>←</button>
                <h3>{calendarTitle}</h3>
                <button onClick={() => setMonthOffset(1)}>→</button>
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
              <div className="calendar-list-title"><strong>Сегодня</strong><span>{todayTasks.length} задач</span></div>
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
              <div className="calendar-list-title"><strong>История SFERA</strong><span>последние изменения</span></div>
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

        <button className="fab" aria-label="Быстрое добавление" onClick={() => setQuickMenuOpen(true)}>＋</button>

        <nav className="bottom-nav mobile-tabbar" aria-label="Основная навигация">
          <button className={mobileSection === "projects" && !settingsOpen ? "active" : ""} onClick={() => { setMobileSection("projects"); setSettingsOpen(false); }}><span>◇</span>Проекты</button>
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
              {noteProjectId && <div className="note-project-hint">◇ {projectPath(projects, noteProjectId)}</div>}
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
              <label className="project-parent-select">
                <span>Расположение</span>
                <select value={projectParentId} onChange={(event) => setProjectParentId(event.target.value)}>
                  <option value="">Корень · новая сфера жизни</option>
                  {flattenedProjects.map(({ project, depth, path }) => (
                    <option key={project.id} value={project.id}>{"— ".repeat(depth)}{path}</option>
                  ))}
                </select>
              </label>
              <button className="mobile-add-submit" disabled={!projectTitle.trim()}>
                {projectParentId ? "Создать проект" : "Создать сферу"}
              </button>
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
                <button type="button" onClick={() => { setMobileQuickOpen(false); setQuickProjectId(null); setQuickPriority(4); }}>Отмена</button>
              </div>
              <textarea
                autoFocus
                value={quickTitle}
                onChange={(event) => setQuickTitle(event.target.value)}
                placeholder="Что нужно сделать?"
                rows={3}
              />
              <div className="mobile-quick-tools">
                <button type="button" onClick={() => setQuickTitle((value) => value + " сегодня")}>Сегодня</button>
                <button type="button" onClick={() => setQuickTitle((value) => value + " завтра")}>Завтра</button>
                <div className="quick-priority-picker" role="group" aria-label="Приоритет">
                  {([1, 2, 3, 4] as Priority[]).map((priority) => (
                    <button
                      type="button"
                      key={priority}
                      className={`quick-priority-choice p${priority} ${quickPriority === priority ? "active" : ""}`}
                      onClick={() => setQuickPriority(priority)}
                      title={priorityLabels[priority]}
                      aria-label={`Приоритет: ${priorityLabels[priority]}`}
                      aria-pressed={quickPriority === priority}
                    >⚑</button>
                  ))}
                </div>
              </div>
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
                <label>
                  <span>Проект</span>
                  <select
                    value={selected.projectId ?? ""}
                    onChange={(event) => setTaskProject(selected, event.target.value || null)}
                  >
                    <option value="">Без проекта</option>
                    {flattenedProjects.map(({ project, depth, path }) => (
                      <option key={project.id} value={project.id}>
                        {depth === 0 ? "● " : "○ "}{path}
                      </option>
                    ))}
                  </select>
                </label>
                {selected.projectId && (
                  <button className="open-project-button" onClick={() => { setSelectedProjectId(selected.projectId); setMobileSection("projects"); closeDetail(); }}>
                    ◇ {projectPath(projects, selected.projectId)}
                  </button>
                )}
              </section>

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
