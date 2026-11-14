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
