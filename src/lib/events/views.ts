// The calendar's three views (day, week, month), copied from the first prototype's
// components/calendar/views.ts and changed to work on local dates ("YYYY-MM-DD") of the user's time
// zone, as the rest of the app does. Without seasons (decided out): the subtitle names the ISO week.
// Pure functions, no React: used by the server (which days to read) and the screen (titles, links, keys).
import { fmtDateShort, fmtDayMonth, fmtWeekRange } from "@/lib/time/display";
import { addDays, isLocalDate, isoWeekNumber, mondayOf, weekTitle, type LocalDate } from "@/lib/time/zoned";

export type View = "day" | "week" | "month";
export const VIEWS: View[] = ["day", "week", "month"];

export function isView(value: unknown): value is View {
  return value === "day" || value === "week" || value === "month";
}

export function viewLabel(view: View): string {
  return view === "day" ? "Day" : view === "week" ? "Week" : "Month";
}

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function ymd(date: LocalDate): { y: number; m: number; d: number } {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The first day of the month of `date`. */
export function startOfMonth(date: LocalDate): LocalDate {
  return `${date.slice(0, 7)}-01`;
}

/** The same day `months` months later, kept inside the month (Jan 31 + 1 month = Feb 28). */
export function addMonths(date: LocalDate, months: number): LocalDate {
  const { y, m, d } = ymd(date);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-${pad(Math.min(d, last))}`;
}

/** The month grid: 6 full weeks (42 days) from the Monday on or before the 1st of the month. */
export function monthGrid(date: LocalDate): LocalDate[] {
  const first = mondayOf(startOfMonth(date));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

/** The days a view shows around `date`: the day, its week (Monday to Sunday) or the 6×7 month grid. */
export function visibleDays(view: View, date: LocalDate): LocalDate[] {
  if (view === "day") return [date];
  if (view === "week") {
    const monday = mondayOf(date);
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }
  return monthGrid(date);
}

/** One day, one week or one month earlier (-1) or later (1). */
export function stepDate(view: View, date: LocalDate, dir: 1 | -1): LocalDate {
  if (view === "day") return addDays(date, dir);
  if (view === "week") return addDays(date, 7 * dir);
  return addMonths(date, dir);
}

/** "November 2026"; the week view says "Nov – Dec 2026" when its days reach into two months. */
export function viewTitle(view: View, date: LocalDate): string {
  if (view === "week") return weekTitle(mondayOf(date));
  const { y, m } = ymd(date);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

/**
 * The line below the title: the week "Week 47 · Nov 16 – 22", the day "Wednesday, Nov 18 · Week 47",
 * the month nothing more than its title.
 */
export function viewSubtitle(view: View, date: LocalDate): string {
  if (view === "day") {
    const { y, m, d } = ymd(date);
    return `${DAY_LONG[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${fmtDayMonth(date)} · Week ${isoWeekNumber(date)}`;
  }
  if (view === "week") return `Week ${isoWeekNumber(date)} · ${fmtWeekRange(mondayOf(date))}`;
  return "";
}

/** The shorter line for narrow columns (phones): the day as "Wed, Nov 18 · Week 47". */
export function viewSubtitleShort(view: View, date: LocalDate): string {
  if (view !== "day") return viewSubtitle(view, date);
  return `${fmtDateShort(date)} · Week ${isoWeekNumber(date)}`;
}

export function navLabel(view: View, dir: 1 | -1): string {
  return `${dir < 0 ? "Previous" : "Next"} ${view}`;
}

/** Phones only get day and month; the week view is too narrow. */
export function allowedViews(isPhone: boolean): View[] {
  return isPhone ? ["day", "month"] : [...VIEWS];
}

export function coerceView(view: View, isPhone: boolean): View {
  return isPhone && view === "week" ? "day" : view;
}

/** The calendar's address for a view and day; without a day it opens on today. */
export function calendarHref(view: View, date?: LocalDate): string {
  return date ? `/?view=${view}&date=${date}` : `/?view=${view}`;
}

/**
 * What the address asks for: `view` (day, week, month) and `date`; the older `week` (any day of the
 * week) still works. Anything else is left out, so the page falls back to the default view and today.
 */
export function readAddress(params: { view?: string | string[]; date?: string | string[]; week?: string | string[] }): {
  view?: View;
  date?: LocalDate;
} {
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const view = one(params.view);
  const date = one(params.date) ?? one(params.week);
  return {
    view: isView(view) ? view : undefined,
    date: date !== undefined && isLocalDate(date) ? date : undefined,
  };
}

export type ShortcutAction = { type: "view"; view: View } | { type: "today" } | { type: "step"; dir: 1 | -1 };

/** Keyboard shortcuts for the calendar. Any modifier key disables them. */
export function shortcutFor(e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }): ShortcutAction | null {
  if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return null;
  switch (e.key) {
    case "d":
    case "D":
      return { type: "view", view: "day" };
    case "w":
    case "W":
      return { type: "view", view: "week" };
    case "m":
    case "M":
      return { type: "view", view: "month" };
    case "t":
    case "T":
      return { type: "today" };
    case "ArrowLeft":
      return { type: "step", dir: -1 };
    case "ArrowRight":
      return { type: "step", dir: 1 };
    default:
      return null;
  }
}

/** True if the key event comes from a text field, so shortcuts must not fire. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (target === null || typeof target !== "object") return false;
  const t = target as { tagName?: unknown; isContentEditable?: unknown };
  if (t.isContentEditable === true) return true;
  return typeof t.tagName === "string" && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName.toUpperCase());
}
