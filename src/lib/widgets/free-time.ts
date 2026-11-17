// The "Free time" widget (spec 45): the next stretch of at least 30 minutes today with nothing in it.
// It starts at the later of now (rounded up to the next 5 minutes) and the start of the visible day,
// and must end by the end of the visible day. Pure: no database, no clock of its own.
import { addDays, localDateOf, parseLocalDateTime, startOfLocalDate } from "@/lib/time/zoned";

export const MIN_FREE_MINUTES = 30;
const MINUTE = 60_000;
const ROUND_MINUTES = 5;

export type Busy = { start: Date; end: Date };

export type FreeTimeInput = {
  now: Date;
  timeZone: string;
  /** The visible hours of the day (settings), for example 7 and 21. 24 means midnight. */
  dayStartHour: number;
  dayEndHour: number;
  /** Today's timed events. They may overlap and need not be sorted. */
  events: Busy[];
};

/** The instant of `hour`:00 on a local day; hour 24 is the next midnight. */
function atHour(date: string, hour: number, timeZone: string): Date {
  if (hour >= 24) return startOfLocalDate(addDays(date, 1), timeZone);
  return parseLocalDateTime(`${date}T${String(hour).padStart(2, "0")}:00`, timeZone) ?? startOfLocalDate(date, timeZone);
}

/** `now` rounded up to the next full 5 minutes (a time already on a 5-minute mark stays). */
export function roundUpToFive(now: Date): Date {
  const step = ROUND_MINUTES * MINUTE;
  return new Date(Math.ceil(now.getTime() / step) * step);
}

/** The next free stretch of 30 minutes or more today, or null when there is none. */
export function nextFreeTime({ now, timeZone, dayStartHour, dayEndHour, events }: FreeTimeInput): { start: Date; end: Date } | null {
  const today = localDateOf(now, timeZone);
  const dayStart = atHour(today, dayStartHour, timeZone);
  const dayEnd = atHour(today, dayEndHour, timeZone);
  const from = new Date(Math.max(roundUpToFive(now).getTime(), dayStart.getTime()));

  let cursor = from;
  const need = MIN_FREE_MINUTES * MINUTE;
  const busy = [...events].sort((a, b) => a.start.getTime() - b.start.getTime());
  for (const event of busy) {
    if (event.end <= cursor) continue;
    // The gap before this event, but never past the end of the visible day.
    const gapEnd = new Date(Math.min(event.start.getTime(), dayEnd.getTime()));
    if (gapEnd.getTime() - cursor.getTime() >= need) return { start: cursor, end: gapEnd };
    cursor = event.end;
  }
  return dayEnd.getTime() - cursor.getTime() >= need ? { start: cursor, end: dayEnd } : null;
}
