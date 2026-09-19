export type CalendarCell = {
  iso: string;
  day: number;
  inMonth: boolean;
};

export function localIso(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function isoDate(iso: string) {
  return new Date(iso + "T12:00:00");
}

export function addDaysIso(iso: string, days: number) {
  const date = isoDate(iso);
  date.setDate(date.getDate() + days);
  return localIso(date);
}

export function inclusiveDayCount(start: string, end: string) {
  const ms = isoDate(end).getTime() - isoDate(start).getTime();
  return Math.floor(ms / 86_400_000) + 1;
}

export function isoRange(start: string, end: string) {
  const count = Math.max(1, inclusiveDayCount(start, end));
  return Array.from({ length: count }, (_, index) => addDaysIso(start, index));
}

export function calendarRangeLabel(start: string, end: string) {
  if (start === end) {
    return new Intl.DateTimeFormat("ru-RU", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(isoDate(start));
  }

  const startDate = isoDate(start);
  const endDate = isoDate(end);
  const sameMonth =
    startDate.getMonth() === endDate.getMonth() &&
    startDate.getFullYear() === endDate.getFullYear();

  if (sameMonth) {
    const monthNames = [
      "января", "февраля", "марта", "апреля", "мая", "июня",
      "июля", "августа", "сентября", "октября", "ноября", "декабря"
    ];
    return startDate.getDate() + "–" + endDate.getDate() + " " +
      monthNames[endDate.getMonth()] + " " + endDate.getFullYear() + " г.";
  }

  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(startDate) +
    " — " +
    new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" }).format(endDate);
}

export function monthCells(cursor: Date): CalendarCell[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12);
  const mondayIndex = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - mondayIndex);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      iso: localIso(date),
      day: date.getDate(),
      inMonth: date.getMonth() === cursor.getMonth()
    };
  });
}
