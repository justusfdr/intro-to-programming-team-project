import "server-only";

// Data for the week view: the signed-in user's events of one week, grouped by the day they start
// in the user's time zone (R2), with the calculated conflict mark (R10).
import type { AllDayEvent, WeekData, WeekEvent } from "@/lib/events/types";
import { arrangeDays, toAllDayEvent, toWeekEvents } from "@/lib/events/week-view";
import type { Query } from "@/lib/server/db";
import type { Deps } from "@/lib/server/deps";
import { readOutlookState, type OutlookState } from "@/lib/server/outlook/sync";
import { readTimeZone } from "@/lib/server/settings";
import { addDays, dayLabel, isLocalDate, localDateOf, mondayOf, weekOf } from "@/lib/time/zoned";
import { EVENT_COLUMNS, toEventDto, type EventRow } from "./rows";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The week that contains `requested` ("YYYY-MM-DD"; any day of the week), or the current week when
 * it is missing or not a date.
 */
export async function loadWeek(deps: Pick<Deps, "withUser" | "now">, userId: string, requested?: string): Promise<WeekData> {
  return deps.withUser(userId, (query) => readWeek(query, deps.now(), requested, readTimeZone(query), readOutlookState(query)));
}

/**
 * The same inside a transaction that is already open (the calendar page reads everything in one).
 * The time zone and the Outlook state may still be on their way: the caller starts those reads
 * together with its other ones, and the events are read as soon as the time zone is known.
 */
export async function readWeek(
  query: Query,
  now: Date,
  requested: string | undefined,
  timeZoneRead: string | Promise<string>,
  outlookRead: OutlookState | Promise<OutlookState>,
): Promise<WeekData> {
  const timeZone = await timeZoneRead;
  const today = localDateOf(now, timeZone);
  const week = weekOf(requested && isLocalDate(requested) ? requested : today, timeZone);

  // One query for both kinds, so the week costs one round of questions to the database:
  // - timed events: events last at most 24 hours, so loading one day more on each side finds every
  //   event that overlaps an event of this week, also across the week's edges (for the conflict mark);
  // - all-day events covering any day of the week (R2: each day from the first to the last); they get
  //   no conflict mark (R29).
  // Timed ones come first, by start, end, id; then all-day ones by first day, last day (longest first), title, id.
  const [both, outlook] = await Promise.all([
    query<EventRow>(
      `select ${EVENT_COLUMNS} from app.events
        where (not all_day and start_at >= $1 and start_at < $2)
           or (all_day and first_day <= $4::date and last_day >= $3::date)
        order by all_day,
                 case when not all_day then start_at end,
                 case when not all_day then end_at end,
                 case when all_day then first_day end,
                 case when all_day then last_day end desc,
                 case when all_day then title end,
                 id`,
      [new Date(week.startsAt.getTime() - DAY_MS), new Date(week.endsAt.getTime() + DAY_MS), week.monday, week.days[6]],
    ),
    outlookRead,
  ]);
  // R26: while connected, an app event that has not ended and that Outlook does not have yet.
  // Demo events are never sent (spec 13), so they are never "not sent" either.
  const notSent = (row: EventRow) =>
    outlook.status !== "none" &&
    row.source !== "outlook" &&
    !row.demo &&
    !row.in_outlook &&
    (row.all_day ? row.last_day! >= today : new Date(row.end_at!).getTime() > now.getTime());
  const rows = both.filter((row) => !row.all_day);
  const allDayRows = both.filter((row) => row.all_day);
  const events = rows.map((row) => ({ ...toEventDto(row), notSent: notSent(row) })).map((e) => ({ ...e, allDay: false as const, startAt: e.startAt!, endAt: e.endAt! }));
  const shown: WeekEvent[] = toWeekEvents(events, timeZone);
  const allDay: AllDayEvent[] = allDayRows.map((row) => toAllDayEvent({ ...toEventDto(row), notSent: notSent(row) }));

  return {
    timeZone,
    outlook,
    monday: week.monday,
    previous: addDays(week.monday, -7),
    next: addDays(week.monday, 7),
    thisWeek: mondayOf(today),
    // A timed event belongs to the day it starts; an all-day event to each of its days (R2).
    days: arrangeDays(
      week.days.map((date) => ({ date, label: dayLabel(date), isToday: date === today })),
      shown,
      allDay,
    ),
  };
}
