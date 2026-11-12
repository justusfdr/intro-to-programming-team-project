import "server-only";

// The times of each event of a series (R28): every event keeps its own date and gets the same local
// start time, end time and length as the first. Used by create_event and by edit_event with scope
// this_and_following ("edits keep their dates").
import { MESSAGES } from "@/lib/messages";
import { ActionError } from "@/lib/server/errors";
import { addDays, localDateOf, localTimeOf, parseLocalDateTime, type LocalDate } from "@/lib/time/zoned";

/** Local start time, end time, and how many days after the start day the end falls (0 or 1). */
export type TimeTemplate = { startTime: string; endTime: string; endDayOffset: number };

const MAX_LENGTH_MS = 24 * 60 * 60 * 1000;

export function templateOf(startAt: Date, endAt: Date, timeZone: string): TimeTemplate {
  const startDay = localDateOf(startAt, timeZone);
  const endDay = localDateOf(endAt, timeZone);
  return {
    startTime: localTimeOf(startAt, timeZone),
    endTime: localTimeOf(endAt, timeZone),
    endDayOffset: Math.round((Date.parse(endDay) - Date.parse(startDay)) / (24 * 60 * 60 * 1000)),
  };
}

/**
 * The start and end of the event on `date`. On a night the clocks change the length can differ
 * by an hour; the usual checks still apply to every date, so the whole series stays valid.
 */
export function timesOn(date: LocalDate, template: TimeTemplate, timeZone: string): { startAt: Date; endAt: Date } {
  const startAt = parseLocalDateTime(`${date}T${template.startTime}`, timeZone)!;
  const endAt = parseLocalDateTime(`${addDays(date, template.endDayOffset)}T${template.endTime}`, timeZone)!;
  if (endAt <= startAt) throw new ActionError(400, "end_before_start", MESSAGES.endAfterStart);
  if (endAt.getTime() - startAt.getTime() > MAX_LENGTH_MS) throw new ActionError(400, "too_long", MESSAGES.atMost24Hours);
  return { startAt, endAt };
}
