import { useEffect, useMemo, useState } from "react";

const SYNODIC_MONTH = 29.530588853;
const NEW_MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14);
const DAY_MS = 86_400_000;

const PHASES = [
  { icon: "🌑", name: "Новолуние" },
  { icon: "🌒", name: "Растущий серп" },
  { icon: "🌓", name: "Первая четверть" },
  { icon: "🌔", name: "Растущая Луна" },
  { icon: "🌕", name: "Полнолуние" },
  { icon: "🌖", name: "Убывающая Луна" },
  { icon: "🌗", name: "Последняя четверть" },
  { icon: "🌘", name: "Убывающий серп" }
] as const;

const ZODIAC = [
  ["♈", "Овен", "действие и инициатива"],
  ["♉", "Телец", "устойчивость и телесность"],
  ["♊", "Близнецы", "общение и обмен идеями"],
  ["♋", "Рак", "дом и эмоциональная безопасность"],
  ["♌", "Лев", "самовыражение и творчество"],
  ["♍", "Дева", "порядок и практические дела"],
  ["♎", "Весы", "отношения и баланс"],
  ["♏", "Скорпион", "глубина и трансформация"],
  ["♐", "Стрелец", "смысл и расширение горизонтов"],
  ["♑", "Козерог", "структура и ответственность"],
  ["♒", "Водолей", "новое и независимое мышление"],
  ["♓", "Рыбы", "интуиция и восстановление"]
] as const;

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function moonAge(date: Date) {
  const utcNoon = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const days = (utcNoon - NEW_MOON_EPOCH) / DAY_MS;
  return ((days % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH;
}

function moonPhase(age: number) {
  const index = Math.floor((age / SYNODIC_MONTH) * 8 + 0.5) % 8;
  return PHASES[index];
}

function moonLongitude(date: Date) {
  const d = (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12) - Date.UTC(1999, 11, 31, 0)) / DAY_MS;
  const node = normalizeDegrees(125.1228 - 0.0529538083 * d);
  const inclination = 5.1454;
  const periapsis = normalizeDegrees(318.0634 + 0.1643573223 * d);
  const eccentricity = 0.0549;
  const meanAnomaly = normalizeDegrees(115.3654 + 13.0649929509 * d);
  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;
  const eccentricAnomaly = meanAnomaly
    + eccentricity * toDeg * Math.sin(meanAnomaly * toRad) * (1 + eccentricity * Math.cos(meanAnomaly * toRad));
  const xv = Math.cos(eccentricAnomaly * toRad) - eccentricity;
  const yv = Math.sqrt(1 - eccentricity * eccentricity) * Math.sin(eccentricAnomaly * toRad);
  const trueAnomaly = Math.atan2(yv, xv) * toDeg;
  const radius = Math.sqrt(xv * xv + yv * yv);
  const argument = (trueAnomaly + periapsis) * toRad;
  const nodeRad = node * toRad;
  const incRad = inclination * toRad;
  const x = radius * (Math.cos(nodeRad) * Math.cos(argument) - Math.sin(nodeRad) * Math.sin(argument) * Math.cos(incRad));
  const y = radius * (Math.sin(nodeRad) * Math.cos(argument) + Math.cos(nodeRad) * Math.sin(argument) * Math.cos(incRad));
  return normalizeDegrees(Math.atan2(y, x) * toDeg);
}

function moonData(date: Date) {
  const age = moonAge(date);
  const phase = moonPhase(age);
  const illumination = Math.round(((1 - Math.cos((2 * Math.PI * age) / SYNODIC_MONTH)) / 2) * 100);
  const lunarDay = Math.min(30, Math.floor(age) + 1);
  const longitude = moonLongitude(date);
  const zodiacIndex = Math.floor(longitude / 30) % 12;
  const zodiac = ZODIAC[zodiacIndex];
  return { age, phase, illumination, lunarDay, zodiac, longitude };
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setHours(12, 0, 0, 0);
  next.setDate(next.getDate() + days);
  return next;
}

function nextLunation(date: Date, targetAge: number) {
  const age = moonAge(date);
  let delta = (targetAge - age + SYNODIC_MONTH) % SYNODIC_MONTH;
  if (delta < 0.35) delta += SYNODIC_MONTH;
  return addDays(date, Math.round(delta));
}

function monthGrid(cursor: Date) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = addDays(first, -mondayOffset);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function sameDate(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function dateLabel(date: Date, withYear = false) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    ...(withYear ? { year: "numeric" as const } : {})
  }).format(date);
}

function phaseGuidance(age: number) {
  const quarter = SYNODIC_MONTH / 4;
  if (age < 1.4 || age > SYNODIC_MONTH - 0.8) {
    return {
      title: "Точка нового цикла",
      text: "В астрологической традиции новолуние связывают с намерением, тишиной и выбором направления.",
      good: ["сформулировать намерение", "планировать", "снизить внешний шум"],
      careful: ["требовать от себя мгновенного результата"]
    };
  }
  if (age < SYNODIC_MONTH / 2) {
    return {
      title: age < quarter ? "Набор импульса" : "Рост и проявление",
      text: "Растущую Луну традиционно связывают с развитием, активными действиями и укреплением начатого.",
      good: ["двигать важные проекты", "учиться", "укреплять полезные привычки"],
      careful: ["распыляться на слишком много целей"]
    };
  }
  if (Math.abs(age - SYNODIC_MONTH / 2) < 1.4) {
    return {
      title: "Пик цикла",
      text: "Полнолуние в астрологической традиции связывают с высокой заметностью результатов и эмоциональной насыщенностью.",
      good: ["подвести промежуточные итоги", "завершить очевидное", "наблюдать за реакциями"],
      careful: ["принимать решения только на эмоциональном импульсе"]
    };
  }
  return {
    title: age < quarter * 3 ? "Сбор результата" : "Завершение и освобождение",
    text: "Убывающую Луну традиционно связывают с завершением, пересмотром, уборкой лишнего и восстановлением.",
    good: ["закрывать хвосты", "упрощать", "освобождать пространство"],
    careful: ["стартовать сразу несколько тяжёлых долгосрочных дел"]
  };
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
  const selected = useMemo(() => moonData(selectedDate), [selectedDate]);
  const guidance = useMemo(() => phaseGuidance(selected.age), [selected.age]);
  const nextNewMoon = useMemo(() => nextLunation(selectedDate, 0), [selectedDate]);
  const nextFullMoon = useMemo(() => nextLunation(selectedDate, SYNODIC_MONTH / 2), [selectedDate]);

  if (!open) return null;

  const monthTitle = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(cursor);
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

        <div className="moon-calendar-summary">
          <div className="moon-calendar-orb" aria-hidden="true">{selected.phase.icon}</div>
          <div className="moon-calendar-summary-copy">
            <span>{dateLabel(selectedDate, true)}</span>
            <h3>{selected.phase.name}</h3>
            <p>{selected.lunarDay}-й лунный день · освещено {selected.illumination}%</p>
          </div>
          <div className="moon-calendar-zodiac">
            <span>{selected.zodiac[0]}</span>
            <div>
              <small>Луна в знаке</small>
              <strong>{selected.zodiac[1]}</strong>
            </div>
          </div>
        </div>

        <div className="moon-calendar-layout">
          <div className="moon-month-card">
            <div className="moon-month-nav">
              <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1, 12))} aria-label="Предыдущий месяц">‹</button>
              <strong>{monthTitle}</strong>
              <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1, 12))} aria-label="Следующий месяц">›</button>
            </div>
            <div className="moon-weekdays" aria-hidden="true">
              {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="moon-month-grid">
              {days.map((day) => {
                const data = moonData(day);
                const currentMonth = day.getMonth() === cursor.getMonth();
                return (
                  <button
                    type="button"
                    key={day.toISOString()}
                    className={[
                      "moon-day",
                      currentMonth ? "" : "outside",
                      sameDate(day, selectedDate) ? "selected" : "",
                      sameDate(day, today) ? "today" : ""
                    ].filter(Boolean).join(" ")}
                    onClick={() => {
                      setSelectedDate(day);
                      if (!currentMonth) setCursor(new Date(day.getFullYear(), day.getMonth(), 1, 12));
                    }}
                    aria-label={`${dateLabel(day)}: ${data.phase.name}, ${data.lunarDay}-й лунный день`}
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
              <div className="moon-section-label"><span>Астрономия</span><small>приблизительный локальный расчёт</small></div>
              <dl className="moon-facts">
                <div><dt>Возраст Луны</dt><dd>{selected.age.toFixed(1)} суток</dd></div>
                <div><dt>Освещённость</dt><dd>{selected.illumination}%</dd></div>
                <div><dt>Новолуние</dt><dd>{dateLabel(nextNewMoon)}</dd></div>
                <div><dt>Полнолуние</dt><dd>{dateLabel(nextFullMoon)}</dd></div>
              </dl>
            </div>

            <div className="moon-astro-section">
              <div className="moon-section-label"><span>Астрологическая трактовка</span><small>не научная рекомендация</small></div>
              <h3>{guidance.title}</h3>
              <p>{guidance.text}</p>
              <div className="moon-zodiac-note">
                {selected.zodiac[0]} Луну в {selected.zodiac[1]} в астрологической традиции связывают с темой: {selected.zodiac[2]}.
              </div>
              <div className="moon-guidance-columns">
                <div>
                  <strong>Можно направить внимание</strong>
                  {guidance.good.map((item) => <span key={item}>＋ {item}</span>)}
                </div>
                <div>
                  <strong>Не спешить</strong>
                  {guidance.careful.map((item) => <span key={item}>— {item}</span>)}
                </div>
              </div>
            </div>
          </aside>
        </div>

        <footer className="moon-calendar-footer">
          Фазы, освещённость и положение в знаке рассчитаны локально приближённым алгоритмом. Для профессиональных эфемерид этот модуль не предназначен.
        </footer>
      </section>
    </div>
  );
}
