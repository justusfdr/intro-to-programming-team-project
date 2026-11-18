// The rules of the time wheel (as in the iPhone's Clock app): a column of hours 00 to 23 and a column
// of minutes 00 to 59, or the time typed as "HH:MM". Times are minutes after midnight (0 to 1439).
// Kept apart from the component so every rule can be tested on its own.

import { fmtTime, type TimeFormat } from "./display";

export const HOURS: readonly number[] = Array.from({ length: 24 }, (_, h) => h);
export const MINUTES: readonly number[] = Array.from({ length: 60 }, (_, m) => m);

/** 23:59, the latest time the wheel can show. */
export const LAST_MINUTE = 23 * 60 + 59;

/** The shortest event, as everywhere else in the calendar. */
const MIN_LENGTH = 15;

const MESSAGES = {
  format: "Enter the time as HH:MM, for example 09:30",
  hour: "Hours go from 00 to 23",
  minute: "Minutes go from 00 to 59",
  end: "The end must be at least 15 minutes after the start",
} as const;

export const pad2 = (n: number) => String(n).padStart(2, "0");

/** 570 → "09:30". */
export function formatHHMM(min: number): string {
  return `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
}

export type Parsed = { ok: true; min: number } | { ok: false; message: string };

/**
 * A typed time. Only exactly two digits, a colon and two digits are read; hours 00 to 23 and minutes
 * 00 to 59. Anything else is refused with a message that says why.
 */
export function parseHHMM(text: string): Parsed {
  const match = /^([0-9]{2}):([0-9]{2})$/.exec(text);
  if (!match) return { ok: false, message: MESSAGES.format };
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23) return { ok: false, message: MESSAGES.hour };
  if (m > 59) return { ok: false, message: MESSAGES.minute };
  return { ok: true, min: h * 60 + m };
}

const MESSAGE_12H = "Enter the time like 8:30pm, or as 24-hour time like 20:30";

/** 570 → "09:30" in 24h, "9:30am" in 12h (as everywhere else in the app). */
export function formatClock(min: number, format: TimeFormat): string {
  return format === "24h" ? formatHHMM(min) : fmtTime(min, "12h");
}

/**
 * A typed clock time. 24h: as parseHHMM. 12h: "8pm", "8:30pm", "8:30 pm", "12am" (hour 1 to 12, am or pm,
 * any case) and also 24-hour "20:30", because people paste both. "8:30" without am/pm is refused in 12h.
 */
export function parseClock(text: string, format: TimeFormat): Parsed {
  if (format === "24h") return parseHHMM(text);
  const typed = text.trim();
  const match = /^([0-9]{1,2})(?::([0-9]{2}))?\s*(am|pm)$/i.exec(typed);
  if (!match) {
    const plain = parseHHMM(typed);
    return plain.ok || /^[0-9]{2}:[0-9]{2}$/.test(typed) ? plain : { ok: false, message: MESSAGE_12H };
  }
  const h = Number(match[1]);
  const m = Number(match[2] ?? 0);
  if (h < 1 || h > 12) return { ok: false, message: "Hours go from 1 to 12" };
  if (m > 59) return { ok: false, message: MESSAGES.minute };
  return { ok: true, min: (h % 12) * 60 + (match[3].toLowerCase() === "pm" ? 720 : 0) + m };
}

/** What a 12h field shows while someone types: digits, a colon, a space and the letters of am/pm (at most 8 characters). */
export function maskClockTyping12(typed: string): string {
  return typed.toLowerCase().replace(/[^0-9:apm ]/g, "").slice(0, 8);
}

/** A row of the wheel's hour column in 12h: 0 → "12 am", 13 → "1 pm" (24 is the end of the day: "12 am"). */
export function hourLabel12(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "am" : "pm"}`;
}

/** How the hour column labels its rows: two digits in 24h, "12 am" … "11 pm" in 12h. */
export function hourFormat(format: TimeFormat): (hour: number) => string {
  return format === "24h" ? pad2 : hourLabel12;
}

/**
 * What the field shows while someone types: only digits (at most four), and the colon after the second
 * one appears by itself ("0930" → "09:30"). Deleting the colon deletes nothing else.
 */
export function maskTimeTyping(typed: string): string {
  const digits = typed.replace(/[^0-9]/g, "").slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

/** The row standing in the middle of a column scrolled by `scrollTop`, never outside the column. */
export function indexAtScroll(scrollTop: number, rowHeight: number, count: number): number {
  if (!(rowHeight > 0) || !Number.isFinite(scrollTop)) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(scrollTop / rowHeight)));
}

/** How many times a column's rows are laid out one after the other, so it can be scrolled round and round. */
export const COPIES = 23;
/** The copy the column rests in (the middle one); after scrolling stops it jumps back here unseen. */
export const HOME_COPY = (COPIES - 1) / 2;

/** The item in the middle of an endless column scrolled by `scrollTop`: past the last comes the first again. */
export function cyclicIndex(scrollTop: number, rowHeight: number, count: number): number {
  if (!(rowHeight > 0) || !(count > 0) || !Number.isFinite(scrollTop)) return 0;
  const row = Math.round(scrollTop / rowHeight);
  return ((row % count) + count) % count;
}

/** The scroll position of `index` in the home copy. */
export function homeScrollTop(index: number, rowHeight: number, count: number): number {
  return (HOME_COPY * count + index) * rowHeight;
}

/** How many copies on each side of the home copy a column can be scrolled through before it jumps back. */
const ROOM = 9;

/**
 * Whether the column has left the middle copies (the home copy and nine on each side), so it is time to
 * jump back to the home copy.
 * Jumping is not free (it cuts a gliding scroll short), so it waits until an edge is near and is never
 * done just for passing from 23 to 00.
 */
export function needsRecentre(scrollTop: number, rowHeight: number, count: number): boolean {
  if (!Number.isFinite(scrollTop) || !(rowHeight > 0) || !(count > 0)) return false;
  const round = count * rowHeight;
  return scrollTop < (HOME_COPY - ROOM) * round || scrollTop >= (HOME_COPY + ROOM + 1) * round;
}

/**
 * The scroll position of `index` in whichever copy is nearest to where the column is now, so going from
 * 23 to 00 moves one row forward instead of back across the whole column.
 */
export function nearestScrollTop(current: number, index: number, rowHeight: number, count: number): number {
  const span = count * rowHeight;
  let best = homeScrollTop(index, rowHeight, count);
  for (let copy = 0; copy < COPIES; copy++) {
    const top = (copy * count + index) * rowHeight;
    if (Math.abs(top - current) < Math.abs(best - current)) best = top;
  }
  return span > 0 ? best : 0;
}

/** The item `by` steps from `index`, going round: one before 00 is 23, one after 59 is 00. */
export function wrapStep(index: number, by: number, count: number): number {
  return (((index + by) % count) + count) % count;
}

const isWhole = (n: number, max: number) => Number.isInteger(n) && n >= 0 && n <= max;

/** The same minute at another hour. An hour outside 0 to 23 changes nothing. */
export function withHour(min: number, hour: number): number {
  return isWhole(hour, 23) ? hour * 60 + (min % 60) : min;
}

/** The same hour at another minute. A minute outside 0 to 59 changes nothing. */
export function withMinute(min: number, minute: number): number {
  return isWhole(minute, 59) ? Math.floor(min / 60) * 60 + minute : min;
}

/** Why a start and end do not fit together, or null when they do. */
export function endProblem(start: number, end: number): string | null {
  return end - start >= MIN_LENGTH ? null : MESSAGES.end;
}
