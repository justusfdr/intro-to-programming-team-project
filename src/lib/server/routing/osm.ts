import "server-only";

// The real routing (R27), all free and built on OpenStreetMap data:
//   - where an address is: Nominatim (at most one question per second, so questions wait their turn)
//   - car, bicycle, on foot: the OSRM servers of routing.openstreetmap.de
//   - public transport (train, bus, metro, tram) by timetable: Transitous
// R27 lets the app reuse a result for up to 6 hours, so answers are kept in memory that long.
import type { TravelMode } from "@/lib/settings/types";
import type { Point, Routing, Trip } from "./types";

const AGENT = { "User-Agent": "LockedIn-student-project" };
const KEEP_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;

const PROFILE: Record<Exclude<TravelMode, "transit">, string> = { driving: "car", cycling: "bike", walking: "foot" };

/** Answers kept for up to 6 hours (R27), by question. */
const kept = new Map<string, { at: number; value: unknown }>();

async function remember<T>(key: string, ask: () => Promise<T>): Promise<T> {
  const hit = kept.get(key);
  if (hit && Date.now() - hit.at < KEEP_MS) return hit.value as T;
  const value = await ask();
  kept.set(key, { at: Date.now(), value });
  if (kept.size > 2000) kept.delete(kept.keys().next().value!);
  return value;
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: AGENT, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`routing service answered ${response.status}`);
  return response.json();
}

// Nominatim allows one question per second: each one waits for the one before. Every question to
// Nominatim from this server goes through this one queue (also the address search, search-places.ts).
let nominatimTurn: Promise<unknown> = Promise.resolve();
export function inNominatimQueue<T>(ask: () => Promise<T>): Promise<T> {
  const answer = nominatimTurn.then(ask);
  nominatimTurn = answer.catch(() => undefined).then(() => new Promise((r) => setTimeout(r, 1100)));
  return answer;
}
function nominatim(url: string): Promise<unknown> {
  return inNominatimQueue(() => getJson(url));
}

/** The first result's position in a Nominatim answer, or null. Exported for the tests. */
export function pointFromNominatim(answer: unknown): Point | null {
  const first = Array.isArray(answer) ? (answer[0] as { lat?: unknown; lon?: unknown } | undefined) : undefined;
  const lat = Number(first?.lat);
  const lon = Number(first?.lon);
  return first && Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

/** The trip time in minutes in an OSRM answer, or null when it found no route. Exported for the tests. */
export function minutesFromOsrm(answer: unknown): number | null {
  const a = answer as { code?: unknown; routes?: { duration?: unknown }[] };
  const seconds = a?.code === "Ok" ? Number(a.routes?.[0]?.duration) : NaN;
  return Number.isFinite(seconds) && seconds >= 0 ? Math.max(1, Math.round(seconds / 60)) : null;
}

/** The latest Transitous journey that arrives by `arriveBy`, or null. Exported for the tests. */
export function tripFromTransitous(answer: unknown, arriveBy: Date): Trip | null {
  const journeys = (answer as { itineraries?: { startTime?: unknown; endTime?: unknown }[] })?.itineraries;
  if (!Array.isArray(journeys)) return null;
  let best: Trip | null = null;
  for (const j of journeys) {
    const start = new Date(String(j?.startTime));
    const end = new Date(String(j?.endTime));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end > arriveBy || end < start) continue;
    if (!best || start > best.departAt) best = { departAt: start, minutes: Math.round((end.getTime() - start.getTime()) / 60_000) };
  }
  return best;
}

export function osmRouting(): Routing {
  return {
    geocode(address) {
      const q = address.trim();
      return remember(`geo:${q.toLowerCase()}`, async () =>
        pointFromNominatim(await nominatim(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, format: "jsonv2", limit: "1" })}`)),
      );
    },

    trip(mode, from, to, arriveBy) {
      if (mode === "transit") {
        // Timetables change with the time of day, so the arrival time is part of the question.
        const params = new URLSearchParams({
          fromPlace: `${from.lat},${from.lon}`,
          toPlace: `${to.lat},${to.lon}`,
          time: arriveBy.toISOString(),
          arriveBy: "true",
          numItineraries: "5",
        });
        return remember(`transit:${params}`, async () => tripFromTransitous(await getJson(`https://api.transitous.org/api/v1/plan?${params}`), arriveBy));
      }
      const path = `${from.lon},${from.lat};${to.lon},${to.lat}`;
      return remember(`${mode}:${path}`, async () => {
        const minutes = minutesFromOsrm(await getJson(`https://routing.openstreetmap.de/routed-${PROFILE[mode]}/route/v1/driving/${path}?overview=false`));
        return minutes === null ? null : { minutes, departAt: new Date(0) };
      }).then((found) => (found ? { minutes: found.minutes, departAt: new Date(arriveBy.getTime() - found.minutes * 60_000) } : null));
    },
  };
}
