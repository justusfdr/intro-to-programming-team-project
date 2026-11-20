import "server-only";

import type { Point, Routing } from "./types";

// Issue #227: a Routing that asks once per route. For driving, cycling and walking the time barely
// depends on the hour, so the first answer for "from -> to by this mode" counts for every later time;
// only the departure is counted back from each arrival. Public transport depends on the timetable, so
// it is always asked for the arrival at hand. Lives for one request, so nothing goes stale.
export function oncePerRoute(routing: Routing): Routing {
  const kept = new Map<string, Promise<number | null>>();
  const key = (mode: string, a: Point, b: Point) => `${mode}|${a.lat.toFixed(5)},${a.lon.toFixed(5)}|${b.lat.toFixed(5)},${b.lon.toFixed(5)}`;
  return {
    geocode: (address) => routing.geocode(address),
    async trip(mode, from, to, arriveBy) {
      if (mode === "transit") return routing.trip(mode, from, to, arriveBy);
      const id = key(mode, from, to);
      let minutes = kept.get(id);
      if (!minutes) {
        minutes = routing.trip(mode, from, to, arriveBy).then((trip) => trip?.minutes ?? null);
        kept.set(id, minutes);
      }
      const answer = await minutes;
      return answer === null ? null : { minutes: answer, departAt: new Date(arriveBy.getTime() - answer * 60_000) };
    },
  };
}
