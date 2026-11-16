import "server-only";

// Action travel_time (R27): when to leave for one of the user's events. Nothing is saved; the answer is
// calculated each time (the routing may reuse a result for up to 6 hours).
//   1. same-origin check   2. signed in (R3)   3. read the event ("Not found" otherwise, R3) and the settings
//   4. outside the database: find both addresses, ask for the trip   5. one answer per outcome.
// The way of getting there is the event's own travel_mode, or else the standard from the settings.
// The trip starts where the event's travel_from says (src/lib/places/saved.ts): home, a saved place, an
// address typed for this event, or the place of the event before it. The standard (empty) is the place
// of the event before it, else home. "The event before" is the latest timed event that ended in the
// 12 hours before this one starts and has an address (not a web link).
// leave_at = start − travel minutes − buffer. By public transport, the trip is the latest one that
// arrives in time, so leave_at = its departure − buffer.
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import type { TravelMode } from "@/lib/settings/types";
import type { SettingsData } from "@/lib/settings/types";
import type { TravelAnswer } from "@/lib/travel/types";
import { canTravel, isWebLink } from "@/lib/travel/web-link";
import type { Deps } from "@/lib/server/deps";
import { handleAction } from "@/lib/server/errors";
import { notFound } from "@/lib/server/events/own-event";
import { EVENT_COLUMNS, type EventRow } from "@/lib/server/events/rows";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { googleMapsBrowserKey } from "@/lib/server/config";
import { routeMapUrl } from "@/lib/server/google/map";
import { googleRouting } from "@/lib/server/google/routes";
import type { Routing } from "@/lib/server/routing/types";
import { requireUser } from "@/lib/server/session";
import { readSettings } from "@/lib/server/settings";
import { readPlaces } from "@/lib/server/places/saved";
import type { Query } from "@/lib/server/db";
import { travelFromOf, type SavedPlace } from "@/lib/places/saved";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export { isWebLink };

/**
 * The travel answer for one event row, or null when it can have none (no location, a web link, all-day).
 * Never throws: a routing service that cannot be reached is "Travel time not available".
 */
export async function travelOf(event: EventRow, settings: SettingsData, routing: Routing, start?: TripStart): Promise<TravelAnswer | null> {
  const location = event.location?.trim() ?? "";
  if (!event.start_at || !canTravel({ allDay: event.all_day, location })) return null;

  const mode: TravelMode = event.travel_mode ?? settings.travelMode;
  const from = start ?? { label: "Home", address: settings.homeAddress.trim() };
  if (from.address === "") return { status: "no_home", mode, message: MESSAGES.addHomeAddress };
  try {
    const home = await routing.geocode(from.address);
    const there = await routing.geocode(location);
    if (!home || !there) return { status: "not_found", mode, message: MESSAGES.addressNotFound };
    const trip = await routing.trip(mode, home, there, new Date(event.start_at));
    if (!trip) return { status: "unavailable", mode, message: MESSAGES.travelUnavailable };
    const buffer = settings.travelBufferMinutes;
    const leaveAt = new Date(trip.departAt.getTime() - buffer * 60_000);
    return { status: "ok", mode, minutes: trip.minutes, bufferMinutes: buffer, leaveAt: leaveAt.toISOString(), from: from.label };
  } catch {
    // A routing service that cannot be reached changes nothing; the event stays as it is.
    return { status: "unavailable", mode, message: MESSAGES.travelUnavailable };
  }
}

export function travelTime(request: Request, deps: Pick<Deps, "auth" | "withUser">, id: string, routing: Routing = googleRouting()): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    if (!UUID.test(id)) throw notFound();

    // Only reading, and the database is left before the slow questions to the routing services.
    const { event, settings, start } = await deps.withUser(userId, async (query) => {
      const [row] = await query<EventRow>(`select ${EVENT_COLUMNS} from app.events where id = $1`, [id]);
      if (!row) throw notFound();
      const [settings, places, before] = await Promise.all([readSettings(query), readPlaces(query), readBefore(query, [row.id])]);
      return { event: row, settings, start: tripStart(row, settings, places, before.get(row.id) ?? []) };
    });
    const travel = await travelOf(event, settings, routing, start);
    // For one event (the editor), the map of the way too, when there is a time to leave.
    const map = travel?.status === "ok" ? routeMapUrl(start.address, event.location ?? "", travel.mode, googleMapsBrowserKey()) : null;
    return jsonOk({ travel: travel && map && travel.status === "ok" ? { ...travel, map } : travel });
  });
}

/** At most this many events per question (a week view has far fewer with a location). */
const MAX_EVENTS = 100;
const TravelBody = z.strictObject({ ids: z.array(z.string().max(40)).max(MAX_EVENTS) });

/**
 * Action travel_times: the travel answers for several of the user's events at once, for the calendar's
 * travel blocks (R27). Ids of other users' events or unknown ids are left out of the answer (R3), as are
 * events that can have no travel time. Nothing is saved.
 */
export function travelTimes(request: Request, deps: Pick<Deps, "auth" | "withUser">, routing: Routing = googleRouting()): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    const body = await readJson(request, TravelBody);
    if (!body.ok) return body.response;
    const ids = [...new Set(body.data.ids.filter((id) => UUID.test(id)))];

    const { events, settings, places, before } = await deps.withUser(userId, async (query) => ({
      events: ids.length === 0 ? [] : await query<EventRow>(`select ${EVENT_COLUMNS} from app.events where id = any($1::uuid[])`, [ids]),
      settings: await readSettings(query),
      places: await readPlaces(query),
      before: await readBefore(query, ids),
    }));

    // One after the other, so one week view does not send a burst of questions to Google; most are kept.
    const travel: Record<string, TravelAnswer> = {};
    for (const event of events) {
      const answer = await travelOf(event, settings, routing, tripStart(event, settings, places, before.get(event.id) ?? []));
      if (answer) travel[event.id] = answer;
    }
    return jsonOk({ travel });
  });
}

/** Where a trip starts: its address (empty when there is none) and what it is called. */
export type TripStart = { label: string; address: string };

/**
 * For each of these events, the addresses of the timed events that ended in the 12 hours before it
 * starts, latest first (at most 5): the first that is no web link is "the event before".
 */
async function readBefore(query: Query, ids: string[]): Promise<Map<string, string[]>> {
  if (ids.length === 0) return new Map();
  const rows = await query<{ id: string; locations: string[] | null }>(
    `select e.id, array(
        select p.location from app.events p
         where p.id <> e.id and not p.all_day and p.end_at <= e.start_at and p.end_at > e.start_at - interval '12 hours'
           and nullif(btrim(p.location), '') is not null
         order by p.end_at desc limit 5) as locations
       from app.events e where e.id = any($1::uuid[]) and not e.all_day`,
    [ids],
  );
  return new Map(rows.map((r) => [r.id, r.locations ?? []]));
}

/** Where the trip to this event starts, from its travel_from (src/lib/places/saved.ts). */
export function tripStart(event: Pick<EventRow, "travel_from">, settings: SettingsData, places: SavedPlace[], before: string[]): TripStart {
  const home: TripStart = { label: "Home", address: settings.homeAddress.trim() };
  const from = travelFromOf(event.travel_from);
  const last = before.map((l) => l.trim()).find((l) => l !== "" && !isWebLink(l));
  if (from?.kind === "home") return home;
  if (from?.kind === "address") return { label: "Other address", address: from.address };
  if (from?.kind === "place") {
    const place = places.find((p) => p.id === from.id);
    // A place that was deleted since: the standard.
    if (place) return { label: place.name, address: place.address };
  }
  if (from?.kind === "last") return last ? { label: "Last event", address: last } : home;
  return last ? { label: "Last event", address: last } : home;
}
