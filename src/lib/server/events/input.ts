import "server-only";

// The checks shared by create_event and edit_event (ontology section 5, R28, R29), in the
// ontology's order: title; for a timed event end after start and at most 24 hours; for an all-day
// event last day not before first, at most 31 days, no goal; for a series the end date and at most
// 100 dates. Each throws the ontology's message.
import { z } from "zod";
import { repeatDates, type RepeatRule, type Weekday } from "@/lib/events/repeat";
import { MESSAGES } from "@/lib/messages";
import { ActionError } from "@/lib/server/errors";
import { isLocalDate, parseLocalDateTime, type LocalDate } from "@/lib/time/zoned";

/**
 * The body shape. A timed event sends `start` and `end` as a datetime-local field does
 * ("2026-11-16T09:00", in the user's time zone); an all-day event sends `allDay: true` with
 * `firstDay` and `lastDay` ("2026-11-16"). Only a new timed event may send `repeat`.
 */
export const EventFields = z.object({
  title: z.string().max(1000),
  start: z.string().max(32).optional(),
  end: z.string().max(32).optional(),
  allDay: z.boolean().optional(),
  firstDay: z.string().max(10).optional(),
  lastDay: z.string().max(10).optional(),
  mayOverlap: z.boolean().optional(),
  /** The goal of the event, or null for none. Checked against the user's goals by the action (R3). */
  goalId: z.string().max(40).nullable().optional(),
  repeat: z
    .object({
      frequency: z.enum(["daily", "weekly", "monthly"]),
      weekdays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
      until: z.string().max(10),
    })
    .nullable()
    .optional(),
});

type Fields = z.infer<typeof EventFields>;

/**
 * A checked timed event. mayOverlap and goalId are undefined when the body leaves them out:
 * create_event then uses the defaults (false, no goal), edit_event keeps what the event has.
 */
export type CheckedTimed = {
  allDay: false;
  title: string;
  startAt: Date;
  endAt: Date;
  mayOverlap: boolean | undefined;
  goalId: string | null | undefined;
};

/** A checked all-day event: days only, no times, no goal (R29). */
export type CheckedAllDay = { allDay: true; title: string; firstDay: LocalDate; lastDay: LocalDate };

export type CheckedEvent = CheckedTimed | CheckedAllDay;

const MAX_LENGTH_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const badRequest = () => new ActionError(400, "bad_request", MESSAGES.badRequest);

function checkTitle(fields: Fields): string {
  const title = fields.title.trim();
  const length = [...title].length;
  if (length < 1 || length > 100) throw new ActionError(400, "title_length", MESSAGES.titleLength);
  return title;
}

/** Checks one event's fields and turns local times into instants in `timeZone`. */
export function checkEventFields(fields: Fields, timeZone: string): CheckedEvent {
  const title = checkTitle(fields);

  if (fields.allDay) {
    if (!fields.firstDay || !fields.lastDay || !isLocalDate(fields.firstDay) || !isLocalDate(fields.lastDay)) throw badRequest();
    if (fields.lastDay < fields.firstDay) throw new ActionError(400, "last_day_before_first", MESSAGES.lastDayBeforeFirst);
    const days = Math.round((Date.parse(fields.lastDay) - Date.parse(fields.firstDay)) / DAY_MS) + 1;
    if (days > 31) throw new ActionError(400, "too_many_days", MESSAGES.atMost31Days);
    if (fields.goalId) throw new ActionError(400, "all_day_goal", MESSAGES.allDayNoGoal);
    return { allDay: true, title, firstDay: fields.firstDay, lastDay: fields.lastDay };
  }

  const startAt = fields.start ? parseLocalDateTime(fields.start, timeZone) : null;
  const endAt = fields.end ? parseLocalDateTime(fields.end, timeZone) : null;
  if (!startAt || !endAt) throw badRequest();
  if (endAt <= startAt) throw new ActionError(400, "end_before_start", MESSAGES.endAfterStart);
  if (endAt.getTime() - startAt.getTime() > MAX_LENGTH_MS) throw new ActionError(400, "too_long", MESSAGES.atMost24Hours);
  return { allDay: false, title, startAt, endAt, mayOverlap: fields.mayOverlap, goalId: fields.goalId };
}

/**
 * The dates of a new series (R28), or null when the body asks for no repeat. Call it after
 * checkEventFields; `first` is the local date the event starts on.
 */
export function checkRepeat(fields: Fields, first: LocalDate): LocalDate[] | null {
  if (!fields.repeat) return null;
  // R29: all-day events never repeat; the form does not offer it.
  if (fields.allDay || !isLocalDate(fields.repeat.until)) throw badRequest();
  if (fields.repeat.until < first) throw new ActionError(400, "until_before_first", MESSAGES.untilBeforeFirst);
  const rule: RepeatRule = {
    frequency: fields.repeat.frequency,
    weekdays: (fields.repeat.weekdays ?? []) as Weekday[],
    until: fields.repeat.until,
  };
  const dates = repeatDates(first, rule);
  if (dates === "too_many") throw new ActionError(400, "too_many_dates", MESSAGES.tooManyDates);
  return dates;
}
