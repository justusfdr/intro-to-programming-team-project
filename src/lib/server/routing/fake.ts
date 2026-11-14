import "server-only";

// A stand-in for the routing services in tests: known addresses and fixed trip times, no internet.
import type { TravelMode } from "@/lib/settings/types";
import type { Point, Routing, Trip } from "./types";

export class FakeRouting implements Routing {
  /** Addresses it knows, by their text in lower case. */
  places = new Map<string, Point>();
  /** Minutes per way of getting there; a way that is missing has no trip. */
  minutes: Partial<Record<TravelMode, number>> = { driving: 25, cycling: 40, walking: 90, transit: 35 };
  /** By public transport, how many minutes before the arrival time the last trip arrives. */
  transitEarly = 5;
  /** Set to make every question fail as if the service were down. */
  down = false;
  asked: { mode: TravelMode; arriveBy: Date }[] = [];

  async geocode(address: string): Promise<Point | null> {
    if (this.down) throw new Error("down");
    return this.places.get(address.trim().toLowerCase()) ?? null;
  }

  async trip(mode: TravelMode, _from: Point, _to: Point, arriveBy: Date): Promise<Trip | null> {
    if (this.down) throw new Error("down");
    this.asked.push({ mode, arriveBy });
    const minutes = this.minutes[mode];
    if (minutes === undefined) return null;
    const arrive = mode === "transit" ? arriveBy.getTime() - this.transitEarly * 60_000 : arriveBy.getTime();
    return { minutes, departAt: new Date(arrive - minutes * 60_000) };
  }
}
