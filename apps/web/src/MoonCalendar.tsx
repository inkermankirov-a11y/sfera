import { useEffect, useMemo, useState } from "react";
import {
  fullMoonsBetween,
  getMoonDayData,
  isSameLocalDate,
  searchNextFullMoon,
  searchNextNewMoon
} from "./moon-engine";

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setHours(12, 0, 0, 0);
  next.setDate(next.getDate() + days);
  return next;
}

function monthGrid(cursor: Date) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = addDays(first, -mondayOffset);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function dateLabel(date: Date, withYear = false) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    ...(withYear ? { year: "numeric" as const } : {})
  }).format(date);
}

function dateTimeLabel(date: Date | null) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

type MoonCalendarProps = {
  open: boolean;
  onClose: () => void;
};

export function MoonCalendar({ open, onClose }: MoonCalendarProps) {
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const days = useMemo(() => monthGrid(cursor), [cursor]);
  const selected = useMemo(() => getMoonDayData(selectedDate), [selectedDate]);
  const nextNewMoon = useMemo(() => searchNextNewMoon(selectedDate), [selectedDate]);
  const nextFullMoon = useMemo(() => searchNextFullMoon(selectedDate), [selectedDate]);

  const fullMoonDates = useMemo(() => {
    if (!days.length) return [];
    return fullMoonsBetween(days[0], days[days.length - 1]);
  }, [days]);

  const selectedFullMoon = fullMoonDates.find((date) => isSameLocalDate(date, selectedDate)) ?? null;

  if (!open) return null;

  const monthTitle = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric"
  }).format(cursor);
  const today = new Date();

  return (
    <div className="moon-calendar-backdrop" onMouseDown={onClose}>
      <section
        className="moon-calendar-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Лунный календарь"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="moon-calendar-header">
          <div>
            <span className="moon-calendar-kicker">СФЕРА · ЛУНА</span>
            <h2>Лунный календарь</h2>
          </div>
          <button type="button" className="moon-calendar-close" onClick={onClose} aria-label="Закрыть">×</button>
        </header>

        <div className={`moon-calendar-summary ${selectedFullMoon ? "is-full-moon" : ""}`}>
          <div className="moon-calendar-orb" aria-hidden="true">{selected.phase.icon}</div>
          <div className="moon-calendar-summary-copy">
            <span>{dateLabel(selectedDate, true)}</span>
            <h3>{selectedFullMoon ? "Полнолуние" : selected.phase.name}</h3>
            <p>Освещено {selected.illumination}% · возраст Луны ≈ {selected.ageDays.toFixed(1)} суток</p>
          </div>

          {selectedFullMoon ? (
            <div className="moon-calendar-event full-moon-event">
              <span>ПОЛНОЛУНИЕ</span>
              <strong>{dateTimeLabel(selectedFullMoon)}</strong>
            </div>
          ) : (
            <div className="moon-calendar-event">
              <span>Ближайшее полнолуние</span>
              <strong>{dateTimeLabel(nextFullMoon)}</strong>
            </div>
          )}
        </div>

        <div className="moon-calendar-layout">
          <div className="moon-month-card">
            <div className="moon-month-nav">
              <button
                type="button"
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1, 12))}
                aria-label="Предыдущий месяц"
              >‹</button>
              <strong>{monthTitle}</strong>
              <button
                type="button"
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1, 12))}
                aria-label="Следующий месяц"
              >›</button>
            </div>

            <div className="moon-weekdays" aria-hidden="true">
              {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => <span key={day}>{day}</span>)}
            </div>

            <div className="moon-month-grid">
              {days.map((day) => {
                const data = getMoonDayData(day);
                const currentMonth = day.getMonth() === cursor.getMonth();
                const isFullMoon = fullMoonDates.some((fullMoon) => isSameLocalDate(fullMoon, day));

                return (
                  <button
                    type="button"
                    key={day.toISOString()}
                    className={[
                      "moon-day",
                      currentMonth ? "" : "outside",
                      isSameLocalDate(day, selectedDate) ? "selected" : "",
                      isSameLocalDate(day, today) ? "today" : "",
                      isFullMoon ? "full-moon" : ""
                    ].filter(Boolean).join(" ")}
                    onClick={() => {
                      setSelectedDate(day);
                      if (!currentMonth) setCursor(new Date(day.getFullYear(), day.getMonth(), 1, 12));
                    }}
                    aria-label={`${dateLabel(day)}: ${isFullMoon ? "полнолуние" : data.phase.name}, освещено ${data.illumination}%`}
                  >
                    <span>{day.getDate()}</span>
                    <b aria-hidden="true">{data.phase.icon}</b>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className="moon-today-button"
              onClick={() => {
                const now = new Date();
                setSelectedDate(now);
                setCursor(new Date(now.getFullYear(), now.getMonth(), 1, 12));
              }}
            >
              Сегодня
            </button>
          </div>

          <aside className="moon-day-card">
            <div className="moon-fact-section">
              <div className="moon-section-label">
                <span>Данные дня</span>
                <small>астрономический расчёт</small>
              </div>
              <dl className="moon-facts">
                <div><dt>Фаза</dt><dd>{selectedFullMoon ? "Полнолуние" : selected.phase.name}</dd></div>
                <div><dt>Освещённость</dt><dd>{selected.illumination}%</dd></div>
                <div><dt>Новолуние</dt><dd>{dateTimeLabel(nextNewMoon)}</dd></div>
                <div><dt>Полнолуние</dt><dd>{dateTimeLabel(nextFullMoon)}</dd></div>
              </dl>
            </div>

          </aside>
        </div>
      </section>
    </div>
  );
}
