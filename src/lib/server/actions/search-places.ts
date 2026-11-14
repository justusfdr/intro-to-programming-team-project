import "server-only";

// Action search_places: address suggestions for the home address in settings. The browser asks us, we ask
// the OpenStreetMap-based Photon service (so the service never sees the user's browser, and we set a
// clear name for our app). Nothing is saved. Signed in only, to keep strangers from using it.
import { MESSAGES } from "@/lib/messages";
import { confirmedFrom, fitsTyped, suggestionsFrom } from "@/lib/places/places";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

const PHOTON = "https://photon.komoot.io/api/";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const MIN_CHARS = 3;
const MAX_CHARS = 200;

export function searchPlaces(request: Request, deps: Pick<Deps, "auth">, fetchImpl: typeof fetch = fetch): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    await requireUser(deps.auth);

    const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
    // Too short or too long to search: no suggestions, and the service is not asked.
    if ([...query].length < MIN_CHARS || [...query].length > MAX_CHARS) return jsonOk({ places: [] });

    const ask = async (url: string): Promise<unknown> => {
      try {
        const response = await fetchImpl(url, { headers: { "User-Agent": "LockedIn-student-project" }, signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new Error(String(response.status));
        return await response.json();
      } catch {
        throw new ActionError(502, "places_unavailable", MESSAGES.placesUnavailable);
      }
    };

    // "Confirm": one exact look-up. Nominatim first; Photon only if it finds nothing.
    if (new URL(request.url).searchParams.get("mode") === "confirm") {
      const exact = confirmedFrom(await ask(`${NOMINATIM}?${new URLSearchParams({ q: query, format: "jsonv2", addressdetails: "1", limit: "3" })}`), query);
      if (exact) return jsonOk({ places: [exact] });
    }
    const answer = await ask(`${PHOTON}?${new URLSearchParams({ q: query, limit: "8", lang: "en" })}`);
    // Only suggestions that fit what was typed (see fitsTyped).
    return jsonOk({ places: suggestionsFrom(answer).filter((place) => fitsTyped(place.label, query)) });
  });
}
