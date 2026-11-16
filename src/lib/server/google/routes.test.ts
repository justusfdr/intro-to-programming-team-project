// Tests for the Google module for travel time (R27). Google is replaced by a stand-in; the answers have
// the shape of real ones (Lisbon, November 2026). No internet, no real key.
import { afterEach, describe, expect, it, vi } from "vitest";
import { googleRouting, minutesFromRoutes, routeBody, secondsOf, tripFromTransit } from "./routes";

const KEY = "test-key-not-a-real-one";
const HOME = { lat: 38.7086889, lon: -9.1551195 };
const THERE = { lat: 38.7369, lon: -9.1386 };
const NOW = new Date("2026-11-16T12:00:00Z");
const ARRIVE = new Date("2026-11-17T10:00:00Z");

const walk = (s: number) => ({ travelMode: "WALK", staticDuration: `${s}s` });
const ride = (s: number, departureTime: string) => ({ travelMode: "TRANSIT", staticDuration: `${s}s`, transitDetails: { stopDetails: { departureTime } } });
/** Three trips Google offered for an arrival by 10:00 (shape and times from a real answer). */
const TRANSIT = {
  routes: [
    { duration: "2827s", legs: [{ steps: [walk(30), walk(41), walk(119), walk(6), walk(122), ride(2156, "2026-11-17T09:17:04Z"), walk(24), walk(329)] }] },
    { duration: "2153s", legs: [{ steps: [walk(68), walk(52), walk(39), walk(39), walk(190), walk(545), walk(37), walk(8), walk(10), walk(56), ride(556, "2026-11-17T09:37:50Z"), walk(551)] }] },
    { duration: "2283s", legs: [{ steps: [walk(68), walk(52), walk(61), walk(10), ride(1491, "2026-11-17T09:14:48Z"), walk(601)] }] },
  ],
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const google = (answer: unknown, ok = true, status = ok ? 200 : 403) => vi.fn(async (..._asked: unknown[]) => ({ ok, status, json: async () => answer }) as Response);
const asFetch = (fake: ReturnType<typeof vi.fn>) => fake as unknown as typeof fetch;
const sent = (fake: ReturnType<typeof vi.fn>, call = 0) => fake.mock.calls[call] as [string, RequestInit];
const routing = (fake: ReturnType<typeof vi.fn>, now = NOW) => googleRouting({ key: KEY, fetchImpl: asFetch(fake), now: () => now, cache: new Map() });

afterEach(() => vi.restoreAllMocks());

describe("secondsOf", () => {
  it("reads Google's durations", () => {
    expect(secondsOf("1273s")).toBe(1273);
    expect(secondsOf("0s")).toBe(0);
    expect(secondsOf("12.5s")).toBe(12.5);
  });
  it("is null for anything else", () => {
    for (const bad of ["", "12", "-5s", "s", "1273 s", 1273, null, undefined, {}]) expect(secondsOf(bad)).toBeNull();
  });
});

describe("minutesFromRoutes", () => {
  it("turns the first route's seconds into whole minutes, at least one", () => {
    expect(minutesFromRoutes({ routes: [{ duration: "1273s" }, { duration: "60s" }] })).toBe(21);
    expect(minutesFromRoutes({ routes: [{ duration: "10s" }] })).toBe(1);
  });
  it("is null when Google found no route ({}) or the answer is broken", () => {
    for (const bad of [{}, { routes: [] }, { routes: [{}] }, { routes: [{ duration: "x" }] }, null, "x"]) expect(minutesFromRoutes(bad)).toBeNull();
  });
});

describe("tripFromTransit", () => {
  it("takes the trip that leaves last but still arrives in time: the first vehicle's departure, less the walk to it", () => {
    // Second trip: 1044 s of walking before the 9:37:50 departure → set off 9:20:26, 36 minutes.
    expect(tripFromTransit(TRANSIT, ARRIVE)).toEqual({ departAt: new Date("2026-11-17T09:20:26Z"), minutes: 36 });
  });

  it("leaves out a trip that arrives late, and is null when all do", () => {
    const late = { routes: [{ duration: "3600s", legs: [{ steps: [walk(60), ride(3540, "2026-11-17T09:30:00Z")] }] }] };
    expect(tripFromTransit(late, ARRIVE)).toBeNull();
    expect(tripFromTransit({ routes: [...late.routes, TRANSIT.routes[0]] }, ARRIVE)?.departAt).toEqual(new Date("2026-11-17T09:11:46Z"));
  });

  it("keeps a trip that arrives right on time", () => {
    const exact = { routes: [{ duration: "1800s", legs: [{ steps: [walk(0), ride(1800, "2026-11-17T09:30:00Z")] }] }] };
    expect(tripFromTransit(exact, ARRIVE)).toEqual({ departAt: new Date("2026-11-17T09:30:00Z"), minutes: 30 });
  });

  it("a trip that is only walking counts back from the arrival", () => {
    expect(tripFromTransit({ routes: [{ duration: "900s", legs: [{ steps: [walk(900)] }] }] }, ARRIVE)).toEqual({ departAt: new Date("2026-11-17T09:45:00Z"), minutes: 15 });
  });

  it("is null for no trip ({}) or an answer of the wrong shape, and skips broken trips", () => {
    for (const bad of [{}, null, "x", { routes: "x" }, { routes: [{ duration: "x" }] }, { routes: [{ duration: "60s", legs: [{ steps: [ride(60, "not a time")] }] }] }]) {
      expect(tripFromTransit(bad, ARRIVE)).toBeNull();
    }
    const broken = { duration: "60s", legs: [{ steps: [{ travelMode: "WALK" }, ride(60, "2026-11-17T09:50:00Z")] }] };
    expect(tripFromTransit({ routes: [broken, TRANSIT.routes[1]] }, ARRIVE)?.departAt).toEqual(new Date("2026-11-17T09:20:26Z"));
  });
});

describe("routeBody", () => {
  const ends = { origin: { location: { latLng: { latitude: HOME.lat, longitude: HOME.lon } } }, destination: { location: { latLng: { latitude: THERE.lat, longitude: THERE.lon } } } };

  it("public transport: arrive by the event's start, several trips", () => {
    expect(routeBody("transit", HOME, THERE, ARRIVE, NOW)).toEqual({ ...ends, travelMode: "TRANSIT", arrivalTime: "2026-11-17T10:00:00.000Z", computeAlternativeRoutes: true });
  });

  it("car: with traffic for a departure an hour before the arrival", () => {
    expect(routeBody("driving", HOME, THERE, ARRIVE, NOW)).toEqual({ ...ends, travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE", departureTime: "2026-11-17T09:00:00.000Z" });
  });

  it("car: for an event soon, the departure is now (Google refuses one in the past)", () => {
    const soon = new Date(NOW.getTime() + 20 * 60_000);
    expect(routeBody("driving", HOME, THERE, soon, NOW)).toMatchObject({ routingPreference: "TRAFFIC_AWARE", departureTime: "2026-11-16T12:01:00.000Z" });
  });

  it("car: for an event that has passed, without traffic", () => {
    const body = routeBody("driving", HOME, THERE, new Date("2026-11-15T10:00:00Z"), NOW);
    expect(body).toEqual({ ...ends, travelMode: "DRIVE", routingPreference: "TRAFFIC_UNAWARE" });
  });

  it("bicycle and on foot: just the way", () => {
    expect(routeBody("cycling", HOME, THERE, ARRIVE, NOW)).toEqual({ ...ends, travelMode: "BICYCLE" });
    expect(routeBody("walking", HOME, THERE, ARRIVE, NOW)).toEqual({ ...ends, travelMode: "WALK" });
  });
});

describe("googleRouting", () => {
  it("car: one question to the Routes API with the key in a header; leave = arrival − minutes", async () => {
    const fake = google({ routes: [{ duration: "1273s" }] });
    expect(await routing(fake).trip("driving", HOME, THERE, ARRIVE)).toEqual({ minutes: 21, departAt: new Date("2026-11-17T09:39:00Z") });
    const [url, init] = sent(fake);
    expect(url).toBe("https://routes.googleapis.com/directions/v2:computeRoutes");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json", "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": "routes.duration" });
    expect(url + String(init.body)).not.toContain(KEY);
  });

  it("public transport: asks for the steps too and takes the latest trip in time", async () => {
    const fake = google(TRANSIT);
    expect(await routing(fake).trip("transit", HOME, THERE, ARRIVE)).toEqual({ departAt: new Date("2026-11-17T09:20:26Z"), minutes: 36 });
    expect((sent(fake)[1].headers as Record<string, string>)["X-Goog-FieldMask"]).toContain("routes.legs.steps.transitDetails.stopDetails.departureTime");
  });

  it("no route (Google answers {}) is no trip", async () => {
    expect(await routing(google({})).trip("cycling", HOME, THERE, ARRIVE)).toBeNull();
    expect(await routing(google({})).trip("transit", HOME, THERE, ARRIVE)).toBeNull();
  });

  it("finds an address with the places module's look-up", async () => {
    const fake = google({ places: [{ formattedAddress: "R. das Madres 66, 1200-658 Lisboa, Portugal", location: { latitude: 38.7086889, longitude: -9.1551195 } }] });
    expect(await routing(fake).geocode("  rua das madres 66 ")).toEqual(HOME);
    expect(sent(fake)[0]).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(JSON.parse(String(sent(fake)[1].body))).toEqual({ textQuery: "rua das madres 66", languageCode: "en", pageSize: 1 });
  });

  it("an address Google does not know is null", async () => {
    expect(await routing(google({})).geocode("qqqqq 9999")).toBeNull();
  });

  it("keeps answers for 6 hours (R27), then asks again", async () => {
    const fake = google({ routes: [{ duration: "600s" }] });
    let now = NOW;
    const r = googleRouting({ key: KEY, fetchImpl: asFetch(fake), now: () => now, cache: new Map() });
    await r.trip("walking", HOME, THERE, ARRIVE);
    now = new Date(NOW.getTime() + 6 * 60 * 60_000 - 1);
    await r.trip("walking", HOME, THERE, ARRIVE);
    expect(fake).toHaveBeenCalledOnce();
    now = new Date(NOW.getTime() + 6 * 60 * 60_000);
    await r.trip("walking", HOME, THERE, ARRIVE);
    expect(fake).toHaveBeenCalledTimes(2);

    const geo = google({ places: [{ formattedAddress: "Lisboa", location: { latitude: 1, longitude: 2 } }] });
    const g = routing(geo);
    await g.geocode("Rua Augusta 100");
    await g.geocode("rua augusta 100 ");
    expect(geo).toHaveBeenCalledOnce();
  });

  it("does not keep a failure: the next question asks again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const answers = [{ ok: false, status: 500 }, { ok: true, status: 200 }];
    const fake = vi.fn(async () => {
      const a = answers.shift()!;
      return { ...a, json: async () => ({ routes: [{ duration: "600s" }] }) } as Response;
    });
    const r = googleRouting({ key: KEY, fetchImpl: asFetch(fake), now: () => NOW, cache: new Map() });
    await expect(r.trip("walking", HOME, THERE, ARRIVE)).rejects.toThrow("status 500");
    expect(await r.trip("walking", HOME, THERE, ARRIVE)).toEqual({ minutes: 10, departAt: new Date("2026-11-17T09:50:00Z") });
  });

  it("throws (the action then says 'Travel time not available') without a key, when Google refuses or does not answer", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fake = google({ routes: [{ duration: "600s" }] });
    for (const key of [null, ""]) {
      const r = googleRouting({ key, fetchImpl: asFetch(fake), now: () => NOW, cache: new Map() });
      await expect(r.trip("driving", HOME, THERE, ARRIVE)).rejects.toThrow();
      await expect(r.geocode("Rua Augusta 100")).rejects.toThrow();
    }
    expect(fake).not.toHaveBeenCalled();
    for (const status of [400, 403, 429, 500]) await expect(routing(google({}, false, status)).trip("transit", HOME, THERE, ARRIVE)).rejects.toThrow(`status ${status}`);
    const down = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(routing(down).trip("walking", HOME, THERE, ARRIVE)).rejects.toThrow("no answer");
  });

  it("logs only the kind of failure and the status, never the key or the places", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await routing(google({}, false, 403)).trip("driving", HOME, THERE, ARRIVE).catch(() => {});
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain("403");
    expect(logged).not.toContain(KEY);
    expect(logged).not.toContain("38.70");
  });
});
