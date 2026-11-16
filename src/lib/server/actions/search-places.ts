import "server-only";

// Action search_places: address suggestions for the home address in settings and an event's location (and
// with kind=city, cities for the time zone). The browser asks us, we ask Google's Places API (so the service
// never sees the user's browser, and the key stays on the server). Nothing is saved. Signed in only, to
// keep strangers from using it. Each user may search at most 30 times a minute, so nobody can run up the
// bill through us.
import { MESSAGES } from "@/lib/messages";
import { googleMapsServerKey } from "@/lib/server/config";
import { GoogleUnavailableError, lookUpPlace, suggestPlaces } from "@/lib/server/google/places";
import { timeZoneAt } from "@/lib/server/places/time-zone";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk } from "@/lib/server/http";
import { createLimiter, takeAll } from "@/lib/server/rate-limit";
import { requireUser } from "@/lib/server/session";

const MIN_CHARS = 3;
const MAX_CHARS = 200;

/** At most 30 searches per user per minute, in this server's memory only (see rate-limit.ts). */
const searches = createLimiter({ limit: 30, windowMs: 60_000 });

/** Counts one search for the user, or refuses it when they already searched 30 times in the last minute. */
function countSearch(userId: string, now: number): void {
  if (!takeAll([[searches, userId]], now)) throw new ActionError(429, "too_many_searches", MESSAGES.placesTooMany);
}

export function searchPlaces(request: Request, deps: Pick<Deps, "auth" | "now">, fetchImpl: typeof fetch = fetch): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);

    const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
    // Too short or too long to search: no suggestions, and the service is not asked.
    if ([...query].length < MIN_CHARS || [...query].length > MAX_CHARS) return jsonOk({ places: [] });
    countSearch(userId, deps.now().getTime());

    const params = new URL(request.url).searchParams;
    const kind = params.get("kind") === "city" ? "city" : "address";
    const exact = params.get("mode") === "confirm";
    let found;
    try {
      // "Confirm" is one exact look-up with the position; otherwise the suggestions while typing.
      const search = { kind, key: googleMapsServerKey(), fetchImpl } as const;
      found = exact ? await lookUpPlace(query, search) : await suggestPlaces(query, search);
    } catch (error) {
      if (error instanceof GoogleUnavailableError) throw new ActionError(502, "places_unavailable", MESSAGES.placesUnavailable);
      throw error;
    }

    // A city that is looked up exactly comes with the time zone at its position (a city whose time zone
    // is not known is left out). The suggestions while typing have no position and no time zone yet.
    if (kind === "city" && exact) {
      const places = found.flatMap((place) => {
        const timeZone = place.lat === undefined || place.lon === undefined ? null : timeZoneAt(place.lat, place.lon);
        return timeZone ? [{ ...place, timeZone }] : [];
      });
      return jsonOk({ places });
    }
    return jsonOk({ places: found });
  });
}
