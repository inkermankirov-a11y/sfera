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

const filterLabels: Record<Filter, string> = {
  all: "Все",
  today: "Сегодня",
  inbox: "Без даты",
  done: "Готово"
};

const priorityLabels: Record<Priority, string> = {
  1: "P1",
  2: "P2",
  3: "P3",
  4: "P4"
};

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
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const match = location.hash.match(/^#task=(.+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  });
  const [quickTitle, setQuickTitle] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [mobileQuickOpen, setMobileQuickOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState<"tasks" | "notes" | "photos">("tasks");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

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
      order: nextOrder(tasks, null),
      date: filter === "today" && !parsed.date ? isoToday() : parsed.date,
      time: parsed.time,
      deadline: parsed.deadline,
      recurrence: parsed.recurrence,
      priority: parsed.priority,
      labels: parsed.labels,
      uncompletable: parsed.uncompletable
    });

    setTasks((current) => [...current, task]);
    setQuickTitle("");
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
                {task.priority < 4 && <span className={`priority-text p${task.priority}`}>{priorityLabels[task.priority]}</span>}
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
    <div className={`app-shell ${selected ? "has-detail" : ""}`}>
      <aside className="sidebar" aria-label="Навигация SFERA">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <strong>СФЕРА</strong>
            <span>личное пространство</span>
          </div>
        </div>

        <nav className="side-nav">
          <button><span>◉</span>Сегодня</button>
          <button><span>▦</span>Неделя</button>
          <button className="active"><span>✓</span>Задачи</button>
          <button><span>○</span>Календарь</button>
          <button><span>◇</span>Пространство</button>
        </nav>

        <div className="sidebar-bottom">
          <button className="ghost-button">⚙ Настройки</button>
        </div>
      </aside>

      <main className="tasks-page">
        <header className="mobile-topbar mobile-appbar">
          <div className="mobile-profile-mark">S</div>
          <div className="mobile-app-title">
            <strong>СФЕРА</strong>
            <span>{mobileSection === "tasks" ? "Задачи" : mobileSection === "notes" ? "Заметки" : "Фото"}</span>
          </div>
          <div className="mobile-app-actions">
            {mobileSection === "tasks" && (
              <button className="mobile-icon-action" aria-label="Поиск" onClick={() => setSearchOpen((value) => !value)}>⌕</button>
            )}
            <button className="mobile-icon-action" aria-label="Настройки" onClick={() => setSettingsOpen(true)}>⚙</button>
          </div>
        </header>

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

        <div className="filter-strip" role="tablist" aria-label="Фильтр задач">
          {(Object.keys(filterLabels) as Filter[]).map((value) => (
            <button
              key={value}
              role="tab"
              aria-selected={filter === value}
              className={filter === value ? "active" : ""}
              onClick={() => setFilter(value)}
            >
              {filterLabels[value]}
            </button>
          ))}
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

        </div>

        <section className={`mobile-module-screen ${mobileSection === "notes" ? "active" : ""}`} aria-hidden={mobileSection !== "notes"}>
          <div className="module-intro-card">
            <div className="module-intro-icon">✎</div>
            <h2>Заметки</h2>
            <p>Здесь будут быстрые записи, мысли, списки и связанные с ними материалы.</p>
          </div>
          <div className="module-empty-card">
            <strong>Пока пусто</strong>
            <span>Следующим шагом добавим создание и хранение заметок.</span>
          </div>
        </section>

        <section className={`mobile-module-screen ${mobileSection === "photos" ? "active" : ""}`} aria-hidden={mobileSection !== "photos"}>
          <div className="module-intro-card">
            <div className="module-intro-icon">▧</div>
            <h2>Фото</h2>
            <p>Отдельное место для фотографий и изображений внутри СФЕРЫ.</p>
          </div>
          <div className="photo-placeholder-grid">
            <div /><div /><div /><div /><div /><div />
          </div>
        </section>

        {mobileSection === "tasks" && (
          <button className="fab" aria-label="Добавить задачу" onClick={() => setMobileQuickOpen(true)}>＋</button>
        )}

        <nav className="bottom-nav mobile-tabbar" aria-label="Основная навигация">
          <button className={mobileSection === "tasks" && !settingsOpen ? "active" : ""} onClick={() => { setMobileSection("tasks"); setSettingsOpen(false); }}><span>✓</span>Задачи</button>
          <button className={mobileSection === "notes" && !settingsOpen ? "active" : ""} onClick={() => { setMobileSection("notes"); setSettingsOpen(false); }}><span>✎</span>Заметки</button>
          <button className={mobileSection === "photos" && !settingsOpen ? "active" : ""} onClick={() => { setMobileSection("photos"); setSettingsOpen(false); }}><span>▧</span>Фото</button>
          <button className={settingsOpen ? "active" : ""} onClick={() => setSettingsOpen(true)}><span>☰</span>Настройки</button>
        </nav>

        {mobileQuickOpen && (
          <div className="mobile-quick-backdrop" onClick={() => setMobileQuickOpen(false)}>
            <form className="mobile-quick-sheet" onSubmit={addTask} onClick={(event) => event.stopPropagation()}>
              <div className="mobile-sheet-handle" />
              <div className="mobile-quick-head">
                <strong>Новая задача</strong>
                <button type="button" onClick={() => setMobileQuickOpen(false)}>Отмена</button>
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
                <button type="button" onClick={() => setQuickTitle((value) => value + " p1")}>P1</button>
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
            <button><span className="settings-icon">▦</span><span>Календарь</span><b>›</b></button>
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
                  <select value={selected.priority} onChange={(event) => patchTask(selected.id, { priority: Number(event.target.value) as Priority })}>
                    <option value={1}>P1</option>
                    <option value={2}>P2</option>
                    <option value={3}>P3</option>
                    <option value={4}>P4</option>
                  </select>
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
