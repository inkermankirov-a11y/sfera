import { FormEvent, useEffect, useMemo, useState } from "react";

type Priority = "low" | "medium" | "high";
type TaskStatus = "active" | "done";
type Filter = "all" | "today" | "inbox" | "done";

type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  date: string | null;
  priority: Priority;
  related: string[];
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = "sfera.tasks.v1";

const isoToday = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
};

const seedTasks = (): Task[] => {
  const today = isoToday();
  return [
    {
      id: "task-client",
      title: "Позвонить клиенту",
      description: "Обсудить время следующей встречи и отправить материалы.",
      status: "active",
      date: today,
      priority: "high",
      related: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: "task-dates",
      title: "Согласовать даты поездки",
      description: "",
      status: "active",
      date: today,
      priority: "medium",
      related: ["task-tickets"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: "task-tickets",
      title: "Купить билеты",
      description: "Посмотреть поезд после 18:00.",
      status: "active",
      date: null,
      priority: "medium",
      related: ["task-dates", "task-hotel"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: "task-hotel",
      title: "Забронировать гостиницу",
      description: "",
      status: "active",
      date: null,
      priority: "low",
      related: ["task-tickets"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: "task-course",
      title: "Посмотреть курс",
      description: "",
      status: "done",
      date: null,
      priority: "low",
      related: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];
};

function readTasks(): Task[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedTasks();
    const parsed = JSON.parse(raw) as Task[];
    return Array.isArray(parsed) ? parsed : seedTasks();
  } catch {
    return seedTasks();
  }
}

function formatDate(date: string | null) {
  if (!date) return "Без даты";
  if (date === isoToday()) return "Сегодня";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short"
  }).format(new Date(date + "T12:00:00"));
}

const priorityLabel: Record<Priority, string> = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий"
};

export function App() {
  const [tasks, setTasks] = useState<Task[]>(() => readTasks());
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selected = tasks.find((task) => task.id === selectedId) ?? null;

  const visibleTasks = useMemo(() => {
    const today = isoToday();
    const normalizedQuery = query.trim().toLowerCase();

    return tasks.filter((task) => {
      if (filter === "today" && (task.date !== today || task.status === "done")) return false;
      if (filter === "inbox" && (task.date !== null || task.status === "done")) return false;
      if (filter === "done" && task.status !== "done") return false;
      if (filter === "all" && task.status === "done") return false;
      if (normalizedQuery && !task.title.toLowerCase().includes(normalizedQuery)) return false;
      return true;
    });
  }, [tasks, filter, query]);

  const groups = useMemo(() => {
    if (filter === "done") return [{ title: "Выполненные", tasks: visibleTasks }];
    const today = visibleTasks.filter((task) => task.date === isoToday());
    const later = visibleTasks.filter((task) => task.date && task.date !== isoToday());
    const inbox = visibleTasks.filter((task) => !task.date);
    return [
      { title: "Сегодня", tasks: today },
      { title: "Позже", tasks: later },
      { title: "Без даты", tasks: inbox }
    ].filter((group) => group.tasks.length > 0);
  }, [visibleTasks, filter]);

  function addTask(event?: FormEvent) {
    event?.preventDefault();
    const title = quickTitle.trim();
    if (!title) return;
    const now = new Date().toISOString();
    const task: Task = {
      id: crypto.randomUUID(),
      title,
      description: "",
      status: "active",
      date: filter === "today" ? isoToday() : null,
      priority: "medium",
      related: [],
      createdAt: now,
      updatedAt: now
    };
    setTasks((current) => [task, ...current]);
    setQuickTitle("");
    setToast("Задача добавлена");
  }

  function patchTask(id: string, patch: Partial<Task>) {
    setTasks((current) =>
      current.map((task) =>
        task.id === id
          ? { ...task, ...patch, updatedAt: new Date().toISOString() }
          : task
      )
    );
  }

  function toggleTask(task: Task) {
    patchTask(task.id, { status: task.status === "done" ? "active" : "done" });
    setToast(task.status === "done" ? "Задача возвращена" : "Задача выполнена");
  }

  function deleteTask(id: string) {
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    if (!window.confirm(`Удалить задачу «${task.title}»?`)) return;
    setTasks((current) => current.filter((item) => item.id !== id));
    setSelectedId(null);
    setToast("Задача удалена");
  }

  function openRelated(id: string) {
    if (tasks.some((task) => task.id === id)) setSelectedId(id);
  }

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
        <header className="mobile-topbar">
          <div className="mobile-brand">СФЕРА</div>
          <div className="mobile-title">Задачи</div>
          <button
            className="icon-button"
            aria-label="Поиск"
            onClick={() => setSearchOpen((value) => !value)}
          >
            ⌕
          </button>
        </header>

        <div className="page-header">
          <div>
            <p className="eyebrow">Модуль</p>
            <h1>Задачи</h1>
            <p className="subtitle">
              {tasks.filter((task) => task.status === "active").length} активных
            </p>
          </div>

          <div className="desktop-actions">
            <button
              className="icon-button"
              aria-label="Поиск"
              onClick={() => setSearchOpen((value) => !value)}
            >
              ⌕
            </button>
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
              placeholder="Поиск по задачам"
              aria-label="Поиск по задачам"
            />
            <button className="ghost-button" onClick={() => { setQuery(""); setSearchOpen(false); }}>
              Закрыть
            </button>
          </div>
        )}

        <div className="filter-strip" role="tablist" aria-label="Фильтр задач">
          {([
            ["all", "Все"],
            ["today", "Сегодня"],
            ["inbox", "Без даты"],
            ["done", "Готово"]
          ] as [Filter, string][]).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={filter === value}
              className={filter === value ? "active" : ""}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <form className="quick-add" onSubmit={addTask}>
          <span className="quick-plus">＋</span>
          <input
            id="quick-add"
            value={quickTitle}
            onChange={(event) => setQuickTitle(event.target.value)}
            placeholder="Быстро добавить задачу…"
            aria-label="Новая задача"
          />
          <button type="submit" disabled={!quickTitle.trim()}>
            Enter
          </button>
        </form>

        <section className="task-list" aria-live="polite">
          {groups.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">✓</div>
              <h2>{query ? "Ничего не найдено" : "Здесь пока нет задач"}</h2>
              <p>
                {query
                  ? "Измени запрос или сбрось фильтр."
                  : "Добавь первое дело, которое не хочется держать в голове."}
              </p>
              {query && (
                <button className="secondary-button" onClick={() => setQuery("")}>
                  Сбросить поиск
                </button>
              )}
            </div>
          ) : (
            groups.map((group) => (
              <div className="task-group" key={group.title}>
                <div className="group-title">
                  <h2>{group.title}</h2>
                  <span>{group.tasks.length}</span>
                </div>

                <div className="task-rows">
                  {group.tasks.map((task) => (
                    <article
                      className={`task-row ${selectedId === task.id ? "selected" : ""}`}
                      key={task.id}
                    >
                      <button
                        className={`check-button ${task.status === "done" ? "checked" : ""}`}
                        aria-label={task.status === "done" ? "Вернуть задачу" : "Выполнить задачу"}
                        onClick={() => toggleTask(task)}
                      >
                        {task.status === "done" ? "✓" : ""}
                      </button>

                      <button className="task-main" onClick={() => setSelectedId(task.id)}>
                        <span className={`task-title ${task.status === "done" ? "done" : ""}`}>
                          {task.title}
                        </span>
                        <span className="task-meta">
                          <span>{formatDate(task.date)}</span>
                          {task.priority === "high" && <span className="priority high">Высокий</span>}
                          {task.related.length > 0 && <span>⌁ {task.related.length}</span>}
                        </span>
                      </button>

                      <button className="row-more" aria-label="Открыть задачу" onClick={() => setSelectedId(task.id)}>
                        ›
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>

        <button
          className="fab"
          aria-label="Добавить задачу"
          onClick={() => document.getElementById("quick-add")?.focus()}
        >
          ＋
        </button>

        <nav className="bottom-nav" aria-label="Основная навигация">
          <button><span>◉</span>Сегодня</button>
          <button><span>▦</span>Неделя</button>
          <button className="active"><span>✓</span>Задачи</button>
          <button><span>◇</span>Пространство</button>
        </nav>
      </main>

      <aside className={`detail-pane ${selected ? "open" : ""}`} aria-hidden={!selected}>
        {selected && (
          <>
            <header className="detail-header">
              <button className="back-button" onClick={() => setSelectedId(null)} aria-label="Назад к задачам">
                ←
              </button>
              <span>Задача</span>
              <button className="icon-button" onClick={() => deleteTask(selected.id)} aria-label="Удалить задачу">
                ⋯
              </button>
            </header>

            <div className="detail-content">
              <label className="sr-only" htmlFor="task-title">Название задачи</label>
              <textarea
                id="task-title"
                className="detail-title"
                value={selected.title}
                onChange={(event) => patchTask(selected.id, { title: event.target.value })}
                rows={2}
              />

              <button
                className={`status-card ${selected.status === "done" ? "done" : ""}`}
                onClick={() => toggleTask(selected)}
              >
                <span>{selected.status === "done" ? "✓" : "○"}</span>
                <div>
                  <small>Статус</small>
                  <strong>{selected.status === "done" ? "Выполнено" : "В работе"}</strong>
                </div>
              </button>

              <div className="field-grid">
                <label className="field-card">
                  <span>Дата</span>
                  <input
                    type="date"
                    value={selected.date ?? ""}
                    onChange={(event) => patchTask(selected.id, { date: event.target.value || null })}
                  />
                </label>

                <label className="field-card">
                  <span>Приоритет</span>
                  <select
                    value={selected.priority}
                    onChange={(event) => patchTask(selected.id, { priority: event.target.value as Priority })}
                  >
                    <option value="low">Низкий</option>
                    <option value="medium">Средний</option>
                    <option value="high">Высокий</option>
                  </select>
                </label>
              </div>

              <section className="detail-section">
                <div className="section-heading">
                  <h3>Связи</h3>
                  <span>{selected.related.length}</span>
                </div>

                {selected.related.length === 0 ? (
                  <p className="muted">Связанных задач пока нет.</p>
                ) : (
                  <div className="relations">
                    {selected.related.map((relatedId) => {
                      const related = tasks.find((task) => task.id === relatedId);
                      if (!related) return null;
                      return (
                        <button key={relatedId} onClick={() => openRelated(relatedId)}>
                          <span>⌁</span>
                          <strong>{related.title}</strong>
                          <span>›</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="detail-section">
                <h3>Описание</h3>
                <textarea
                  className="description-input"
                  value={selected.description}
                  onChange={(event) => patchTask(selected.id, { description: event.target.value })}
                  placeholder="Добавить детали…"
                  rows={6}
                />
              </section>

              <section className="detail-section history">
                <h3>История</h3>
                <div>
                  <span>Создано</span>
                  <strong>{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(selected.createdAt))}</strong>
                </div>
                <div>
                  <span>Изменено</span>
                  <strong>{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(selected.updatedAt))}</strong>
                </div>
              </section>

              <button className="delete-button" onClick={() => deleteTask(selected.id)}>
                Удалить задачу
              </button>
            </div>
          </>
        )}
      </aside>

      {selected && <button className="detail-backdrop" aria-label="Закрыть детали" onClick={() => setSelectedId(null)} />}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
