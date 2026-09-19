import { Task } from "../tasks-model";
import { ProjectNode, projectPath } from "../projects-model";
import { isoDate } from "./calendar-utils";
import "./calendar.css";

type DesktopCalendarProps = {
  tasks: Task[];
  projects: ProjectNode[];
  dates: string[];
  title: string;
  dayCount: number;
  timezoneLabel: string;
  todayIso: string;
  onOpenTask: (taskId: string) => void;
  onCreateTask: (date: string, time: string | null, position: { x: number; y: number }) => void;
  onToday: () => void;
  onMovePeriod: (direction: -1 | 1) => void;
  onSetPeriod: (start: string, days: number) => void;
};

const HOUR_HEIGHT = 56;
const TOP_OFFSET = 0;
const DAY_MIN_WIDTH_COMPACT = 72;
const DAY_MIN_WIDTH_NORMAL = 118;
const TIME_AXIS_WIDTH = 82;

export function DesktopCalendar({
  tasks,
  projects,
  dates,
  title,
  dayCount,
  timezoneLabel,
  todayIso,
  onOpenTask,
  onCreateTask,
  onToday,
  onMovePeriod,
  onSetPeriod
}: DesktopCalendarProps) {
  const dayMinWidth = dayCount > 7 ? DAY_MIN_WIDTH_COMPACT : DAY_MIN_WIDTH_NORMAL;
  const minGridWidth = dayCount > 7 ? TIME_AXIS_WIDTH + dayCount * dayMinWidth : 760;
  const gridTemplateColumns = `${TIME_AXIS_WIDTH}px repeat(${dayCount}, minmax(${dayMinWidth}px, 1fr))`;

  return (
    <div className="desktop-calendar-view">
      <header className="desktop-calendar-toolbar">
        <div className="desktop-calendar-nav">
          <button className="calendar-today-button" onClick={onToday}>Сегодня</button>
          <button className="calendar-arrow-button" onClick={() => onMovePeriod(-1)} aria-label="Предыдущий период">‹</button>
          <button className="calendar-arrow-button" onClick={() => onMovePeriod(1)} aria-label="Следующий период">›</button>
          <div className="desktop-calendar-title">
            <h2>{title}</h2>
            <span>{dayCount === 1 ? "День" : dayCount + " дней"}</span>
          </div>
        </div>

        <div className="desktop-period-buttons" aria-label="Быстрый выбор периода">
          {[1, 7, 14].map((days) => (
            <button key={days} className={dayCount === days ? "active" : ""} onClick={() => onSetPeriod(dates[0], days)}>
              {days === 1 ? "1 день" : days + " дней"}
            </button>
          ))}
        </div>
      </header>

      <section className="desktop-calendar-surface">
        <div className="desktop-calendar-hscroll" style={{ minWidth: minGridWidth }}>
          <div className="desktop-calendar-days-head" style={{ gridTemplateColumns }}>
            <div className="calendar-timezone">{timezoneLabel}</div>
            {dates.map((iso) => {
              const date = isoDate(iso);
              const weekday = new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(date).replace(".", "");
              return (
                <button
                  className={`desktop-day-head ${iso === todayIso ? "today" : ""}`}
                  key={iso}
                  onClick={() => onSetPeriod(iso, 1)}
                >
                  <span>{weekday}</span>
                  <strong>{date.getDate()}</strong>
                </button>
              );
            })}
          </div>

          <div className="desktop-calendar-all-day" style={{ gridTemplateColumns }}>
            <div className="all-day-label">весь день</div>
            {dates.map((iso) => {
              const allDayTasks = tasks.filter((task) => task.status === "active" && task.date === iso && !task.time);
              return (
                <div className="all-day-cell" key={iso} onClick={(event) => onCreateTask(iso, null, { x: event.clientX, y: event.clientY })} title="Добавить задачу на весь день">
                  {allDayTasks.slice(0, 3).map((task) => (
                    <button className={`calendar-all-day-task p${task.priority}`} key={task.id} onClick={(event) => { event.stopPropagation(); onOpenTask(task.id); }}>
                      {task.title}
                    </button>
                  ))}
                  {allDayTasks.length > 3 && <span className="calendar-more">+{allDayTasks.length - 3}</span>}
                </div>
              );
            })}
          </div>

          <div className="desktop-calendar-time-scroll">
            <div className="desktop-calendar-time-grid" style={{ gridTemplateColumns }}>
              <div className="desktop-time-axis">
                {Array.from({ length: 24 }, (_, hour) => (
                  <span key={hour} style={{ top: TOP_OFFSET + hour * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}>
                    {String(hour).padStart(2, "0")}:00
                  </span>
                ))}
              </div>

              {dates.map((iso) => {
                const dayStart = isoDate(iso);
                dayStart.setHours(0, 0, 0, 0);
                const dayEnd = new Date(dayStart);
                dayEnd.setDate(dayEnd.getDate() + 1);

                const timedTasks = tasks
                  .filter((task) => {
                    if (task.status !== "active" || !task.date || !task.time) return false;
                    const [hours, minutes] = task.time.split(":").map(Number);
                    const taskStart = isoDate(task.date);
                    taskStart.setHours(hours, minutes, 0, 0);
                    const taskEnd = new Date(taskStart.getTime() + (task.durationMinutes ?? 45) * 60_000);
                    return taskStart < dayEnd && taskEnd > dayStart;
                  })
                  .sort((a, b) => {
                    const aStart = a.date === iso ? (a.time ?? "") : "00:00";
                    const bStart = b.date === iso ? (b.time ?? "") : "00:00";
                    return aStart.localeCompare(bStart);
                  });

                return (
                  <div
                    className={`desktop-time-day ${iso === todayIso ? "today" : ""}`}
                    key={iso}
                    title="Нажми на свободное время, чтобы добавить задачу"
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      const y = event.clientY - rect.top - TOP_OFFSET;
                      const rawMinutes = Math.max(0, Math.min(24 * 60 - 15, y / HOUR_HEIGHT * 60));
                      const snappedMinutes = Math.max(0, Math.min(24 * 60 - 15, Math.round(rawMinutes / 15) * 15));
                      const hours = Math.floor(snappedMinutes / 60);
                      const minutes = snappedMinutes % 60;
                      const time = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
                      onCreateTask(iso, time, { x: event.clientX, y: event.clientY });
                    }}
                  >
                    {timedTasks.map((task) => {
                      const [hours, minutes] = (task.time ?? "00:00").split(":").map(Number);
                      const taskStart = isoDate(task.date!);
                      taskStart.setHours(hours, minutes, 0, 0);
                      const taskEnd = new Date(taskStart.getTime() + (task.durationMinutes ?? 45) * 60_000);

                      const segmentStart = taskStart > dayStart ? taskStart : dayStart;
                      const segmentEnd = taskEnd < dayEnd ? taskEnd : dayEnd;
                      const startMinutes = Math.max(0, (segmentStart.getTime() - dayStart.getTime()) / 60_000);
                      const segmentMinutes = Math.max(1, (segmentEnd.getTime() - segmentStart.getTime()) / 60_000);
                      const top = TOP_OFFSET + startMinutes * (HOUR_HEIGHT / 60);
                      const height = Math.max(22, segmentMinutes * (HOUR_HEIGHT / 60));
                      const continuesFromPreviousDay = taskStart < dayStart;
                      const continuesToNextDay = taskEnd > dayEnd;
                      const endLabel = `${String(taskEnd.getHours()).padStart(2, "0")}:${String(taskEnd.getMinutes()).padStart(2, "0")}`;

                      return (
                        <button
                          className={`calendar-timed-task p${task.priority} ${continuesFromPreviousDay ? "continues-from-previous" : ""} ${continuesToNextDay ? "continues-to-next" : ""}`}
                          key={`${task.id}:${iso}`}
                          style={{ top, height }}
                          onClick={(event) => { event.stopPropagation(); onOpenTask(task.id); }}
                        >
                          <strong>{continuesFromPreviousDay ? `↳ до ${endLabel}` : task.time}</strong>
                          <span>{task.title}</span>
                          {continuesToNextDay && <small>продолжение завтра ↓</small>}
                          {!continuesToNextDay && dayCount <= 7 && task.projectId && <small>{projectPath(projects, task.projectId)}</small>}
                        </button>
                      );
                    })}

                    {iso === todayIso && (() => {
                      const now = new Date();
                      const top = TOP_OFFSET + (now.getHours() * 60 + now.getMinutes()) * (HOUR_HEIGHT / 60);
                      return <span className="calendar-now-line" style={{ top }} />;
                    })()}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
