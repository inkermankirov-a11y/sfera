import { CalendarCell } from "./calendar-utils";
import "./calendar.css";

type CalendarMiniMonthProps = {
  title: string;
  cells: CalendarCell[];
  rangeStart: string;
  rangeEnd: string;
  pickingEnd: boolean;
  dayCount: number;
  todayIso: string;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onSelectDay: (iso: string) => void;
  onSetDays: (days: number) => void;
};

export function CalendarMiniMonth({
  title,
  cells,
  rangeStart,
  rangeEnd,
  pickingEnd,
  dayCount,
  todayIso,
  onPreviousMonth,
  onNextMonth,
  onSelectDay,
  onSetDays
}: CalendarMiniMonthProps) {
  return (
    <div className="sidebar-mini-calendar" aria-label="Выбор периода календаря">
      <div className="sidebar-mini-head">
        <button onClick={onPreviousMonth} aria-label="Предыдущий месяц">‹</button>
        <strong>{title}</strong>
        <button onClick={onNextMonth} aria-label="Следующий месяц">›</button>
      </div>

      <div className="sidebar-mini-weekdays">
        {["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map((day) => <span key={day}>{day}</span>)}
      </div>

      <div className="sidebar-mini-grid">
        {cells.map((cell) => {
          const selectedStart = cell.iso === rangeStart;
          const selectedEnd = cell.iso === rangeEnd;
          const inRange = cell.iso >= rangeStart && cell.iso <= rangeEnd;

          return (
            <button
              key={cell.iso}
              className={[
                !cell.inMonth ? "outside" : "",
                cell.iso === todayIso ? "today" : "",
                inRange ? "in-range" : "",
                selectedStart ? "range-start" : "",
                selectedEnd ? "range-end" : ""
              ].filter(Boolean).join(" ")}
              onClick={() => onSelectDay(cell.iso)}
              title={pickingEnd ? "Выбрать конец периода" : "Выбрать начало периода"}
            >
              {cell.day}
            </button>
          );
        })}
      </div>

      <div className="sidebar-mini-hint">
        {pickingEnd ? "Теперь выбери конец периода" : `Выбрано: ${dayCount} дн. · максимум 14`}
      </div>

      <div className="sidebar-mini-quick">
        {[1, 7, 14].map((days) => (
          <button key={days} className={dayCount === days ? "active" : ""} onClick={() => onSetDays(days)}>
            {days === 1 ? "День" : days + " дней"}
          </button>
        ))}
      </div>
    </div>
  );
}
