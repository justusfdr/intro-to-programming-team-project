// Tests for travel_time (R27, scenario A9): when to leave for an event. The routing services are replaced by
// a stand-in (FakeRouting), so the tests need no internet. Nothing is ever saved, so every case also checks
// that the database is unchanged.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { seedAllDay, seedEvent } from "@test/support/events";
import { FakeRouting } from "@/lib/server/routing/fake";
import { isWebLink, travelTime, travelTimes } from "./travel-time";

let app: TestApp;
let routing: FakeRouting;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.reset();
  routing = new FakeRouting();
  routing.places.set("rua das madres 66, lisboa", { lat: 38.7087, lon: -9.1551 });
  routing.places.set("nova sbe, carcavelos", { lat: 38.6797, lon: -9.3197 });
});

const ask = (id: string, headers: Record<string, string> = {}, query = "") =>
  travelTime(
    new Request(`http://localhost:3000/api/events/${id}/travel${query}`, {
      headers: { host: "localhost:3000", origin: "http://localhost:3000", "sec-fetch-site": "same-origin", ...headers },
    }),
    app.deps,
    id,
    routing,
  );

/** Alice, signed in, with a home address and a buffer (10 minutes unless said otherwise). */
async function alice(settings: { home?: string; mode?: string; buffer?: number } = {}) {
  const id = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
  await app.db.admin("update app.settings set home_address = $2, travel_mode = $3, travel_buffer_minutes = $4 where user_id = $1", [
    id,
    settings.home === undefined ? "Rua das Madres 66, Lisboa" : settings.home || null,
    settings.mode ?? "driving",
    settings.buffer ?? 10,
  ]);
  return id;
}

/** An event at 10:00 Lisbon time (10:00 UTC in November) at a location, with its own way of getting there or none. */
async function lecture(user: string, location: string | null = "Nova SBE, Carcavelos", mode: string | null = null) {
  const { id } = await seedEvent(app.db, user, { title: "Lecture", start: "2026-11-17T10:00:00Z", end: "2026-11-17T11:00:00Z" });
  await app.db.admin("update app.events set location = $2, travel_mode = $3 where id = $1", [id, location, mode]);
  return id;
}

describe("travel_time", () => {
  it("A9: route 25 minutes, buffer 10, event at 10:00 → leave at 09:25", async () => {
    const id = await lecture(await alice());
    const before = await app.snapshot();
    expect(await read(await ask(id))).toEqual({
      status: 200,
      body: { travel: { status: "ok", mode: "driving", minutes: 25, bufferMinutes: 10, leaveAt: "2026-11-17T09:25:00.000Z", from: "Home" } },
    });
    expect(await app.snapshot()).toEqual(before);
  });

  it("A9: when the routing goes down, says so and changes nothing", async () => {
    const id = await lecture(await alice());
    routing.down = true;
    const before = await app.snapshot();
    expect(await read(await ask(id))).toEqual({
      status: 200,
      body: { travel: { status: "unavailable", mode: "driving", message: "Travel time not available" } },
    });
    expect(await app.snapshot()).toEqual(before);
  });

  it("uses the standard from the settings when the event has no way of its own", async () => {
    const id = await lecture(await alice({ mode: "cycling", buffer: 0 }));
    expect((await read(await ask(id))).body).toMatchObject({ travel: { mode: "cycling", minutes: 40, leaveAt: "2026-11-17T09:20:00.000Z" } });
  });

  it("uses the event's own way over the standard", async () => {
    const id = await lecture(await alice({ mode: "driving", buffer: 0 }), "Nova SBE, Carcavelos", "walking");
    expect((await read(await ask(id))).body).toMatchObject({ travel: { mode: "walking", minutes: 90, leaveAt: "2026-11-17T08:30:00.000Z" } });
  });

  it("by public transport takes the last trip that arrives in time, then the buffer", async () => {
    // The stand-in's last trip arrives 5 minutes early (09:55) and takes 35 minutes: it leaves at 09:20.
    const id = await lecture(await alice({ buffer: 10 }), "Nova SBE, Carcavelos", "transit");
    expect((await read(await ask(id))).body).toEqual({
      travel: { status: "ok", mode: "transit", minutes: 35, bufferMinutes: 10, leaveAt: "2026-11-17T09:10:00.000Z", from: "Home" },
    });
    expect(routing.asked).toEqual([{ mode: "transit", arriveBy: new Date("2026-11-17T10:00:00Z") }]);
  });

  it("says when there is no trip at all (for example no bus that day)", async () => {
    const id = await lecture(await alice(), "Nova SBE, Carcavelos", "transit");
    delete routing.minutes.transit;
    expect((await read(await ask(id))).body).toEqual({ travel: { status: "unavailable", mode: "transit", message: "Travel time not available" } });
  });

  it("asks for a home address when there is none", async () => {
    const id = await lecture(await alice({ home: "" }));
    expect((await read(await ask(id))).body).toEqual({ travel: { status: "no_home", mode: "driving", message: "Add your home address in settings" } });
    expect(routing.asked).toEqual([]);
  });

  it("says Address not found when the event's place or the home cannot be found", async () => {
    const user = await alice();
    const nowhere = await lecture(user, "Atlantis 1");
    expect((await read(await ask(nowhere))).body).toEqual({ travel: { status: "not_found", mode: "driving", message: "Address not found" } });
    await app.db.admin("update app.settings set home_address = 'Nowhere 9' where user_id = $1", [user]);
    const id = await lecture(user);
    expect((await read(await ask(id))).body).toMatchObject({ travel: { status: "not_found" } });
  });

  it("has nothing to show without a location, for a web link, or for an all-day event (R27, R29)", async () => {
    const user = await alice();
    for (const location of [null, "https://teams.microsoft.com/l/meetup", "www.zoom.us/j/123"]) {
      expect((await read(await ask(await lecture(user, location)))).body).toEqual({ travel: null });
    }
    const { id } = await seedAllDay(app.db, user, { title: "Trip", firstDay: "2026-11-20", lastDay: "2026-11-21" });
    await app.db.admin("update app.events set location = 'Nova SBE, Carcavelos' where id = $1", [id]);
    expect((await read(await ask(id))).body).toEqual({ travel: null });
    expect(routing.asked).toEqual([]);
  });

  it("is Not found for another user's event or an id that is not one (R3)", async () => {
    const id = await lecture(await alice());
    await app.signedInAs("bob@example.com", { timeZone: "Europe/Lisbon" });
    expect((await ask(id)).status).toBe(404);
    expect((await ask("not-an-id")).status).toBe(404);
    expect(routing.asked).toEqual([]);
  });

  it("rejects a signed-out request (401) and a request from another site (403)", async () => {
    const id = await lecture(await alice());
    expect((await ask(id, { origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status).toBe(403);
    await app.reset();
    expect((await ask(id)).status).toBe(401);
    expect(routing.asked).toEqual([]);
  });
});

describe("isWebLink", () => {
  it("knows meeting links", () => {
    for (const link of ["https://teams.microsoft.com/x", "http://zoom.us/j/1", "www.example.com", "Join: https://meet.google.com/abc"]) expect(isWebLink(link)).toBe(true);
  });
  it("does not take a street address for one", () => {
    for (const place of ["Nova SBE, Carcavelos", "Rua das Madres 66, 1200-863 Lisboa", "Room 2.01"]) expect(isWebLink(place)).toBe(false);
  });
});

describe("travel_times (the calendar's travel blocks)", () => {
  const many = (ids: unknown, headers?: Record<string, string>) => travelTimes(postJson("/api/travel", { ids }, headers), app.deps, routing);

  it("answers for each event that can have a travel time, in one go", async () => {
    const user = await alice();
    const car = await lecture(user);
    const bus = await lecture(user, "Nova SBE, Carcavelos", "transit");
    const online = await lecture(user, "https://teams.microsoft.com/x");
    const before = await app.snapshot();
    const { status, body } = await read(await many([car, bus, online]));
    expect(status).toBe(200);
    expect(body).toEqual({
      travel: {
        [car]: { status: "ok", mode: "driving", minutes: 25, bufferMinutes: 10, leaveAt: "2026-11-17T09:25:00.000Z", from: "Home" },
        [bus]: { status: "ok", mode: "transit", minutes: 35, bufferMinutes: 10, leaveAt: "2026-11-17T09:10:00.000Z", from: "Home" },
      },
    });
    expect(await app.snapshot()).toEqual(before);
  });

  it("leaves out another user's events and ids that are not ids (R3)", async () => {
    const mine = await lecture(await alice());
    await app.signedInAs("bob@example.com", { timeZone: "Europe/Lisbon" });
    expect(await read(await many([mine, "nope"]))).toEqual({ status: 200, body: { travel: {} } });
    expect(routing.asked).toEqual([]);
  });

  it("gives each event its message when the routing is down", async () => {
    const id = await lecture(await alice());
    routing.down = true;
    expect((await read(await many([id]))).body).toEqual({ travel: { [id]: { status: "unavailable", mode: "driving", message: "Travel time not available" } } });
  });

  it("refuses a body of the wrong shape or more than 100 events", async () => {
    await alice();
    for (const bad of ["x", [1], Array.from({ length: 101 }, () => "a")]) expect((await many(bad)).status).toBe(400);
  });

  it("rejects a signed-out request (401) and a request from another site (403)", async () => {
    const id = await lecture(await alice());
    expect((await many([id], { origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status).toBe(403);
    await app.reset();
    expect((await many([id])).status).toBe(401);
  });
});

describe("travel_time: the map of the way", () => {
  const MAP = "https://www.google.com/maps/embed/v1/directions";

  it("adds Google's map of the way from home to the event, with the event's way of getting there, when the server has a browser key", async () => {
    vi.stubEnv("GOOGLE_MAPS_BROWSER_KEY", "browser-key-for-tests");
    vi.stubEnv("GOOGLE_MAPS_SERVER_KEY", "server-key-never-in-the-browser");
    try {
      const id = await lecture(await alice(), "Nova SBE, Carcavelos", "transit");
      const before = await app.snapshot();
      const { body } = await read(await ask(id));
      const travel = body.travel as { status: string; map: string; minutes: number };
      expect(travel).toMatchObject({ status: "ok", mode: "transit", minutes: 35 });
      const url = new URL(travel.map);
      expect(url.origin + url.pathname).toBe(MAP);
      expect(Object.fromEntries(url.searchParams)).toEqual({ key: "browser-key-for-tests", origin: "Rua das Madres 66, Lisboa", destination: "Nova SBE, Carcavelos", mode: "transit", language: "en" });
      expect(JSON.stringify(body)).not.toContain("server-key-never-in-the-browser");
      expect(await app.snapshot()).toEqual(before);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("has no map without a browser key", async () => {
    vi.stubEnv("GOOGLE_MAPS_BROWSER_KEY", "");
    try {
      const id = await lecture(await alice());
      const { body } = await read(await ask(id));
      expect(body.travel).toEqual({ status: "ok", mode: "driving", minutes: 25, bufferMinutes: 10, leaveAt: "2026-11-17T09:25:00.000Z", from: "Home" });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("has no map when there is no time to leave (no home address, address not found, routing down)", async () => {
    vi.stubEnv("GOOGLE_MAPS_BROWSER_KEY", "browser-key-for-tests");
    try {
      const noHome = await lecture(await alice({ home: "" }));
      expect(JSON.stringify((await read(await ask(noHome))).body)).not.toContain(MAP);

      await app.reset();
      const unknown = await lecture(await alice(), "Somewhere nobody knows 99");
      expect((await read(await ask(unknown))).body.travel).toEqual({ status: "not_found", mode: "driving", message: "Address not found" });

      await app.reset();
      const down = await lecture(await alice());
      routing.down = true;
      expect((await read(await ask(down))).body.travel).toEqual({ status: "unavailable", mode: "driving", message: "Travel time not available" });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("the calendar's many travel times carry no map (only the editor shows one)", async () => {
    vi.stubEnv("GOOGLE_MAPS_BROWSER_KEY", "browser-key-for-tests");
    try {
      const user = await alice();
      const id = await lecture(user);
      const response = await travelTimes(postJson("/api/travel", { ids: [id] }), app.deps, routing);
      expect(JSON.stringify((await read(response)).body)).not.toContain(MAP);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("travel_time: where the trip starts (travel_from)", () => {
  /** An earlier event of the user that ends at `end` at a location. */
  async function before(user: string, location: string, end = "2026-11-17T09:00:00Z", start = "2026-11-17T08:00:00Z") {
    const { id } = await seedEvent(app.db, user, { title: "Before", start, end });
    await app.db.admin("update app.events set location = $2 where id = $1", [id, location]);
  }
  const setFrom = (id: string, from: string | null) => app.db.admin("update app.events set travel_from = $2 where id = $1", [id, from]);
  const fromOf = async (id: string) => ((await read(await ask(id))).body.travel as { status: string; from?: string });

  it("the standard starts at the event before when there is one, else at home", async () => {
    const user = await alice();
    const id = await lecture(user);
    expect(await fromOf(id)).toMatchObject({ status: "ok", from: "Home" });
    routing.places.set("gym street 1", { lat: 38.7, lon: -9.2 });
    await before(user, "Gym Street 1");
    expect(await fromOf(id)).toMatchObject({ status: "ok", from: "Last event" });
  });

  it("has no travel time (no trip, no buffer) when the event before is at the same place", async () => {
    const user = await alice();
    const id = await lecture(user);
    await before(user, "nova sbe,  Carcavelos");
    expect((await read(await ask(id))).body).toEqual({ travel: null });
    expect(routing.asked).toEqual([]);
  });

  it("has no travel time when the event before is the same place written another way (under 50 m apart)", async () => {
    const user = await alice();
    const id = await lecture(user);
    routing.places.set("nova school of business, carcavelos", { lat: 38.6798, lon: -9.3198 });
    await before(user, "Nova School of Business, Carcavelos");
    expect((await read(await ask(id))).body).toEqual({ travel: null });
  });

  it("skips an event before that ended more than 12 hours earlier, has no address or is a web link", async () => {
    const user = await alice();
    const id = await lecture(user);
    await before(user, "Gym Street 1", "2026-11-16T21:00:00Z", "2026-11-16T20:00:00Z");
    await before(user, "https://meet.example.com/abc", "2026-11-17T09:30:00Z", "2026-11-17T09:00:00Z");
    expect(await fromOf(id)).toMatchObject({ status: "ok", from: "Home" });
  });

  it("starts at home when the event before ended before 3:00 at night (over night the user is back home)", async () => {
    const user = await alice();
    const id = await lecture(user);
    routing.places.set("gym street 1", { lat: 38.7, lon: -9.2 });
    // Lisbon is UTC in November: ended 02:30, within 12 hours of the 10:00 lecture, but before 3:00.
    await before(user, "Gym Street 1", "2026-11-17T02:30:00Z", "2026-11-17T01:00:00Z");
    expect(await fromOf(id)).toMatchObject({ status: "ok", from: "Home" });
    const many = await travelTimes(postJson("/api/travel", { ids: [id] }), app.deps, routing);
    expect(((await read(many)).body.travel as Record<string, { from?: string }>)[id]).toMatchObject({ from: "Home" });
    // Ended 03:30, after 3:00: the trip starts there.
    await before(user, "Gym Street 1", "2026-11-17T03:30:00Z", "2026-11-17T03:00:00Z");
    expect(await fromOf(id)).toMatchObject({ status: "ok", from: "Last event" });
  });

  it("starts at home when told so, even with an event before", async () => {
    const user = await alice();
    const id = await lecture(user);
    await before(user, "Unknown Street 9");
    await setFrom(id, "home");
    expect(await fromOf(id)).toMatchObject({ status: "ok", from: "Home" });
  });

  it("starts at a saved place by its name; a deleted place falls back to the standard", async () => {
    const user = await alice();
    const id = await lecture(user);
    routing.places.set("campus 1, lisboa", { lat: 38.75, lon: -9.15 });
    const [place] = await app.db.withUser(user, (q) => q<{ id: string }>("insert into app.places (name, address) values ('Uni', 'Campus 1, Lisboa') returning id"));
    await setFrom(id, `place:${place.id}`);
    expect(await fromOf(id)).toMatchObject({ status: "ok", from: "Uni" });
    await app.db.admin("delete from app.places where id = $1", [place.id]);
    expect(await fromOf(id)).toMatchObject({ status: "ok", from: "Home" });
  });

  it("starts at an address typed for this event, and says when it cannot be found", async () => {
    const user = await alice();
    const id = await lecture(user);
    routing.places.set("rua augusta 1", { lat: 38.71, lon: -9.137 });
    await setFrom(id, "address:Rua Augusta 1");
    expect(await fromOf(id)).toMatchObject({ status: "ok", from: "Other address" });
    await setFrom(id, "address:Nowhere 0");
    expect(await fromOf(id)).toMatchObject({ status: "not_found" });
  });

  it("never uses another user's place or events (R3)", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const [place] = await app.db.withUser(bob, (q) => q<{ id: string }>("insert into app.places (name, address) values ('Bob home', 'Rua Augusta 1') returning id"));
    await seedEvent(app.db, bob, { title: "Bob", start: "2026-11-17T08:00:00Z", end: "2026-11-17T09:00:00Z" });
    const user = await alice();
    const id = await lecture(user);
    await setFrom(id, `place:${place.id}`);
    expect(await fromOf(id)).toMatchObject({ status: "ok", from: "Home" });
  });
});

describe("travel_time: the route as the editor has it, before Save", () => {
  it("counts a changed way, start and address for the answer, and saves nothing", async () => {
    const id = await lecture(await alice({ mode: "driving", buffer: 0 }));
    routing.places.set("cais do sodré, lisboa", { lat: 38.706, lon: -9.144 });
    const before = await app.snapshot();
    const query = "?" + new URLSearchParams({ mode: "cycling", from: "address:Cais do Sodré, Lisboa", location: "Nova SBE, Carcavelos" });
    expect((await read(await ask(id, {}, query))).body).toMatchObject({
      travel: { status: "ok", mode: "cycling", minutes: 40, leaveAt: "2026-11-17T09:20:00.000Z", from: "Other address" },
    });
    expect(await app.snapshot()).toEqual(before);
  });

  it("an empty way is the standard from the settings; an empty address has no travel time", async () => {
    const id = await lecture(await alice({ mode: "walking", buffer: 0 }), "Nova SBE, Carcavelos", "driving");
    expect((await read(await ask(id, {}, "?mode="))).body).toMatchObject({ travel: { mode: "walking", minutes: 90 } });
    expect((await read(await ask(id, {}, "?location="))).body).toEqual({ travel: null });
  });

  it("leaves out values that are not valid ones, and the saved ones count", async () => {
    const id = await lecture(await alice({ mode: "driving", buffer: 0 }));
    const query = "?" + new URLSearchParams({ mode: "rocket", from: "nowhere", location: "x".repeat(201) });
    expect((await read(await ask(id, {}, query))).body).toMatchObject({ travel: { status: "ok", mode: "driving", minutes: 25, from: "Home" } });
  });
});

describe("travel_time: way and buffer per place (home, saved places, Other)", () => {
  const gym = async (user: string, mode: string | null, buffer: number | null) =>
    app.db.withUser(user, (q) => q("insert into app.places (name, address, travel_mode, travel_buffer_minutes) values ('Gym', 'Nova SBE, Carcavelos', $1, $2)", [mode, buffer]));
  const answer = async (id: string) => (await read(await ask(id))).body.travel as { mode: string; bufferMinutes: number; leaveAt: string };

  it("takes the saved place's own way and buffer for an event there", async () => {
    const user = await alice({ mode: "transit", buffer: 10 });
    const id = await lecture(user);
    await gym(user, "walking", 5);
    expect(await answer(id)).toMatchObject({ mode: "walking", bufferMinutes: 5 });
    const many = await travelTimes(postJson("/api/travel", { ids: [id] }), app.deps, routing);
    expect(((await read(many)).body.travel as Record<string, unknown>)[id]).toMatchObject({ mode: "walking", bufferMinutes: 5 });
  });

  it("takes Other for what the place leaves empty, and for an address that is no saved place", async () => {
    const user = await alice({ mode: "transit", buffer: 10 });
    const id = await lecture(user);
    expect(await answer(id)).toMatchObject({ mode: "transit", bufferMinutes: 10 });
    await gym(user, null, 0);
    expect(await answer(id)).toMatchObject({ mode: "transit", bufferMinutes: 0 });
  });

  it("the event's own way still wins; the buffer stays the place's", async () => {
    const user = await alice({ mode: "transit", buffer: 10 });
    const id = await lecture(user, "Nova SBE, Carcavelos", "cycling");
    await gym(user, "walking", 5);
    expect(await answer(id)).toMatchObject({ mode: "cycling", bufferMinutes: 5 });
  });

  it("takes home's own way and buffer for an event at home", async () => {
    const user = await alice({ mode: "transit", buffer: 10 });
    const id = await lecture(user, "Rua das Madres 66, Lisboa");
    routing.places.set("gym street 1", { lat: 38.7, lon: -9.2 });
    await app.db.admin("update app.settings set home_travel_mode = 'driving', home_travel_buffer_minutes = 0 where user_id = $1", [user]);
    await setFromTo(id, "address:Gym Street 1");
    expect(await answer(id)).toMatchObject({ mode: "driving", bufferMinutes: 0 });
  });

  const setFromTo = (id: string, from: string) => app.db.admin("update app.events set travel_from = $2 where id = $1", [id, from]);
});
