import { CalendarMiniMonth } from "./calendar/CalendarMiniMonth";
import type { CalendarCell } from "./calendar/calendar-utils";
import { AppIcon } from "./ui/AppIcon";

export type AppSection = "home" | "projects" | "tasks" | "notes" | "photos" | "calendar" | "relations";

type DesktopSidebarProps = {
  section: AppSection;
  calendarTitle: string;
  calendarCells: CalendarCell[];
  rangeStart: string;
  rangeEnd: string;
  pickingEnd: boolean;
  dayCount: number;
  todayIso: string;
  onSection: (section: AppSection) => void;
  onOpenCalendar: () => void;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onSelectDay: (iso: string) => void;
  onSetDays: (days: number) => void;
  onSettings: () => void;
};

export function DesktopSidebar({
  section,
  calendarTitle,
  calendarCells,
  rangeStart,
  rangeEnd,
  pickingEnd,
  dayCount,
  todayIso,
  onSection,
  onOpenCalendar,
  onPreviousMonth,
  onNextMonth,
  onSelectDay,
  onSetDays,
  onSettings
}: DesktopSidebarProps) {
  return (
    <aside className="sidebar" aria-label="Навигация СФЕРА">
      <button className="brand brand-button" onClick={() => onSection("home")} aria-label="Сегодня в СФЕРЕ">
        <span className="brand-emblem"><img className="brand-logo" src="/sfera/sfera-emblem.png?v=20260921" alt="" /></span>
        <span className="brand-name">СФЕРА</span>
      </button>

      <nav className="side-nav">
        <button className={section === "home" ? "active" : ""} onClick={() => onSection("home")}><span><AppIcon name="home" /></span>Сегодня</button>
        <button className={section === "tasks" ? "active" : ""} onClick={() => onSection("tasks")}><span><AppIcon name="check" /></span>Задачи</button>
        <button className={section === "projects" ? "active" : ""} onClick={() => onSection("projects")}><span><AppIcon name="orbit" /></span>Сферы</button>
        <button className={section === "notes" ? "active" : ""} onClick={() => onSection("notes")}><span><AppIcon name="note" /></span>Заметки</button>

        <span className="side-nav-label">Ещё</span>
        <div className={`calendar-nav-group ${section === "calendar" ? "open" : ""}`}>
          <button className={section === "calendar" ? "active" : ""} onClick={onOpenCalendar}><span><AppIcon name="calendar" /></span>Календарь</button>
          {section === "calendar" && (
            <CalendarMiniMonth
              title={calendarTitle}
              cells={calendarCells}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              pickingEnd={pickingEnd}
              dayCount={dayCount}
              todayIso={todayIso}
              onPreviousMonth={onPreviousMonth}
              onNextMonth={onNextMonth}
              onSelectDay={onSelectDay}
              onSetDays={onSetDays}
            />
          )}
        </div>
        <button className={section === "photos" ? "active" : ""} onClick={() => onSection("photos")}><span><AppIcon name="image" /></span>Фото</button>
        <button className={section === "relations" ? "active" : ""} onClick={() => onSection("relations")}><span><AppIcon name="link" /></span>Связи</button>
      </nav>

      <div className="sidebar-bottom">
        <button className="ghost-button" onClick={onSettings}><AppIcon name="settings" /> Настройки</button>
      </div>
    </aside>
  );
}

type MobileNavigationProps = {
  section: AppSection;
  settingsOpen: boolean;
  moreOpen: boolean;
  onSection: (section: AppSection) => void;
  onAdd: () => void;
  onMoreOpenChange: (open: boolean) => void;
  onOpenCalendar: () => void;
  onSettings: () => void;
};

export function MobileNavigation({
  section,
  settingsOpen,
  moreOpen,
  onSection,
  onAdd,
  onMoreOpenChange,
  onOpenCalendar,
  onSettings
}: MobileNavigationProps) {
  const moreActive = ["notes", "photos", "calendar", "relations"].includes(section) || settingsOpen;

  return (
    <>
      <nav className="bottom-nav mobile-tabbar" aria-label="Основная навигация">
        <button className={section === "home" && !settingsOpen ? "active" : ""} onClick={() => onSection("home")}><span><AppIcon name="home" /></span>Сегодня</button>
        <button className={section === "tasks" && !settingsOpen ? "active" : ""} onClick={() => onSection("tasks")}><span><AppIcon name="check" /></span>Задачи</button>
        <button className="mobile-add-nav" aria-label="Добавить" onClick={onAdd}><span><AppIcon name="plus" /></span>Добавить</button>
        <button className={section === "projects" && !settingsOpen ? "active" : ""} onClick={() => onSection("projects")}><span><AppIcon name="orbit" /></span>Сферы</button>
        <button className={moreActive ? "active" : ""} onClick={() => onMoreOpenChange(true)}><span><AppIcon name="more" /></span>Ещё</button>
      </nav>

      {moreOpen && (
        <div className="mobile-quick-backdrop" onClick={() => onMoreOpenChange(false)}>
          <div className="mobile-quick-sheet mobile-more-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="mobile-sheet-handle" />
            <div className="mobile-quick-head"><strong>Ещё</strong><button onClick={() => onMoreOpenChange(false)}>Закрыть</button></div>
            <div className="mobile-more-grid">
              <button onClick={() => { onMoreOpenChange(false); onSection("notes"); }}><AppIcon name="note" /><span><strong>Заметки</strong><small>Записи и идеи</small></span></button>
              <button onClick={() => { onMoreOpenChange(false); onOpenCalendar(); }}><AppIcon name="calendar" /><span><strong>Календарь</strong><small>Даты и история</small></span></button>
              <button onClick={() => { onMoreOpenChange(false); onSection("photos"); }}><AppIcon name="image" /><span><strong>Фото</strong><small>Изображения и файлы</small></span></button>
              <button onClick={() => { onMoreOpenChange(false); onSection("relations"); }}><AppIcon name="link" /><span><strong>Связи</strong><small>Карта объектов</small></span></button>
              <button onClick={() => { onMoreOpenChange(false); onSettings(); }}><AppIcon name="settings" /><span><strong>Настройки</strong><small>Профиль и приложение</small></span></button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
