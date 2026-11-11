import "server-only";

// Data for the week view: the signed-in user's events of one week, grouped by the day they start
// in the user's time zone (R2), with the calculated conflict mark (R10).
import { conflictIds } from "@/lib/events/conflicts";
import type { WeekData, WeekEvent } from "@/lib/events/types";
import type { Deps } from "@/lib/server/deps";
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
    const today = localDateOf(deps.now(), timeZone);
    const week = weekOf(requested && isLocalDate(requested) ? requested : today, timeZone);

    // Events last at most 24 hours, so loading one day more on each side finds every event that
    // overlaps an event of this week, also across the week's edges (for the conflict mark).
    const rows = await query<EventRow>(
      `select ${EVENT_COLUMNS} from app.events
        where start_at >= $1 and start_at < $2
        order by start_at, end_at, id`,
      [new Date(week.startsAt.getTime() - DAY_MS), new Date(week.endsAt.getTime() + DAY_MS)],
    );
    const events = rows.map(toEventDto);
    const marked = conflictIds(
      events.map((e) => ({ id: e.id, startAt: new Date(e.startAt), endAt: new Date(e.endAt), mayOverlap: e.mayOverlap })),
    );

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
      monday: week.monday,
      previous: addDays(week.monday, -7),
      next: addDays(week.monday, 7),
      thisWeek: mondayOf(today),
      days: week.days.map((date) => ({
        date,
        label: dayLabel(date),
        isToday: date === today,
        // An event belongs to the day it starts (R2).
        events: shown.filter((e) => e.startLocal.slice(0, 10) === date),
      })),
    };
  });
}
