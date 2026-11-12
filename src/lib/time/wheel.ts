// The rules of the time wheel (as in the iPhone's Clock app): a column of hours 00 to 23 and a column
// of minutes 00 to 59, or the time typed as "HH:MM". Times are minutes after midnight (0 to 1439).
// Kept apart from the component so every rule can be tested on its own.

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
