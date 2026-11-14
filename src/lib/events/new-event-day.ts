// Which day and time the "New event" button suggests. Pure, so it can be tested.
// The event goes on the day the calendar is on (the day in the address), in every view: when that day
// is today, the next full hour; on any other day 9am (or the day's first visible hour if that is later).
import type { Span } from "./drag";

export type NewEventSlot = { date: string; span: Span };

export function newEventSlot(input: {
  /** The day the calendar is on, "2026-11-18". */
  date: string;
  today: string;
  /** The next full hour from now, as day and minutes (it may already be tomorrow late at night). */
  nextHour: NewEventSlot;
  dayStartHour: number;
}): NewEventSlot {
  if (input.date === input.today) return input.nextHour;
  const startMin = Math.max(input.dayStartHour * 60, 9 * 60);
  return { date: input.date, span: { startMin, endMin: Math.min(24 * 60, startMin + 60) } };
}

/**
 * The next full hour on the wall clock, one hour long: "2026-11-16T10:10" gives 11:00 to 12:00. A time
 * that is already on the hour stays. At night it may be on the next day (23:30 gives 00:00 of the next day).
 */
export function nextFullHour(nowLocal: string): NewEventSlot {
  const [day, time] = nowLocal.split("T");
  const [hour, minute] = time.split(":").map(Number);
  const start = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), hour + (minute > 0 ? 1 : 0));
  const startDate = new Date(start);
  const startMin = startDate.getUTCHours() * 60;
  return { date: startDate.toISOString().slice(0, 10), span: { startMin, endMin: startMin + 60 } };
}
