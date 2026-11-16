import "server-only";

// The Google module for travel time (R27): the only place that talks to Google's Routes API (AGENTS.md:
// one module per service). Where an address is comes from the places module (Text Search). Plain
// `fetch`, 8 seconds at most. The key comes from config.ts and is never logged: only the kind of a
// failure and its HTTP status are. It replaces the OpenStreetMap services (Nominatim, OSRM, Transitous).
//
//   - car: with the traffic Google expects at about the time of the trip. Google can only count traffic
//     for a departure in the future, and the departure is what we want to find, so we ask for one hour
//     before the arrival (or now, if that has passed); a trip in the past is counted without traffic.
//   - bicycle, on foot: Google's time for the way.
//   - public transport: Google's timetables, asked for an arrival by the event's start. Of the trips it
//     offers, the one that leaves last but still arrives in time is taken (as with Transitous before).
// R27 lets the app reuse a result for up to 6 hours, so answers are kept in memory that long.
import { googleMapsServerKey } from "@/lib/server/config";
import type { Point, Routing, Trip } from "@/lib/server/routing/types";
import type { TravelMode } from "@/lib/settings/types";
import { GoogleUnavailableError, lookUpPlace } from "./places";

const COMPUTE_ROUTES = "https://routes.googleapis.com/directions/v2:computeRoutes";
const TIMEOUT_MS = 8000;
const KEEP_MS = 6 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/** Only what we use. For public transport also the steps, to know when the first vehicle leaves. */
const FIELDS = "routes.duration";
const TRANSIT_FIELDS =
  "routes.duration,routes.legs.steps.travelMode,routes.legs.steps.staticDuration,routes.legs.steps.transitDetails.stopDetails.departureTime";

const GOOGLE_MODE: Record<TravelMode, string> = { driving: "DRIVE", cycling: "BICYCLE", walking: "WALK", transit: "TRANSIT" };

/** "1273s" → 1273, or null for anything else. Google writes durations like this. */
export function secondsOf(value: unknown): number | null {
  const match = typeof value === "string" ? /^(\d+(?:\.\d+)?)s$/.exec(value) : null;
  const seconds = match ? Number(match[1]) : NaN;
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

/** The trip time in whole minutes (at least one) of the first route, or null when Google found none. */
export function minutesFromRoutes(answer: unknown): number | null {
  const routes = (answer as { routes?: unknown })?.routes;
  const seconds = Array.isArray(routes) ? secondsOf((routes[0] as { duration?: unknown } | undefined)?.duration) : null;
  return seconds === null ? null : Math.max(1, Math.round(seconds / 60));
}

type Step = { travelMode?: unknown; staticDuration?: unknown; transitDetails?: { stopDetails?: { departureTime?: unknown } } };

/**
 * When to set off for one public-transport route: the first vehicle's departure, less the walk to it.
 * A route that is only walking has no departure of its own (null: the caller counts back from the arrival).
 */
function setOffOf(steps: Step[]): Date | null | undefined {
  let walk = 0;
  for (const step of steps) {
    if (step?.travelMode === "TRANSIT") {
      const leaves = new Date(String(step.transitDetails?.stopDetails?.departureTime));
      return Number.isNaN(leaves.getTime()) ? undefined : new Date(leaves.getTime() - walk * 1000);
    }
    const seconds = secondsOf(step?.staticDuration);
    if (seconds === null) return undefined;
    walk += seconds;
  }
  return null;
}

/** Of the public-transport routes, the one that leaves last but still arrives by `arriveBy`, or null. */
export function tripFromTransit(answer: unknown, arriveBy: Date): Trip | null {
  const routes = (answer as { routes?: unknown })?.routes;
  if (!Array.isArray(routes)) return null;
  let best: Trip | null = null;
  for (const route of routes as { duration?: unknown; legs?: { steps?: unknown }[] }[]) {
    const seconds = secondsOf(route?.duration);
    if (seconds === null) continue;
    const steps = (Array.isArray(route?.legs) ? route.legs : []).flatMap((leg) => (Array.isArray(leg?.steps) ? (leg.steps as Step[]) : []));
    const found = setOffOf(steps);
    if (found === undefined) continue;
    const departAt = found ?? new Date(arriveBy.getTime() - seconds * 1000);
    // Google rounds to the second; a minute of slack keeps a trip that arrives exactly on time.
    if (departAt.getTime() + seconds * 1000 > arriveBy.getTime() + 60_000) continue;
    if (!best || departAt > best.departAt) best = { departAt, minutes: Math.max(1, Math.round(seconds / 60)) };
  }
  return best;
}

const waypoint = (p: Point) => ({ location: { latLng: { latitude: p.lat, longitude: p.lon } } });

/** The body of the question to Google, built on its own so a test can check it. */
export function routeBody(mode: TravelMode, from: Point, to: Point, arriveBy: Date, now: Date): Record<string, unknown> {
  const body: Record<string, unknown> = { origin: waypoint(from), destination: waypoint(to), travelMode: GOOGLE_MODE[mode] };
  if (mode === "transit") return { ...body, arrivalTime: arriveBy.toISOString(), computeAlternativeRoutes: true };
  if (mode === "driving") {
    // Traffic only for a departure in the future (Google refuses one in the past).
    const departAt = new Date(Math.max(arriveBy.getTime() - HOUR_MS, now.getTime() + 60_000));
    if (departAt >= arriveBy) return { ...body, routingPreference: "TRAFFIC_UNAWARE" };
    return { ...body, routingPreference: "TRAFFIC_AWARE", departureTime: departAt.toISOString() };
  }
  return body;
}

export type GoogleRoutingOptions = {
  /** Google's server key; by default the one in the environment. */
  key?: string | null;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  /** Answers kept for up to 6 hours (R27). Each test passes its own. */
  cache?: Map<string, { at: number; value: unknown }>;
};

/** Answers kept for up to 6 hours, by question, shared by all requests on this server. */
const shared = new Map<string, { at: number; value: unknown }>();

export function googleRouting({ key = googleMapsServerKey(), fetchImpl = fetch, now = () => new Date(), cache = shared }: GoogleRoutingOptions = {}): Routing {
  async function remember<T>(id: string, ask: () => Promise<T>): Promise<T> {
    const hit = cache.get(id);
    if (hit && now().getTime() - hit.at < KEEP_MS) return hit.value as T;
    const value = await ask();
    cache.set(id, { at: now().getTime(), value });
    if (cache.size > 2000) cache.delete(cache.keys().next().value!);
    return value;
  }

  async function routes(fields: string, body: Record<string, unknown>): Promise<unknown> {
    if (!key) throw new GoogleUnavailableError("no key");
    try {
      const response = await fetchImpl(COMPUTE_ROUTES, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": fields },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new GoogleUnavailableError(`status ${response.status}`);
      return await response.json();
    } catch (error) {
      const failure = error instanceof GoogleUnavailableError ? error : new GoogleUnavailableError("no answer");
      console.error(`[google-routes] ${failure.reason}`);
      throw failure;
    }
  }

  return {
    geocode(address) {
      const q = address.trim();
      return remember(`geo:${q.toLowerCase()}`, async () => {
        const [place] = await lookUpPlace(q, { kind: "address", key, fetchImpl });
        return place && place.lat !== undefined && place.lon !== undefined ? { lat: place.lat, lon: place.lon } : null;
      });
    },

    trip(mode, from, to, arriveBy) {
      const body = routeBody(mode, from, to, arriveBy, now());
      if (mode === "transit") return remember(`transit:${JSON.stringify(body)}`, async () => tripFromTransit(await routes(TRANSIT_FIELDS, body), arriveBy));
      return remember(`${mode}:${JSON.stringify(body)}`, async () => minutesFromRoutes(await routes(FIELDS, body))).then((minutes) =>
        minutes === null ? null : { minutes, departAt: new Date(arriveBy.getTime() - minutes * 60_000) },
      );
    },
  };
}
