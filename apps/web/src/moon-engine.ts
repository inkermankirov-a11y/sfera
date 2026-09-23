import { Body, Illumination, MoonPhase, SearchMoonPhase } from "astronomy-engine";

const SYNODIC_MONTH = 29.530588853;
const HOUR_MS = 60 * 60 * 1000;

export const MOON_PHASES = [
  { icon: "🌑", name: "Новолуние" },
  { icon: "🌒", name: "Растущий серп" },
  { icon: "🌓", name: "Первая четверть" },
  { icon: "🌔", name: "Растущая Луна" },
  { icon: "🌕", name: "Полнолуние" },
  { icon: "🌖", name: "Убывающая Луна" },
  { icon: "🌗", name: "Последняя четверть" },
  { icon: "🌘", name: "Убывающий серп" }
] as const;

export type MoonDayData = {
  date: Date;
  phaseAngle: number;
  phase: (typeof MOON_PHASES)[number];
  illumination: number;
  ageDays: number;
};

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

export function getMoonDayData(date = new Date()): MoonDayData {
  const phaseAngle = normalizeDegrees(MoonPhase(date));
  const phaseIndex = Math.round((phaseAngle / 360) * 8) % 8;
  const illumination = Math.round(Illumination(Body.Moon, date).phase_fraction * 100);

  return {
    date,
    phaseAngle,
    phase: MOON_PHASES[phaseIndex],
    illumination,
    ageDays: (phaseAngle / 360) * SYNODIC_MONTH
  };
}

export function searchNextNewMoon(date = new Date()) {
  return SearchMoonPhase(0, date, 35)?.date ?? null;
}

export function searchNextFullMoon(date = new Date()) {
  return SearchMoonPhase(180, date, 35)?.date ?? null;
}

export function fullMoonsBetween(start: Date, end: Date) {
  const results: Date[] = [];
  let cursor = new Date(start.getTime() - 48 * HOUR_MS);

  for (let guard = 0; guard < 4; guard += 1) {
    const found = SearchMoonPhase(180, cursor, 45);
    if (!found) break;

    const eventDate = found.date;
    if (eventDate.getTime() > end.getTime() + 48 * HOUR_MS) break;
    if (eventDate.getTime() >= start.getTime() - 48 * HOUR_MS) results.push(eventDate);

    cursor = new Date(eventDate.getTime() + HOUR_MS);
  }

  return results;
}

export function isSameLocalDate(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}
