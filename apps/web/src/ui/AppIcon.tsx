import type { ReactNode } from "react";

export type AppIconName =
  | "home"
  | "check"
  | "plus"
  | "orbit"
  | "note"
  | "search"
  | "settings"
  | "calendar"
  | "target"
  | "clock"
  | "alert"
  | "chevron"
  | "image"
  | "link"
  | "more"
  | "folder"
  | "edit"
  | "diary";

export function AppIcon({ name, size = 20 }: { name: AppIconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true
  };

  const paths: Record<AppIconName, ReactNode> = {
    home: <><path d="M3.8 10.7 12 4l8.2 6.7"/><path d="M5.8 9.5V20h12.4V9.5"/><path d="M9.3 20v-6.3h5.4V20"/></>,
    check: <path d="m5 12.6 4.2 4.2L19.3 6.7"/>,
    plus: <><path d="M12 5v14"/><path d="M5 12h14"/></>,
    orbit: <><circle cx="12" cy="12" r="3.1"/><ellipse cx="12" cy="12" rx="9" ry="4.6" transform="rotate(32 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="4.6" transform="rotate(-32 12 12)"/></>,
    note: <><path d="M6 3.8h8.8L19 8v12.2H6z"/><path d="M14.5 3.8V8H19"/><path d="M9 12h6M9 15.5h4.5"/></>,
    search: <><circle cx="10.6" cy="10.6" r="5.8"/><path d="m15 15 4.4 4.4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19 13.4v-2.8l-2-.7a7 7 0 0 0-.7-1.6l.9-1.9-2-2-1.9.9a7 7 0 0 0-1.6-.7L11 2.7H8.2l-.7 1.9a7 7 0 0 0-1.6.7L4 4.4l-2 2 .9 1.9a7 7 0 0 0-.7 1.6l-2 .7v2.8l2 .7a7 7 0 0 0 .7 1.6L2 17.6l2 2 1.9-.9a7 7 0 0 0 1.6.7l.7 1.9H11l.7-1.9a7 7 0 0 0 1.6-.7l1.9.9 2-2-.9-1.9a7 7 0 0 0 .7-1.6z" transform="translate(1.4) scale(.88)"/></>,
    calendar: <><rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M8 3.5v4M16 3.5v4M4 10h16"/></>,
    target: <><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.3"/></>,
    clock: <><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></>,
    alert: <><path d="M12 4.2 21 20H3z"/><path d="M12 9v4.8M12 17.2h.01"/></>,
    chevron: <path d="m9 5 7 7-7 7"/>,
    image: <><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m5.5 17 4.3-4.2 3.2 3 2.2-2.1 3.3 3.3"/></>,
    link: <><path d="M9.5 14.5 14.5 9"/><path d="M7.2 16.8 5.6 18.4a3.4 3.4 0 0 1-4.8-4.8l3.4-3.4A3.4 3.4 0 0 1 9 10" transform="translate(2)"/><path d="m14.8 7.2 1.6-1.6a3.4 3.4 0 0 1 4.8 4.8l-3.4 3.4A3.4 3.4 0 0 1 13 14" transform="translate(-2)"/></>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    folder: <><path d="M3.8 6.8h6l2 2h8.4v9.4a1.8 1.8 0 0 1-1.8 1.8H5.6a1.8 1.8 0 0 1-1.8-1.8z"/><path d="M3.8 9h16.4"/></>,
    edit: <><path d="M5 19h4l10-10-4-4L5 15z"/><path d="m13.8 6.2 4 4"/></>,
    diary: <><path d="M6 4h11a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2z"/><path d="M8 4v16M10.5 9h5M10.5 12.5h4"/></>
  };

  return <svg {...common}>{paths[name]}</svg>;
}
