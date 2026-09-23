import { useMemo, useState } from "react";
import {
  ESOTERICA_SOURCES,
  getMoonSnapshot,
  getPlanetSnapshots,
  phaseTraditionText
} from "./astro-engine";

type Tab = "today" | "moon" | "astrology" | "sources";

type Props = {
  active: boolean;
  onBack: () => void;
};

function localDateInput(date: Date) {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
}

function dateFromInput(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function formatDate(date: Date | null, withTime = false) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {})
  }).format(date);
}

function formatDegree(value: number) {
  const degree = Math.floor(value);
  const minutes = Math.round((value - degree) * 60);
  return `${degree}° ${String(minutes).padStart(2, "0")}′`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function monthCells(cursor: Date) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12);
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

export function EsotericaScreen({ active, onBack }: Props) {
  const [tab, setTab] = useState<Tab>("today");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [monthCursor, setMonthCursor] = useState(() => new Date());

  const moon = useMemo(() => getMoonSnapshot(selectedDate), [selectedDate]);
  const planets = useMemo(() => getPlanetSnapshots(selectedDate), [selectedDate]);
  const phaseText = useMemo(() => phaseTraditionText(moon), [moon]);
  const cells = useMemo(() => monthCells(monthCursor), [monthCursor]);

  return (
    <section className={`mobile-module-screen esoterica-screen ${active ? "active" : ""}`} aria-hidden={!active}>
      <header className="module-page-header esoterica-page-header">
        <button className="module-back-button" onClick={onBack} aria-label="Назад">←</button>
        <div>
          <span>Отдельный модуль</span>
          <h2>Эзотерика</h2>
        </div>
        <span className="esoterica-header-symbol">☾</span>
      </header>

      <div className="esoterica-intro">
        <div>
          <span className="esoterica-eyebrow">ДАННЫЕ → ТРАДИЦИЯ → ТРАКТОВКА</span>
          <h1>Эзотерика без смешения школ</h1>
          <p>Астрономические координаты рассчитываются отдельно. Интерпретации подписаны той традицией, к которой относятся.</p>
        </div>
        <div className="esoterica-date-control">
          <label htmlFor="esoterica-date">Дата</label>
          <input
            id="esoterica-date"
            type="date"
            value={localDateInput(selectedDate)}
            onChange={(event) => {
              const date = dateFromInput(event.target.value);
              setSelectedDate(date);
              setMonthCursor(date);
            }}
          />
          <button type="button" onClick={() => {
            const now = new Date();
            setSelectedDate(now);
            setMonthCursor(now);
          }}>Сегодня</button>
        </div>
      </div>

      <nav className="esoterica-tabs" aria-label="Разделы эзотерики">
        <button className={tab === "today" ? "active" : ""} onClick={() => setTab("today")}>Сегодня</button>
        <button className={tab === "moon" ? "active" : ""} onClick={() => setTab("moon")}>Луна</button>
        <button className={tab === "astrology" ? "active" : ""} onClick={() => setTab("astrology")}>Астрология</button>
        <button className={tab === "sources" ? "active" : ""} onClick={() => setTab("sources")}>Методика</button>
      </nav>

      {tab === "today" && (
        <div className="esoterica-grid">
          <article className="esoterica-card esoterica-moon-hero">
            <div className="esoterica-card-label">Астрономические данные</div>
            <div className="esoterica-moon-main">
              <span className="esoterica-big-moon" aria-hidden="true">{moon.phase.icon}</span>
              <div>
                <h3>{moon.phase.name}</h3>
                <p>{moon.illumination}% освещённости · расстояние ≈ {Math.round(moon.distanceKm).toLocaleString("ru-RU")} км</p>
              </div>
            </div>
            <div className="esoterica-stat-row">
              <div><span>Положение</span><strong>{moon.sign.symbol} {formatDegree(moon.degreeInSign)} {moon.sign.name}</strong></div>
              <div><span>Следующее новолуние</span><strong>{formatDate(moon.nextNewMoon, true)}</strong></div>
              <div><span>Следующее полнолуние</span><strong>{formatDate(moon.nextFullMoon, true)}</strong></div>
            </div>
          </article>

          <article className="esoterica-card">
            <div className="esoterica-card-label">Современная западная астрология</div>
            <h3>{phaseText.title}</h3>
            <p>{phaseText.text}</p>
            <div className="esoterica-tradition-note">
              <strong>{moon.sign.symbol} Луна в {moon.sign.name}</strong>
              <span>В современной психологической астрологии этот знак Луны связывают с темой: {moon.sign.modernMoonTheme}.</span>
            </div>
          </article>

          <article className="esoterica-card">
            <div className="esoterica-card-label">Индийская календарная традиция</div>
            <h3>{moon.tithi.name}</h3>
            <p>{moon.tithi.numberInPaksha}-я титхи · {moon.tithi.paksha} · {moon.tithi.pakshaLabel}.</p>
            <div className="esoterica-definition">
              Титхи — не 24-часовые сутки. Каждая титхи определяется следующими 12° углового расстояния Луны от Солнца.
            </div>
          </article>

          <article className="esoterica-card esoterica-caution-card">
            <div className="esoterica-card-label">Русскоязычные «лунные сутки»</div>
            <h3>Не подменяем расчёт</h3>
            <p>Популярная система лунных суток привязана к новолунию и местным восходам Луны. Без выбранного места наблюдения модуль не показывает фиктивный номер суток.</p>
            <small>Позже добавим место наблюдения и корректный расчёт восходов Луны.</small>
          </article>
        </div>
      )}

      {tab === "moon" && (
        <div className="esoterica-moon-layout">
          <article className="esoterica-card esoterica-month-card">
            <div className="esoterica-month-head">
              <button type="button" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1, 12))}>‹</button>
              <strong>{new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(monthCursor)}</strong>
              <button type="button" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1, 12))}>›</button>
            </div>
            <div className="esoterica-weekdays">
              {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="esoterica-month-grid">
              {cells.map((day) => {
                const data = getMoonSnapshot(day);
                return (
                  <button
                    type="button"
                    key={day.toISOString()}
                    className={[
                      "esoterica-moon-day",
                      day.getMonth() === monthCursor.getMonth() ? "" : "outside",
                      sameDay(day, selectedDate) ? "selected" : ""
                    ].filter(Boolean).join(" ")}
                    onClick={() => setSelectedDate(day)}
                  >
                    <span>{day.getDate()}</span>
                    <b>{data.phase.icon}</b>
                    <small>{data.sign.symbol}</small>
                  </button>
                );
              })}
            </div>
          </article>

          <aside className="esoterica-card esoterica-selected-day">
            <div className="esoterica-card-label">{formatDate(selectedDate)}</div>
            <div className="esoterica-selected-phase">
              <span>{moon.phase.icon}</span>
              <div><h3>{moon.phase.name}</h3><p>{moon.illumination}% освещённости</p></div>
            </div>
            <dl>
              <div><dt>Луна</dt><dd>{moon.sign.symbol} {formatDegree(moon.degreeInSign)} {moon.sign.name}</dd></div>
              <div><dt>Титхи</dt><dd>{moon.tithi.name}, {moon.tithi.numberInPaksha}-я</dd></div>
              <div><dt>Пакша</dt><dd>{moon.tithi.paksha}</dd></div>
              <div><dt>Фазовый угол</dt><dd>{moon.phaseAngle.toFixed(1)}°</dd></div>
            </dl>
            <div className="esoterica-tradition-note">
              <strong>{phaseText.title}</strong>
              <span>{phaseText.text}</span>
            </div>
          </aside>
        </div>
      )}

      {tab === "astrology" && (
        <div className="esoterica-astrology-layout">
          <article className="esoterica-card">
            <div className="esoterica-card-label">Тропический зодиак · геоцентрические положения</div>
            <h3>Планеты на {formatDate(selectedDate)}</h3>
            <div className="esoterica-planets">
              {planets.map((planet) => (
                <div className="esoterica-planet-row" key={planet.key}>
                  <span className="planet-symbol">{planet.symbol}</span>
                  <strong>{planet.name}</strong>
                  <span>{planet.sign.symbol} {planet.sign.name}</span>
                  <span>{formatDegree(planet.degreeInSign)}</span>
                  <b>{planet.retrograde === true ? "R" : planet.retrograde === false ? "D" : "—"}</b>
                </div>
              ))}
            </div>
          </article>

          <aside className="esoterica-card">
            <div className="esoterica-card-label">Что уже разделено по школам</div>
            <h3>Никакой «универсальной эзотерики»</h3>
            <div className="esoterica-school-list">
              <div><strong>Западная астрология</strong><span>Тропический зодиак, планеты, фазы, позднее — аспекты и Луна без курса с указанием выбранного определения.</span></div>
              <div><strong>Джйотиш / панчанга</strong><span>Титхи вынесены отдельно. Сидерический зодиак, накшатры, йога и карана будут отдельным расчётным режимом, а не смесью с тропическим.</span></div>
              <div><strong>Лунные сутки</strong><span>Популярную русскоязычную систему подключим только вместе с местом наблюдения и расчётом восходов Луны.</span></div>
            </div>
          </aside>
        </div>
      )}

      {tab === "sources" && (
        <div className="esoterica-sources-layout">
          <article className="esoterica-card esoterica-method-card">
            <div className="esoterica-card-label">Принцип модуля</div>
            <h3>Точность относится к расчётам, а не к доказанности эзотерических выводов</h3>
            <p>Положение Луны, фазовый угол и координаты планет — вычисляемые астрономические данные. Значения знаков, фаз, титхи и других элементов показываются как положения конкретных эзотерических или календарных традиций, а не как подтверждённые наукой причинные эффекты.</p>
          </article>

          <div className="esoterica-source-list">
            {ESOTERICA_SOURCES.map((source) => (
              <a key={source.title} className="esoterica-source-card" href={source.url} target="_blank" rel="noreferrer">
                <span>{source.group}</span>
                <strong>{source.title}</strong>
                <p>{source.note}</p>
                <b>Открыть источник ↗</b>
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
