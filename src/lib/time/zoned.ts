// Date arithmetic in the user's time zone, with the browser's and Node's built-in Intl only.
// Times are stored in UTC (JavaScript Date). A "local date" is a plain "YYYY-MM-DD" string in the
// user's time zone; days and weeks are counted on these strings, never by adding 24 hours, so weeks
// with a clock change (167 or 169 hours) come out right.
// A week runs Monday 00:00 to Sunday 24:00 in the user's time zone; an event belongs to the day it starts (R2).

/** "2026-11-16": a calendar day in the user's time zone. */
export type LocalDate = string;

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const formatters = new Map<string, Intl.DateTimeFormat>();

/** One cached formatter per time zone that gives the wall-clock parts of an instant. */
function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** The wall-clock time of `instant` in `timeZone`. */
export function wallClock(instant: Date, timeZone: string) {
  const parts: Record<string, number> = {};
  for (const { type, value } of partsFormatter(timeZone).formatToParts(instant)) {
    if (type !== "literal") parts[type] = Number(value);
  }
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second };
}

/** How far `timeZone` is ahead of UTC at `instant`, in milliseconds (Lisbon in summer: 3,600,000). */
function offsetMs(instant: Date, timeZone: string): number {
  const w = wallClock(instant, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The local day `instant` falls on in `timeZone`. */
export function localDateOf(instant: Date, timeZone: string): LocalDate {
  const w = wallClock(instant, timeZone);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

/** "09:00": the local time of `instant` in `timeZone`. */
export function localTimeOf(instant: Date, timeZone: string): string {
  const w = wallClock(instant, timeZone);
  return `${pad(w.hour)}:${pad(w.minute)}`;
}

/** "2026-11-16T09:00": the value a datetime-local input shows for `instant` in `timeZone`. */
export function localDateTimeOf(instant: Date, timeZone: string): string {
  return `${localDateOf(instant, timeZone)}T${localTimeOf(instant, timeZone)}`;
}

/** True for a real calendar day written as "YYYY-MM-DD". */
export function isLocalDate(value: string): boolean {
  const m = LOCAL_DATE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** The instant when the wall clock in `timeZone` shows `date` at `hour`:`minute`. */
function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  // Guess with the offset at the naive instant, then correct once with the offset at the guess.
  // During the spring clock change a time that does not exist (02:30 in Lisbon) moves forward by an hour.
  const first = naive - offsetMs(new Date(naive), timeZone);
  const second = naive - offsetMs(new Date(first), timeZone);
  return new Date(second);
}

/** The instant of 00:00 on `date` in `timeZone`. */
export function startOfLocalDate(date: LocalDate, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return zonedToUtc(y, m, d, 0, 0, timeZone);
}

/**
 * Reads "2026-11-16T09:00" (a datetime-local input) as a time in `timeZone`.
 * Returns null for anything that is not a real date and time in that form.
 */
export function parseLocalDateTime(value: string, timeZone: string): Date | null {
  const m = LOCAL_DATE_TIME.exec(value);
  if (!m || !isLocalDate(value.slice(0, 10))) return null;
  const [hour, minute] = [Number(m[4]), Number(m[5])];
  if (hour > 23 || minute > 59) return null;
  return zonedToUtc(Number(m[1]), Number(m[2]), Number(m[3]), hour, minute, timeZone);
}

/** The local date `days` days after `date` (negative: before). */
export function addDays(date: LocalDate, days: number): LocalDate {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** The Monday of the week that contains `date`. */
export function mondayOf(date: LocalDate): LocalDate {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sunday … 6 Saturday
  return addDays(date, -((weekday + 6) % 7));
}

export type Week = {
  /** The Monday. */
  monday: LocalDate;
  /** Monday to Sunday. */
  days: LocalDate[];
  /** Monday 00:00 in the user's time zone. */
  startsAt: Date;
  /** The next Monday 00:00 (Sunday 24:00) in the user's time zone. */
  endsAt: Date;
};

/** The week (Monday to Sunday) that contains `date`, in `timeZone`. */
export function weekOf(date: LocalDate, timeZone: string): Week {
  const monday = mondayOf(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  return {
    monday,
    days,
    startsAt: startOfLocalDate(monday, timeZone),
    endsAt: startOfLocalDate(addDays(monday, 7), timeZone),
  };
}

/** "Mon 16 Nov": a short label for a local date. */
export function dayLabel(date: LocalDate): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

function utcDateOf(date: LocalDate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function format(date: LocalDate, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(utcDateOf(date));
}

/** The parts a day heading shows: "Mon", 16, and "Monday 16 November" for screen readers. */
export function dayParts(date: LocalDate): { weekday: string; day: number; long: string } {
  return {
    weekday: format(date, { weekday: "short" }),
    day: Number(date.slice(8, 10)),
    long: format(date, { weekday: "long", day: "numeric", month: "long" }),
  };
}

/** The ISO week number (weeks start on Monday; week 1 holds the year's first Thursday). */
export function isoWeekNumber(date: LocalDate): number {
  const thursday = utcDateOf(addDays(mondayOf(date), 3));
  const firstOfYear = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.floor((thursday.getTime() - firstOfYear) / (7 * 24 * 60 * 60 * 1000)) + 1;
}

/** The calendar's title for the week from `monday`: "November 2026", "Nov – Dec 2026" or "Dec 2026 – Jan 2027". */
export function weekTitle(monday: LocalDate): string {
  const sunday = addDays(monday, 6);
  if (monday.slice(0, 7) === sunday.slice(0, 7)) return format(monday, { month: "long", year: "numeric" });
  if (monday.slice(0, 4) === sunday.slice(0, 4)) {
    return `${format(monday, { month: "short" })} – ${format(sunday, { month: "short", year: "numeric" })}`;
  }
  return `${format(monday, { month: "short", year: "numeric" })} – ${format(sunday, { month: "short", year: "numeric" })}`;
}
