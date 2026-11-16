import "server-only";

// What the travel time (R27) needs from the outside world: finding where an address is, and how long the
// trip takes. The real one asks Google (src/lib/server/google/routes.ts); tests use a stand-in (fake.ts).
import type { TravelMode } from "@/lib/settings/types";

export type Point = { lat: number; lon: number };

/** One trip that arrives in time: when to set off (without the buffer) and how long it takes. */
export type Trip = { departAt: Date; minutes: number };

export interface Routing {
  /** Where an address is, or null when it cannot be found. Throws when the service cannot be reached. */
  geocode(address: string): Promise<Point | null>;
  /**
   * The trip from `from` to `to` that arrives by `arriveBy`, or null when there is none (for example no
   * bus that day). Throws when the service cannot be reached.
   */
  trip(mode: TravelMode, from: Point, to: Point, arriveBy: Date): Promise<Trip | null>;
}
