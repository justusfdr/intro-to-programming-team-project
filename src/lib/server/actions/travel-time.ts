import "server-only";

// Action travel_time (R27): when to leave for one of the user's events. Nothing is saved; the answer is
// calculated each time (the routing may reuse a result for up to 6 hours).
//   1. same-origin check   2. signed in (R3)   3. read the event ("Not found" otherwise, R3) and the settings
//   4. outside the database: find both addresses, ask for the trip   5. one answer per outcome.
// The way of getting there is the event's own travel_mode, or else the standard from the settings.
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export { isWebLink };

/**
 * The travel answer for one event row, or null when it can have none (no location, a web link, all-day).
 * Never throws: a routing service that cannot be reached is "Travel time not available".
 */
export async function travelOf(event: EventRow, settings: SettingsData, routing: Routing): Promise<TravelAnswer | null> {
  const location = event.location?.trim() ?? "";
  if (!event.start_at || !canTravel({ allDay: event.all_day, location })) return null;

  const mode: TravelMode = event.travel_mode ?? settings.travelMode;
  if (settings.homeAddress.trim() === "") return { status: "no_home", mode, message: MESSAGES.addHomeAddress };
  try {
    const home = await routing.geocode(settings.homeAddress);
    const there = await routing.geocode(location);
    if (!home || !there) return { status: "not_found", mode, message: MESSAGES.addressNotFound };
    const trip = await routing.trip(mode, home, there, new Date(event.start_at));
    if (!trip) return { status: "unavailable", mode, message: MESSAGES.travelUnavailable };
    const buffer = settings.travelBufferMinutes;
    const leaveAt = new Date(trip.departAt.getTime() - buffer * 60_000);
    return { status: "ok", mode, minutes: trip.minutes, bufferMinutes: buffer, leaveAt: leaveAt.toISOString() };
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
    const { event, settings } = await deps.withUser(userId, async (query) => {
      const [row] = await query<EventRow>(`select ${EVENT_COLUMNS} from app.events where id = $1`, [id]);
      if (!row) throw notFound();
      return { event: row, settings: await readSettings(query) };
    });
    const travel = await travelOf(event, settings, routing);
    // For one event (the editor), the map of the way too, when there is a time to leave.
    const map = travel?.status === "ok" ? routeMapUrl(settings.homeAddress, event.location ?? "", travel.mode, googleMapsBrowserKey()) : null;
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

    const { events, settings } = await deps.withUser(userId, async (query) => ({
      events: ids.length === 0 ? [] : await query<EventRow>(`select ${EVENT_COLUMNS} from app.events where id = any($1::uuid[])`, [ids]),
      settings: await readSettings(query),
    }));

    // One after the other, so one week view does not send a burst of questions to Google; most are kept.
    const travel: Record<string, TravelAnswer> = {};
    for (const event of events) {
      const answer = await travelOf(event, settings, routing);
      if (answer) travel[event.id] = answer;
    }
    return jsonOk({ travel });
  });
}
