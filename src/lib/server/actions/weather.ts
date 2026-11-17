import "server-only";

// Action weather (spec 45, R47): the weather for the place the user is at. Reads only; nothing is saved.
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the body: nothing, or both coordinates
//   4. the place, in this order: the device's location (only when the browser sent it), the place of the
//      timed event happening now or the last one that ended today (not a web link), the home address
//   5. addresses become coordinates with the routing service already used for R27 (outside the database)
//   6. only the coordinates, rounded to two decimals (about 1 km), go to the weather service
// The device's coordinates are never saved and never logged. Without a reverse look-up (Google's Geocoding
// API is not what the routing module uses; it uses the Places API), a device place is called "Your location".
import { z } from "zod";
import type { Query } from "@/lib/server/db";
import type { Deps } from "@/lib/server/deps";
import { handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { googleRouting } from "@/lib/server/google/routes";
import type { Point, Routing } from "@/lib/server/routing/types";
import { requireUser } from "@/lib/server/session";
import { readSettings } from "@/lib/server/settings";
import { openMeteo } from "@/lib/server/weather/open-meteo";
import type { WeatherService } from "@/lib/server/weather/types";
import { startOfLocalDate, localDateOf } from "@/lib/time/zoned";
import { isWebLink } from "@/lib/travel/web-link";
import { roundCoordinate, type WeatherAnswer, type WeatherSource } from "@/lib/widgets/weather";

const MAX_LABEL = 30;

/** The two answers without a weather (R47). */
export const WEATHER_NO_PLACE = "Add your home address";
export const WEATHER_UNAVAILABLE = "Weather not available";

const WeatherBody = z
  .strictObject({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) })
  .partial()
  .refine((body) => (body.lat === undefined) === (body.lon === undefined));

/** "Library, Campus Carcavelos" → "Library": the text before the first comma, at most 30 characters. */
export function eventPlaceLabel(location: string): string {
  const first = location.split(",")[0].trim() || location.trim();
  return [...first].slice(0, MAX_LABEL).join("").trim();
}

type Candidate = { source: WeatherSource; label: string; address: string };

export function weather(
  request: Request,
  deps: Pick<Deps, "auth" | "withUser" | "now">,
  routing: Routing = googleRouting(),
  service: WeatherService = openMeteo(),
): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, WeatherBody);
    if (!body.ok) return body.response;
    const { lat, lon } = body.data;

    let point: Point | null = null;
    let source: WeatherSource = "device";
    let label = "Your location";

    if (lat !== undefined && lon !== undefined) {
      point = { lat, lon };
    } else {
      // Only reading, and the database is left before the slow questions to the routing service.
      const candidates = await deps.withUser(userId, (query) => readCandidates(query, deps.now()));
      let routingDown = false;
      for (const candidate of candidates) {
        try {
          const found = await routing.geocode(candidate.address);
          if (found) {
            point = found;
            source = candidate.source;
            label = candidate.label;
            break;
          }
        } catch {
          routingDown = true;
        }
      }
      if (!point) {
        const answer: WeatherAnswer =
          candidates.length > 0 && routingDown
            ? { status: "unavailable", message: WEATHER_UNAVAILABLE }
            : { status: "no_place", message: WEATHER_NO_PLACE };
        return jsonOk(answer);
      }
    }

    const forecast = await service.forecast(roundCoordinate(point.lat), roundCoordinate(point.lon));
    if (!forecast) return jsonOk({ status: "unavailable", message: WEATHER_UNAVAILABLE } satisfies WeatherAnswer);
    return jsonOk({ status: "ok", weather: { place: label, source, ...forecast } } satisfies WeatherAnswer);
  });
}

/** The places to try, best first: the event on now, the last one that ended today, then home. */
async function readCandidates(query: Query, now: Date): Promise<Candidate[]> {
  const settings = await readSettings(query);
  const todayStart = startOfLocalDate(localDateOf(now, settings.timeZone), settings.timeZone);
  // The event on now first, then the ones that ended today, latest first. All-day events have no times.
  const events = await query<{ location: string | null }>(
    `select location from app.events
      where not all_day and start_at <= $1 and end_at >= $2 and nullif(btrim(location), '') is not null
      order by (end_at > $1) desc, end_at desc, start_at desc limit 10`,
    [now, todayStart],
  );

  const candidates: Candidate[] = [];
  const event = events.map((e) => e.location!.trim()).find((location) => !isWebLink(location));
  if (event) candidates.push({ source: "event", label: eventPlaceLabel(event), address: event });
  const home = settings.homeAddress.trim();
  if (home) candidates.push({ source: "home", label: "Home", address: home });
  return candidates;
}
