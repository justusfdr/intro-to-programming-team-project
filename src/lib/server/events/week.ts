import "server-only";

// Data for the week view: the signed-in user's events of one week, grouped by the day they start
// in the user's time zone (R2), with the calculated conflict mark (R10).
import { conflictIds } from "@/lib/events/conflicts";
import type { AllDayEvent, WeekData, WeekEvent } from "@/lib/events/types";
import type { Deps } from "@/lib/server/deps";
import { readOutlookState } from "@/lib/server/outlook/sync";
import { readTimeZone } from "@/lib/server/settings";
import { addDays, dayLabel, isLocalDate, localDateOf, localDateTimeOf, localTimeOf, mondayOf, weekOf } from "@/lib/time/zoned";
import { EVENT_COLUMNS, toEventDto, type EventRow } from "./rows";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The week that contains `requested` ("YYYY-MM-DD"; any day of the week), or the current week when
 * it is missing or not a date.
 */
export async function loadWeek(deps: Pick<Deps, "withUser" | "now">, userId: string, requested?: string): Promise<WeekData> {
  return deps.withUser(userId, async (query) => {
    const timeZone = await readTimeZone(query);
    const now = deps.now();
    const today = localDateOf(now, timeZone);
    const outlook = await readOutlookState(query);
    // R26: while connected, an app event that has not ended and that Outlook does not have yet.
    // Demo events are never sent (spec 13), so they are never "not sent" either.
    const notSent = (row: EventRow) =>
      outlook.status !== "none" &&
      row.source !== "outlook" &&
      !row.demo &&
      !row.in_outlook &&
      (row.all_day ? row.last_day! >= today : new Date(row.end_at!).getTime() > now.getTime());
    const week = weekOf(requested && isLocalDate(requested) ? requested : today, timeZone);

    // Events last at most 24 hours, so loading one day more on each side finds every event that
    // overlaps an event of this week, also across the week's edges (for the conflict mark).
    // Only timed events have a start (all-day events are read below and get no conflict mark, R29).
    const rows = await query<EventRow>(
      `select ${EVENT_COLUMNS} from app.events
        where not all_day and start_at >= $1 and start_at < $2
        order by start_at, end_at, id`,
      [new Date(week.startsAt.getTime() - DAY_MS), new Date(week.endsAt.getTime() + DAY_MS)],
    );
    const events = rows.map((row) => ({ ...toEventDto(row), notSent: notSent(row) })).map((e) => ({ ...e, allDay: false as const, startAt: e.startAt!, endAt: e.endAt! }));
    const marked = conflictIds(
      events.map((e) => ({ id: e.id, startAt: new Date(e.startAt), endAt: new Date(e.endAt), mayOverlap: e.mayOverlap })),
    );

    // All-day events covering any day of the week (R2: each day from the first to the last).
    const allDayRows = await query<EventRow>(
      `select ${EVENT_COLUMNS} from app.events
        where all_day and first_day <= $2::date and last_day >= $1::date
        order by first_day, last_day desc, title, id`,
      [week.monday, week.days[6]],
    );
    const allDay: AllDayEvent[] = allDayRows.map((row) => ({ ...toEventDto(row), notSent: notSent(row) })).map((e) => ({
      id: e.id,
      title: e.title,
      allDay: true as const,
      firstDay: e.firstDay!,
      lastDay: e.lastDay!,
      mayOverlap: e.mayOverlap,
      status: e.status,
      goalId: e.goalId,
      seriesId: e.seriesId,
      source: e.source,
      location: e.location,
      notSent: e.notSent,
      updatedAt: e.updatedAt,
    }));

    const shown: WeekEvent[] = events.map((e) => {
      const start = new Date(e.startAt);
      const end = new Date(e.endAt);
      const endDay = localDateOf(end, timeZone);
      return {
        ...e,
        conflict: marked.has(e.id),
        startTime: localTimeOf(start, timeZone),
        endTime: localTimeOf(end, timeZone),
        endDay: endDay === localDateOf(start, timeZone) ? null : endDay,
        startLocal: localDateTimeOf(start, timeZone),
        endLocal: localDateTimeOf(end, timeZone),
      };
    });

    return {
      timeZone,
      outlook,
      monday: week.monday,
      previous: addDays(week.monday, -7),
      next: addDays(week.monday, 7),
      thisWeek: mondayOf(today),
      days: week.days.map((date) => ({
        date,
        label: dayLabel(date),
        isToday: date === today,
        // A timed event belongs to the day it starts; an all-day event to each of its days (R2).
        events: shown.filter((e) => e.startLocal.slice(0, 10) === date),
        allDay: allDay.filter((e) => e.firstDay <= date && date <= e.lastDay),
      })),
    };
  });
}
