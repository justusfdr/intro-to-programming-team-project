// How times and dates look on screen, copied from the prototype's formatting helpers (lib/time.ts there):
// 12-hour times by default ("9am", "1:30pm", "9 – 10:30am", "1:30pm · 1h"), 24-hour on request ("9:00",
// "13:30"), and month-first dates ("Nov 16", "Mon, Nov 16"). Only for display: stored values, the
// values of form fields and server messages keep their own form.
// Times come in as "HH:MM" (or minutes after midnight) of the user's time zone; dates as "YYYY-MM-DD".
import { addDays, type LocalDate } from "./zoned";

export type TimeFormat = "12h" | "24h";

/** The user's display settings (app.settings): time format and the hours the calendar shows. */
export type Display = { timeFormat: TimeFormat; dayStartHour: number; dayEndHour: number };

/** As in the prototype: 12-hour times, 7 am to 9 pm. */
export const DEFAULT_DISPLAY: Display = { timeFormat: "12h", dayStartHour: 7, dayEndHour: 21 };

const pad = (n: number) => String(n).padStart(2, "0");

/** "09:30" → 570; a number is taken as minutes already. 24:00 and later wrap to the next day's clock. */
function toMinutes(time: string | number): number {
  if (typeof time === "number") return time;
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

function hourMinute(time: string | number): { h: number; m: number } {
  const min = ((toMinutes(time) % 1440) + 1440) % 1440;
  return { h: Math.floor(min / 60), m: min % 60 };
}

function meridiem(h: number): "am" | "pm" {
  return h < 12 ? "am" : "pm";
}

/** 12h without am/pm: 9 → "9", 9:30 → "9:30", 0 → "12". */
function clock12(h: number, m: number): string {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? String(h12) : `${h12}:${pad(m)}`;
}

/** 24h: "9:00", "14:30". 12h: "9am", "9:30am", "2pm", "12pm". */
export function fmtTime(time: string | number, format: TimeFormat): string {
  const { h, m } = hourMinute(time);
  if (format === "24h") return `${h}:${pad(m)}`;
  return `${clock12(h, m)}${meridiem(h)}`;
}

/** 24h: "9:00 – 10:30". 12h: "9 – 10:30am" (same half of the day) or "11am – 1pm". */
export function fmtRange(start: string | number, end: string | number, format: TimeFormat): string {
  if (format === "24h") return `${fmtTime(start, "24h")} – ${fmtTime(end, "24h")}`;
  const a = hourMinute(start);
  const b = hourMinute(end);
  if (meridiem(a.h) === meridiem(b.h)) return `${clock12(a.h, a.m)} – ${clock12(b.h, b.m)}${meridiem(b.h)}`;
  return `${fmtTime(start, "12h")} – ${fmtTime(end, "12h")}`;
}

/** Hour label of the grid: 24h "9:00", 12h "9am". */
export function fmtHour(hour: number, format: TimeFormat): string {
  if (format === "24h") return `${hour}:00`;
  const h = ((hour % 24) + 24) % 24;
  return `${clock12(h, 0)}${meridiem(h)}`;
}

/** An hour of the "Visible hours" setting; 24 (end of the day) is "Midnight" in 12 hours, "24:00" in 24. */
export function fmtHourSetting(hour: number, format: TimeFormat): string {
  if (hour === 24) return format === "24h" ? "24:00" : "Midnight";
  return fmtHour(hour, format);
}

/** 135 → "2h 15m", 45 → "45m", 120 → "2h". */
export function fmtMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  if (r === 0) return `${h}h`;
  return `${h}h ${r}m`;
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function parts(date: LocalDate): { year: number; month: number; day: number; weekday: number } {
  const [y, m, d] = date.split("-").map(Number);
  return { year: y, month: m - 1, day: d, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** "Nov 16" */
export function fmtDayMonth(date: LocalDate): string {
  const p = parts(date);
  return `${MONTHS_SHORT[p.month]} ${p.day}`;
}

/** "Mon, Nov 16" */
export function fmtDateShort(date: LocalDate): string {
  return `${DAY_SHORT[parts(date).weekday]}, ${fmtDayMonth(date)}`;
}

/** "Mon, Nov 16", with the year when it is not the year of `today`: "Wed, Nov 17, 2027" (spec 66). */
export function fmtDateShortFrom(date: LocalDate, today: LocalDate): string {
  const year = parts(date).year;
  return year === parts(today).year ? fmtDateShort(date) : `${fmtDateShort(date)}, ${year}`;
}

/** "Monday, November 16": for screen readers and headings. */
export function fmtDateLong(date: LocalDate): string {
  const p = parts(date);
  return `${DAY_LONG[p.weekday]}, ${MONTHS_LONG[p.month]} ${p.day}`;
}

/** "Mon" */
export function fmtWeekday(date: LocalDate): string {
  return DAY_SHORT[parts(date).weekday];
}

/** The week from `monday`: "Nov 16 – 22", or "Nov 30 – Dec 6" across two months. */
export function fmtWeekRange(monday: LocalDate): string {
  const sunday = addDays(monday, 6);
  const a = parts(monday);
  const b = parts(sunday);
  return a.month === b.month ? `${fmtDayMonth(monday)} – ${b.day}` : `${fmtDayMonth(monday)} – ${fmtDayMonth(sunday)}`;
}
