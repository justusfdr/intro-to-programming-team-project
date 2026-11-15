import "server-only";

// Action event_place (spec 35, R27): where one of the user's events takes place, for the map in the
// event preview. The same checks as travel_time next to it, and the same address look-up: the shared
// queue and the 6-hour memory of the routing module (routing/osm.ts), so a place the travel time already
// found costs nothing more. Nothing is saved.
//   1. same-origin check   2. signed in (R3)   3. the user's event ("Not found" otherwise, R3)
//   4. at most 60 questions per user per minute   5. outside the database: find the address.
// The answer has exactly one of four shapes, with only these keys:
//   { status: "found", lat, lon }   { status: "none" }   { status: "not_found" }   { status: "unavailable" }
// "none": no location, or one that is a web link (an online meeting): there is nothing to look up.
import { MESSAGES } from "@/lib/messages";
import { placeOf } from "@/lib/events/preview";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { notFound } from "@/lib/server/events/own-event";
import { assertSameOrigin, jsonOk } from "@/lib/server/http";
import { createLimiter, takeAll } from "@/lib/server/rate-limit";
import { osmRouting } from "@/lib/server/routing/osm";
import type { Routing } from "@/lib/server/routing/types";
import { requireUser } from "@/lib/server/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PlaceAnswer = { status: "found"; lat: number; lon: number } | { status: "none" | "not_found" | "unavailable" };

/** At most 60 place questions per user per minute, in this server's memory only (see rate-limit.ts). */
const questions = createLimiter({ limit: 60, windowMs: 60_000 });

/** A position from the routing module, kept only when it is a real place, rounded to about 1 m. */
function found(point: { lat: number; lon: number } | null): PlaceAnswer {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return { status: "not_found" };
  if (Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180) return { status: "not_found" };
  return { status: "found", lat: Math.round(point.lat * 1e5) / 1e5, lon: Math.round(point.lon * 1e5) / 1e5 };
}

export function eventPlace(
  request: Request,
  deps: Pick<Deps, "auth" | "withUser" | "now">,
  id: string,
  routing: Routing = osmRouting(),
): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    if (!UUID.test(id)) throw notFound();

    // Only reading the location; the database is left before the slow question to the address service.
    const location = await deps.withUser(userId, async (query) => {
      const [row] = await query<{ location: string | null }>("select location from app.events where id = $1", [id]);
      if (!row) throw notFound();
      return row.location;
    });

    const place = placeOf(location);
    if (place.kind !== "address") return jsonOk({ status: "none" } satisfies PlaceAnswer);
    if (!takeAll([[questions, userId]], deps.now().getTime())) throw new ActionError(429, "too_many_places", MESSAGES.placesTooMany);

    try {
      return jsonOk(found(await routing.geocode(place.text)));
    } catch {
      // The address service cannot be reached: the panel shows the address as text.
      return jsonOk({ status: "unavailable" } satisfies PlaceAnswer);
    }
  });
}
