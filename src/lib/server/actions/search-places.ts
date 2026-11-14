import "server-only";

// Action search_places: address suggestions for the home address in settings (and with kind=city, cities
// for the time zone). The browser asks us, we ask
// the OpenStreetMap-based Photon service (so the service never sees the user's browser, and we set a
// clear name for our app). Nothing is saved. Signed in only, to keep strangers from using it.
// Each user may search at most 30 times a minute, so nobody can flood the free services through us.
import { MESSAGES } from "@/lib/messages";
import { citiesFrom, confirmedFrom, fitsTyped, suggestionsFrom } from "@/lib/places/places";
import { timeZoneAt } from "@/lib/server/places/time-zone";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk } from "@/lib/server/http";
import { inNominatimQueue } from "@/lib/server/routing/osm";
import { createLimiter, takeAll } from "@/lib/server/rate-limit";
import { requireUser } from "@/lib/server/session";

const PHOTON = "https://photon.komoot.io/api/";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
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

    const ask = async (url: string): Promise<unknown> => {
      try {
        const response = await fetchImpl(url, { headers: { "User-Agent": "LockedIn-student-project" }, signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new Error(String(response.status));
        return await response.json();
      } catch {
        throw new ActionError(502, "places_unavailable", MESSAGES.placesUnavailable);
      }
    };

    // kind=city: cities for the time zone in the settings, each with the time zone at its position (a city
    // whose time zone is not known is left out). Unlike for addresses, the results are not filtered by
    // fitsTyped: the service also knows a city by its name in other languages ("Tokio", "Lissabon",
    // "München"), and answers in English ("Tokyo, Japan"), so the typed word is often not in the label.
    if (new URL(request.url).searchParams.get("kind") === "city") {
      const answer = await ask(`${PHOTON}?${new URLSearchParams({ q: query, limit: "8", lang: "en", layer: "city" })}`);
      const places = citiesFrom(answer).flatMap((place) => {
        const timeZone = timeZoneAt(place.lat, place.lon);
        return timeZone ? [{ ...place, timeZone }] : [];
      });
      return jsonOk({ places });
    }

    // "Confirm": one exact look-up. Nominatim first; Photon if it finds nothing or does not answer (down,
    // or too many questions). Nominatim allows one question per second, so this waits its turn in the
    // same queue as the travel times.
    if (new URL(request.url).searchParams.get("mode") === "confirm") {
      const url = `${NOMINATIM}?${new URLSearchParams({ q: query, format: "jsonv2", addressdetails: "1", limit: "3" })}`;
      const nominatim = await inNominatimQueue(() => ask(url)).catch(() => null);
      const exact = nominatim === null ? null : confirmedFrom(nominatim, query);
      if (exact) return jsonOk({ places: [exact] });
    }
    const answer = await ask(`${PHOTON}?${new URLSearchParams({ q: query, limit: "8", lang: "en" })}`);
    // Only suggestions that fit what was typed (see fitsTyped).
    return jsonOk({ places: suggestionsFrom(answer).filter((place) => fitsTyped(place.label, query)) });
  });
}
