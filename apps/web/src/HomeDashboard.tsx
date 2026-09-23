import { AppIcon } from "./ui/AppIcon";
import { Task, formatDate, isoToday } from "./tasks-model";
import { ProjectNode } from "./projects-model";

export type HomeSphereSummary = {
  sphere: ProjectNode;
  activeCount: number;
  nextTask: Task | null;
};

type HomeDashboardProps = {
  active: boolean;
  dayPart: string;
  dashboardDate: string;
  moonPhase: { icon: string; name: string };
  profileName: string;
  dailyFocus: string;
  todayTaskCount: number;
  completedTodayCount: number;
  todayProgress: number;
  todayTasks: Task[];
  upcomingTask: Task | null;
  overdueCount: number;
  sphereSummaries: HomeSphereSummary[];
  isStandalone: boolean;
  projectLabelForTask: (task: Task) => string | null;
  onDailyFocusChange: (value: string) => void;
  onOpenMoon: () => void;
  onNewTask: () => void;
  onNewNote: () => void;
  onCompleteTask: (task: Task) => void;
  onOpenTask: (taskId: string) => void;
  onOpenTodayTasks: () => void;
  onOpenOverdue: () => void;
  onOpenSphere: (sphereId: string) => void;
  onCreateSphere: () => void;
  onInstallApp: () => void;
};

function plural(value: number, one: string, few: string, many: string) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function HomeDashboard({
  active,
  dayPart,
  dashboardDate,
  moonPhase,
  profileName,
  dailyFocus,
  todayTaskCount,
  completedTodayCount,
  todayProgress,
  todayTasks,
  upcomingTask,
  overdueCount,
  sphereSummaries,
  isStandalone,
  projectLabelForTask,
  onDailyFocusChange,
  onOpenMoon,
  onNewTask,
  onNewNote,
  onCompleteTask,
  onOpenTask,
  onOpenTodayTasks,
  onOpenOverdue,
  onOpenSphere,
  onCreateSphere,
  onInstallApp
}: HomeDashboardProps) {
  const greeting = dayPart === "morning"
    ? "Доброе утро"
    : dayPart === "day"
      ? "Добрый день"
      : "Добрый вечер";

  return (
    <section className={`home-dashboard ${active ? "active" : ""}`} aria-hidden={!active}>
      <header className={`dashboard-hero dashboard-hero-${dayPart}`}>
        <div className="dashboard-hero-copy">
          <div className="dashboard-wordmark">СФЕРА</div>
          <p className="dashboard-date">
            <span>{dashboardDate}</span>
            <button
              type="button"
              className="dashboard-moon-phase"
              aria-label={`Открыть лунный календарь. Сейчас: ${moonPhase.name}`}
              onClick={onOpenMoon}
            >
              <span aria-hidden="true">· {moonPhase.icon}</span> {moonPhase.name}
            </button>
          </p>
          <h1>{greeting}, {profileName}</h1>
        </div>

        <div className="dashboard-hero-actions">
          <button className="dashboard-primary-action" onClick={onNewTask}>
            <AppIcon name="plus" /> Новая задача
          </button>
          <button className="dashboard-secondary-action" onClick={onNewNote}>
            <AppIcon name="note" /> Заметка
          </button>
        </div>
      </header>

      <div className="dashboard-focus dashboard-focus-primary">
        <label htmlFor="daily-focus">
          <span><AppIcon name="target" /></span>
          <strong>Фокус дня</strong>
        </label>
        <input
          id="daily-focus"
          value={dailyFocus}
          onChange={(event) => onDailyFocusChange(event.target.value)}
          placeholder="Главный результат дня"
          maxLength={120}
        />
        <small>{dailyFocus.trim() ? "Сохранено" : "Один главный результат"}</small>
      </div>

      <div className="dashboard-priority-layout">
        <section className="dashboard-card dashboard-today">
          <div className="dashboard-card-head">
            <div>
              <h2>Сегодня</h2>
              <span className="dashboard-progress-copy">
                {todayTaskCount ? `${completedTodayCount} из ${todayTaskCount} выполнено` : "Задач на сегодня нет"}
              </span>
            </div>
            <button className="dashboard-count-link" onClick={onOpenTodayTasks}>
              Все задачи ›
            </button>
          </div>

          {todayTaskCount > 0 && (
            <div className="dashboard-progress" aria-label={`Выполнено ${todayProgress}% задач на сегодня`}>
              <span style={{ width: `${todayProgress}%` }} />
            </div>
          )}

          <div className="dashboard-task-list">
            {todayTasks.length === 0 ? (
              <div className="dashboard-empty dashboard-empty-quiet">
                <span><AppIcon name="check" /></span>
                <div>
                  <strong>{todayTaskCount ? "На сегодня всё выполнено" : "Сегодня свободно"}</strong>
                  <small>Здесь будут только задачи на сегодня.</small>
                </div>
              </div>
            ) : (
              todayTasks.map((task) => (
                <div className={`dashboard-task-row ${task.id === upcomingTask?.id ? "is-next" : ""}`} key={task.id}>
                  {task.uncompletable ? (
                    <span className="dashboard-task-dot" aria-hidden="true" />
                  ) : (
                    <button
                      className={`check-button priority-ring p${task.priority}`}
                      onClick={() => onCompleteTask(task)}
                      aria-label={`Выполнить задачу «${task.title}»`}
                    />
                  )}
                  <span className="dashboard-task-time">{task.time || "—"}</span>
                  <button className="dashboard-task-main" onClick={() => onOpenTask(task.id)}>
                    <strong>{task.title}</strong>
                    {task.id === upcomingTask?.id && <small>Следующая</small>}
                  </button>
                  {projectLabelForTask(task) && (
                    <span className="dashboard-project-pill">{projectLabelForTask(task)}</span>
                  )}
                  <button className="dashboard-row-arrow" aria-label={`Открыть задачу «${task.title}»`} onClick={() => onOpenTask(task.id)}>
                    <AppIcon name="chevron" size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <aside className="dashboard-brief" aria-label="Краткая сводка">
          <button className={`dashboard-brief-row ${overdueCount ? "has-alert" : ""}`} onClick={onOpenOverdue}>
            <span className="dashboard-brief-icon"><AppIcon name="alert" /></span>
            <span>
              <small>Просрочено</small>
              <strong>{overdueCount ? `${overdueCount} ${plural(overdueCount, "задача", "задачи", "задач")}` : "Нет"}</strong>
            </span>
            <AppIcon name="chevron" size={16} />
          </button>

          <button className="dashboard-brief-row" onClick={() => upcomingTask ? onOpenTask(upcomingTask.id) : onNewTask()}>
            <span className="dashboard-brief-icon"><AppIcon name="clock" /></span>
            <span>
              <small>Следующая</small>
              <strong>{upcomingTask?.title ?? "План свободен"}</strong>
              {upcomingTask?.date && (
                <em>
                  {upcomingTask.date === isoToday() ? "Сегодня" : formatDate(upcomingTask.date)}
                  {upcomingTask.time ? `, ${upcomingTask.time}` : ""}
                </em>
              )}
            </span>
            <AppIcon name="chevron" size={16} />
          </button>
        </aside>
      </div>

      <section className="dashboard-section dashboard-spheres-section">
        <div className="dashboard-section-head">
          <div>
            <h2>Сферы</h2>
          </div>
        </div>

        <div className="sphere-card-grid sphere-card-grid-clean">
          {sphereSummaries.map((summary, index) => (
            <button
              className={`sphere-card sphere-card-clean sphere-tone-${index % 6}`}
              key={summary.sphere.id}
              onClick={() => onOpenSphere(summary.sphere.id)}
            >
              <span className="sphere-symbol"><AppIcon name="orbit" size={19} /></span>
              <span className="sphere-info">
                <strong>{summary.sphere.title}</strong>
                <span className="sphere-card-meta">
                  {summary.activeCount
                    ? `${summary.activeCount} ${plural(summary.activeCount, "активная задача", "активные задачи", "активных задач")}`
                    : "Нет активных задач"}
                </span>
                {summary.nextTask && (
                  <small className="sphere-next-task">
                    {summary.nextTask.date
                      ? `${summary.nextTask.date === isoToday() ? "Сегодня" : formatDate(summary.nextTask.date)}${summary.nextTask.time ? `, ${summary.nextTask.time}` : ""} · `
                      : ""}
                    {summary.nextTask.title}
                  </small>
                )}
              </span>
              <AppIcon name="chevron" size={17} />
            </button>
          ))}

          <button className="sphere-card sphere-card-clean sphere-create" onClick={onCreateSphere}>
            <span className="sphere-symbol"><AppIcon name="plus" size={19} /></span>
            <span className="sphere-info">
              <strong>Новая сфера</strong>
              <span className="sphere-card-meta">Добавить область жизни</span>
            </span>
            <AppIcon name="chevron" size={17} />
          </button>
        </div>
      </section>

      {!isStandalone && (
        <button className="install-app-link install-app-link-quiet" onClick={onInstallApp}>
          <span><AppIcon name="plus" /></span>
          <span><strong>Установить СФЕРУ</strong><small>Открывать как отдельное приложение</small></span>
          <AppIcon name="chevron" size={17} />
        </button>
      )}
    </section>
  );
}
