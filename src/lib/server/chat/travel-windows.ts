import "server-only";

// Issue #227: the coach counts the way to an event as busy time, the same way the calendar's "Leave"
// blocks do. Three things, all server-side (the addresses never go to Claude, only times and minutes):
//   - travelWindows: for each upcoming event with a place, [leave, start), from travelOf. These are
//     busy time for the checks (overlaps_travel) and "leaveBy" in what Claude receives.
//   - awayMinutes: for each goal that happens at a place, how long the way from home takes with the
//     buffer, so Claude leaves enough room around its sessions.
//   - proposalsFitTravel: after Claude's answer, for each proposed session at a goal's place, whether the
//     way from the event before and the way to the event after fit between them.
// The same rules as the calendar: the way and the buffer of the place (src/lib/travel/way.ts), the trip
// starts at the event before or at home, and from 3:00 at night at home again. When the way cannot be
// found (no Google, the daily limit, an unknown address) a safe 30 minutes count instead of nothing.
// Few Google questions: every route once (src/lib/server/routing/by-route.ts) and at most 15 events.
import type { Proposal, TravelWindow } from "@/lib/chat/checks";
import type { SavedPlace } from "@/lib/places/saved";
import type { SettingsData } from "@/lib/settings/types";
import { readBefore, travelOf, tripStart, type TripStart } from "@/lib/server/actions/travel-time";
import type { Query } from "@/lib/server/db";
import { EVENT_COLUMNS, type EventRow } from "@/lib/server/events/rows";
import { readPlaces } from "@/lib/server/places/saved";
import type { Routing } from "@/lib/server/routing/types";
import { localDateOf, startOfLocalDate } from "@/lib/time/zoned";
import { isWebLink } from "@/lib/travel/web-link";
import { calendarWindow } from "./rows";

/** What counts as the way when it cannot be found. */
export const FALLBACK_MINUTES = 30;
/** At most this many upcoming events are asked about, the nearest first (few questions to Google). */
const MAX_EVENTS = 15;
const MINUTE = 60_000;

/** The upcoming timed events with a place (not a web link) and what the trips to them need. */
export type TravelData = { events: EventRow[]; before: Map<string, string[]>; places: SavedPlace[] };

export async function readTravelData(query: Query, now: Date, timeZone: string): Promise<TravelData> {
  const w = calendarWindow(now, timeZone);
  const rows = await query<EventRow>(
    `select ${EVENT_COLUMNS} from app.events
      where not all_day and nullif(btrim(location), '') is not null and end_at > $1::timestamptz and start_at < $2::timestamptz
      order by start_at, id limit 60`,
    [w.from, w.until],
  );
  const events = rows.filter((e) => !isWebLink(e.location ?? "")).slice(0, MAX_EVENTS);
  const [before, places] = await Promise.all([readBefore(query, events.map((e) => e.id), timeZone), readPlaces(query)]);
  return { events, before, places };
}

/** [leave, start) of every upcoming event that has a way, and when to leave for it. */
export async function travelWindows(
  data: TravelData,
  settings: SettingsData,
  routing: Routing,
  now: Date,
): Promise<{ windows: TravelWindow[]; leaveBy: Map<string, Date> }> {
  const windows: TravelWindow[] = [];
  const leaveBy = new Map<string, Date>();
  for (const event of data.events) {
    // An event that may overlap anything blocks nothing; one that has started has no way left.
    if (event.may_overlap || !event.start_at || new Date(event.start_at) <= now) continue;
    const start = tripStart(event, settings, data.places, data.before.get(event.id) ?? []);
    const answer = await travelOf(event, settings, routing, start, data.places);
    if (!answer) continue;
    const startAt = new Date(event.start_at);
    const leaveAt = answer.status === "ok" ? new Date(answer.leaveAt) : new Date(startAt.getTime() - FALLBACK_MINUTES * MINUTE);
    if (leaveAt >= startAt) continue;
    windows.push({ id: event.id, startAt: leaveAt, endAt: startAt });
    leaveBy.set(event.id, leaveAt);
  }
  return { windows, leaveBy };
}

/** goal id -> minutes for the way from home to the goal's place, buffer included (only where it is known). */
export async function awayMinutes(
  goals: readonly { id: string; location: string | null | undefined }[],
  settings: SettingsData,
  places: SavedPlace[],
  routing: Routing,
  at: Date,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const asked = new Map<string, number | null>();
  for (const goal of goals) {
    const location = goal.location?.trim() ?? "";
    if (location === "" || isWebLink(location)) continue;
    const id = location.toLowerCase();
    if (!asked.has(id)) {
      const answer = await travelOf({ start_at: at, all_day: false, location, travel_mode: null }, settings, routing, undefined, places);
      asked.set(id, answer?.status === "ok" ? answer.minutes + answer.bufferMinutes : null);
    }
    const minutes = asked.get(id);
    if (minutes != null) result.set(goal.id, minutes);
  }
  return result;
}

/** A timed thing with a place: an event of the calendar or a proposed session at its goal's place. */
type Located = { key: string; location: string; startAt: Date; endAt: Date; row: Pick<EventRow, "start_at" | "all_day" | "location" | "travel_mode" | "travel_from"> };

/** The last 3:00 at night at or before `instant` in the zone: an event before that is not where a trip starts. */
function lastThreeAm(instant: Date, timeZone: string): Date {
  const day = localDateOf(new Date(instant.getTime() - 3 * 60 * MINUTE), timeZone);
  return new Date(startOfLocalDate(day, timeZone).getTime() + 3 * 60 * MINUTE);
}

const asRow = (location: string, startAt: Date): Located["row"] => ({ start_at: startAt, all_day: false, location, travel_mode: null, travel_from: null });

/**
 * Whether every proposed session at a goal's place has room for the way there (from the event before it,
 * or from home) and the way on to the event after it. `ignore` holds the ids of events the draft moves
 * or deletes. Sessions of goals without a place need no way. True when nothing needs checking.
 */
export async function proposalsFitTravel(
  proposals: readonly Proposal[],
  goalPlaces: ReadonlyMap<string, string>,
  data: TravelData,
  settings: SettingsData,
  routing: Routing,
  ignore: ReadonlySet<string> = new Set(),
): Promise<boolean> {
  const placed: Located[] = proposals.flatMap((p, i) => {
    const location = p.goalId === null ? "" : (goalPlaces.get(p.goalId)?.trim() ?? "");
    return location === "" || isWebLink(location) ? [] : [{ key: `p${i}`, location, startAt: p.startAt, endAt: p.endAt, row: asRow(location, p.startAt) }];
  });
  if (placed.length === 0) return true;
  const existing: Located[] = data.events.flatMap((e) =>
    e.start_at && e.end_at && !ignore.has(e.id) ? [{ key: e.id, location: e.location!.trim(), startAt: new Date(e.start_at), endAt: new Date(e.end_at), row: e }] : [],
  );
  const all = [...existing, ...placed];

  for (const mine of placed) {
    // The way there: from the latest event that ended in the 12 hours before, after 3:00 at night.
    const floor = Math.max(mine.startAt.getTime() - 12 * 60 * MINUTE, lastThreeAm(mine.startAt, settings.timeZone).getTime());
    const prev = all
      .filter((o) => o.key !== mine.key && o.endAt <= mine.startAt && o.endAt.getTime() > floor)
      .sort((a, b) => b.endAt.getTime() - a.endAt.getTime())[0];
    if (prev) {
      const from: TripStart = { label: "Last event", address: prev.location };
      const answer = await travelOf(mine.row, settings, routing, from, data.places);
      if (answer && !room(answer, prev.endAt, mine.startAt)) return false;
    }

    // The way on: to the earliest event that starts after this one, when it starts from here.
    const next = all
      .filter((o) => o.key !== mine.key && o.startAt >= mine.endAt && o.startAt.getTime() < mine.endAt.getTime() + 12 * 60 * MINUTE)
      .filter((o) => mine.endAt.getTime() > lastThreeAm(o.startAt, settings.timeZone).getTime())
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0];
    if (next) {
      const start = tripStart(next.row, settings, data.places, [mine.location]);
      // The next event has its own start (home, a place, an address): then this one is not on its way.
      if (start.label === "Last event") {
        const answer = await travelOf(next.row, settings, routing, start, data.places);
        if (answer && !room(answer, mine.endAt, next.startAt)) return false;
      }
    }
  }
  return true;
}

/** Whether the way (or the safe default, when it is not known) fits between `after` and `before`. */
function room(answer: NonNullable<Awaited<ReturnType<typeof travelOf>>>, after: Date, before: Date): boolean {
  if (answer.status === "ok") return after <= new Date(answer.leaveAt);
  return after.getTime() + FALLBACK_MINUTES * MINUTE <= before.getTime();
}
