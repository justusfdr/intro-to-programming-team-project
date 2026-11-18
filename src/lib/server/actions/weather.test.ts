// Tests for weather (spec 47, R48): a city the widget names, else the device's place, else the event on now or the last one that ended
// today, else home, else "Add your home address"; only rounded coordinates reach the weather service;
// nothing is saved. The clock starts on Monday 16 November 2026, 09:00 UTC (10:00 in Berlin).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { seedEvent } from "@test/support/events";
import { FakeRouting } from "@/lib/server/routing/fake";
import { FakeWeather, SUNNY } from "@/lib/server/weather/fake";
import { eventPlaceLabel, weather } from "./weather";

let app: TestApp;
let routing: FakeRouting;
let service: FakeWeather;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.reset();
  routing = new FakeRouting();
  service = new FakeWeather();
});

function send(body: unknown = {}, headers?: Record<string, string>) {
  return weather(postJson("/api/weather", body, headers), app.deps, routing, service);
}

const day = (hhmm: string, date = "2026-11-16") => `${date}T${hhmm}:00Z`;
const berlin = () => app.signedInAs("alice@example.com", { timeZone: "Europe/Berlin" });

async function seedAt(userId: string, location: string | null, start: string, end: string, title = "Event") {
  const { id } = await seedEvent(app.db, userId, { title, start, end });
  if (location !== null) await app.db.admin("update app.events set location = $2 where id = $1", [id, location]);
  return id;
}
async function setHome(userId: string, address: string) {
  await app.db.admin("update app.settings set home_address = $2 where user_id = $1", [userId, address]);
}

const OK = (place: string, source: string) => ({ status: 200, body: { status: "ok", weather: { place, source, ...SUNNY } } });

describe("weather: the device's place", () => {
  it("uses the coordinates the browser sent, rounded to two decimals, and calls the place 'Your location'", async () => {
    await berlin();
    expect(await read(await send({ lat: 38.7223456, lon: -9.1393789 }))).toEqual(OK("Your location", "device"));
    expect(service.asked).toEqual([{ lat: 38.72, lon: -9.14 }]);
  });

  it("goes before the event and the home address, which are not even asked for", async () => {
    const alice = await berlin();
    await setHome(alice, "Rua A 1, Lisbon");
    await seedAt(alice, "Rua B 2, Lisbon", day("08:30"), day("09:30"));
    routing.places.set("rua a 1, lisbon", { lat: 1, lon: 1 });
    await send({ lat: 41.1496, lon: -8.611 });
    expect(service.asked).toEqual([{ lat: 41.15, lon: -8.61 }]);
  });

  it("accepts the edges of the world", async () => {
    await berlin();
    expect((await send({ lat: -90, lon: 180 })).status).toBe(200);
    expect(service.asked).toEqual([{ lat: -90, lon: 180 }]);
  });

  it("saves nothing", async () => {
    await berlin();
    const before = await app.snapshot();
    await send({ lat: 38.7223456, lon: -9.1393789 });
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("weather: the place of an event", () => {
  it("the event happening now: its address, with the text before the first comma as the place", async () => {
    const alice = await berlin();
    await seedAt(alice, "Nova SBE, Campus de Carcavelos, Cascais", day("08:30"), day("09:30"));
    routing.places.set("nova sbe, campus de carcavelos, cascais", { lat: 38.6789, lon: -9.3254 });
    expect(await read(await send())).toEqual(OK("Nova SBE", "event"));
    expect(service.asked).toEqual([{ lat: 38.68, lon: -9.33 }]);
  });

  it("with none on now, the last one that ended today", async () => {
    const alice = await berlin();
    await seedAt(alice, "Early place", day("06:00"), day("07:00"));
    await seedAt(alice, "Later place", day("07:30"), day("08:30"));
    await seedAt(alice, "Next place", day("11:00"), day("12:00")); // not started yet
    routing.places.set("early place", { lat: 1, lon: 1 });
    routing.places.set("later place", { lat: 2.004, lon: 2.006 });
    routing.places.set("next place", { lat: 3, lon: 3 });
    expect(await read(await send())).toEqual(OK("Later place", "event"));
    expect(service.asked).toEqual([{ lat: 2, lon: 2.01 }]);
  });

  it("the event on now beats one that ended earlier", async () => {
    const alice = await berlin();
    await seedAt(alice, "Ended place", day("06:00"), day("07:00"));
    await seedAt(alice, "Now place", day("08:00"), day("10:00"));
    routing.places.set("ended place", { lat: 1, lon: 1 });
    routing.places.set("now place", { lat: 2, lon: 2 });
    expect((await read(await send())).body).toMatchObject({ weather: { place: "Now place" } });
  });

  it("an event that ended yesterday, or has not started, is not used: home is", async () => {
    const alice = await berlin();
    await setHome(alice, "Rua A 1, Lisbon");
    await seedAt(alice, "Yesterday place", day("10:00", "2026-11-15"), day("11:00", "2026-11-15"));
    await seedAt(alice, "Next place", day("11:00"), day("12:00"));
    routing.places.set("rua a 1, lisbon", { lat: 1, lon: 1 });
    routing.places.set("yesterday place", { lat: 2, lon: 2 });
    routing.places.set("next place", { lat: 3, lon: 3 });
    expect(await read(await send())).toEqual(OK("Home", "home"));
  });

  it("an event ended before midnight of the user's day (23:30 UTC the day before is 00:30 in Berlin) still counts as today", async () => {
    const alice = await berlin();
    await seedAt(alice, "Night place", day("23:00", "2026-11-15"), day("23:45", "2026-11-15"));
    routing.places.set("night place", { lat: 2, lon: 2 });
    expect((await read(await send())).body).toMatchObject({ weather: { place: "Night place", source: "event" } });
  });

  it("an event with a web link or no address is skipped for the next one, then for home", async () => {
    const alice = await berlin();
    await setHome(alice, "Rua A 1, Lisbon");
    await seedAt(alice, "Rua Real 5, Lisbon", day("06:00"), day("07:00"));
    await seedAt(alice, "https://meet.example.com/abc", day("07:30"), day("08:30"));
    await seedAt(alice, null, day("08:30"), day("08:45"));
    routing.places.set("rua real 5, lisbon", { lat: 5, lon: 5 });
    routing.places.set("rua a 1, lisbon", { lat: 1, lon: 1 });
    expect((await read(await send())).body).toMatchObject({ weather: { place: "Rua Real 5", source: "event" } });

    await app.db.admin("delete from app.events where location = 'Rua Real 5, Lisbon'");
    expect((await read(await send())).body).toMatchObject({ weather: { place: "Home", source: "home" } });
  });

  it("an address that cannot be found falls back to home", async () => {
    const alice = await berlin();
    await setHome(alice, "Rua A 1, Lisbon");
    await seedAt(alice, "Nowhere 99", day("08:00"), day("09:30"));
    routing.places.set("rua a 1, lisbon", { lat: 1, lon: 1 });
    expect((await read(await send())).body).toMatchObject({ weather: { place: "Home", source: "home" } });
  });

  it("all-day events are not used", async () => {
    const alice = await berlin();
    await setHome(alice, "Rua A 1, Lisbon");
    await app.db.admin(`insert into app.events (user_id, title, all_day, first_day, last_day, location) values ($1, 'Trip', true, '2026-11-16', '2026-11-16', 'Porto')`, [alice]);
    routing.places.set("porto", { lat: 41, lon: -8 });
    routing.places.set("rua a 1, lisbon", { lat: 1, lon: 1 });
    expect((await read(await send())).body).toMatchObject({ weather: { source: "home" } });
  });

  it("only the user's own events", async () => {
    const alice = await berlin();
    const bob = await app.signedInAs("bob@example.com", { timeZone: "Europe/Berlin" });
    await seedAt(bob, "Bob place", day("08:00"), day("09:30"));
    routing.places.set("bob place", { lat: 1, lon: 1 });
    await app.auth.signIn({ email: "alice@example.com", password: "test-password" });
    expect(app.auth.session!.userId).toBe(alice);
    expect((await read(await send())).body).toEqual({ status: "no_place", message: "Add your home address" });
  });
});

describe("eventPlaceLabel", () => {
  it("is the text before the first comma, trimmed, at most 30 characters", () => {
    expect(eventPlaceLabel("  Nova SBE , Carcavelos")).toBe("Nova SBE");
    expect(eventPlaceLabel("A".repeat(50))).toBe("A".repeat(30));
    expect(eventPlaceLabel(", Lisbon")).toBe(", Lisbon");
    expect(eventPlaceLabel("Rua Augusta 100")).toBe("Rua Augusta 100");
  });
});

describe("weather: home, no place, service down", () => {
  it("the home address, called 'Home'", async () => {
    const alice = await berlin();
    await setHome(alice, "Rua A 1, Lisbon");
    routing.places.set("rua a 1, lisbon", { lat: 38.7167, lon: -9.1333 });
    expect(await read(await send())).toEqual(OK("Home", "home"));
    expect(service.asked).toEqual([{ lat: 38.72, lon: -9.13 }]);
  });

  it("nothing at all: 'Add your home address', and the weather service is not asked", async () => {
    await berlin();
    expect(await read(await send())).toEqual({ status: 200, body: { status: "no_place", message: "Add your home address" } });
    expect(service.asked).toEqual([]);
  });

  it("a home address that cannot be found is also 'Add your home address'", async () => {
    const alice = await berlin();
    await setHome(alice, "Nowhere 99");
    expect((await read(await send())).body).toEqual({ status: "no_place", message: "Add your home address" });
  });

  it("the weather service down: 'Weather not available'", async () => {
    const alice = await berlin();
    await setHome(alice, "Rua A 1, Lisbon");
    routing.places.set("rua a 1, lisbon", { lat: 1, lon: 1 });
    service.answer = null;
    expect(await read(await send())).toEqual({ status: 200, body: { status: "unavailable", message: "Weather not available" } });
    expect((await read(await send({ lat: 1, lon: 1 }))).body).toEqual({ status: "unavailable", message: "Weather not available" });
  });

  it("the routing service down: 'Weather not available' (there is a place, it just cannot be found now)", async () => {
    const alice = await berlin();
    await setHome(alice, "Rua A 1, Lisbon");
    routing.down = true;
    expect((await read(await send())).body).toEqual({ status: "unavailable", message: "Weather not available" });
    // The device's place needs no routing.
    expect((await read(await send({ lat: 1, lon: 1 }))).body).toMatchObject({ status: "ok" });
  });

  it("saves nothing, whatever the place", async () => {
    const alice = await berlin();
    await setHome(alice, "Rua A 1, Lisbon");
    await seedAt(alice, "Rua B 2, Lisbon", day("08:00"), day("09:30"));
    routing.places.set("rua b 2, lisbon", { lat: 1, lon: 1 });
    const before = await app.snapshot();
    await send();
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("weather: a city the widget names", () => {
  it("is turned into coordinates by the routing service; the place is the text before the first comma", async () => {
    await berlin();
    routing.places.set("porto, portugal", { lat: 41.1496, lon: -8.611 });
    expect(await read(await send({ city: "  Porto, Portugal " }))).toEqual(OK("Porto", "city"));
    expect(service.asked).toEqual([{ lat: 41.15, lon: -8.61 }]);
  });

  it("a long name is cut to 30 characters", async () => {
    await berlin();
    const name = "B".repeat(60);
    routing.places.set(name.toLowerCase(), { lat: 1, lon: 1 });
    expect((await read(await send({ city: name }))).body).toMatchObject({ weather: { place: "B".repeat(30), source: "city" } });
  });

  it("beats the device's place, the event and home, which are not even asked for", async () => {
    const alice = await berlin();
    await setHome(alice, "Rua A 1, Lisbon");
    await seedAt(alice, "Rua B 2, Lisbon", day("08:30"), day("09:30"));
    routing.places.set("rua a 1, lisbon", { lat: 1, lon: 1 });
    routing.places.set("rua b 2, lisbon", { lat: 2, lon: 2 });
    routing.places.set("madrid", { lat: 40.4168, lon: -3.7038 });
    expect((await read(await send({ city: "Madrid" }))).body).toMatchObject({ status: "ok", weather: { place: "Madrid", source: "city" } });
    expect(service.asked).toEqual([{ lat: 40.42, lon: -3.7 }]);
    expect(routing.asked).toEqual([]);
  });

  it("a city that cannot be found: 'City not found', with no fall back to home, and the weather service is not asked", async () => {
    const alice = await berlin();
    await setHome(alice, "Rua A 1, Lisbon");
    routing.places.set("rua a 1, lisbon", { lat: 1, lon: 1 });
    expect(await read(await send({ city: "Atlantis" }))).toEqual({ status: 200, body: { status: "no_place", message: "City not found" } });
    expect(service.asked).toEqual([]);
  });

  it("the routing service down: 'Weather not available'", async () => {
    await berlin();
    routing.down = true;
    expect((await read(await send({ city: "Porto" }))).body).toEqual({ status: "unavailable", message: "Weather not available" });
    expect(service.asked).toEqual([]);
  });

  it("the weather service down: 'Weather not available'", async () => {
    await berlin();
    routing.places.set("porto", { lat: 1, lon: 1 });
    service.answer = null;
    expect((await read(await send({ city: "Porto" }))).body).toEqual({ status: "unavailable", message: "Weather not available" });
  });

  it("saves nothing", async () => {
    await berlin();
    routing.places.set("porto", { lat: 1, lon: 1 });
    const before = await app.snapshot();
    await send({ city: "Porto" });
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("weather rejected", () => {
  async function expectRefused(body: unknown, status: number, headers?: Record<string, string>) {
    await berlin();
    const before = await app.snapshot();
    expect((await send(body, headers)).status).toBe(status);
    expect(await app.snapshot()).toEqual(before);
    expect(service.asked).toEqual([]);
  }

  it.each([
    [{ lat: 38.7 }],
    [{ lon: -9.1 }],
    [{ lat: 91, lon: 0 }],
    [{ lat: -91, lon: 0 }],
    [{ lat: 0, lon: 181 }],
    [{ lat: 0, lon: -181 }],
    [{ lat: "38.7", lon: "-9.1" }],
    [{ lat: null, lon: null }],
    [{ lat: 38.7, lon: -9.1, accuracy: 10 }],
    [{ place: "Lisbon" }],
    [{ city: "" }],
    [{ city: "   " }],
    [{ city: "A".repeat(81) }],
    [{ city: "Lis\nbon" }],
    [{ city: "Lis\tbon" }],
    [{ city: 5 }],
    [{ city: null }],
    [{ city: "Porto", lat: 38.7, lon: -9.1 }],
    [{ city: "Porto", lat: 38.7 }],
    [{ city: "Porto", extra: 1 }],
    [[]],
    ["not json"],
  ])("refuses the body %j with 400", async (body) => {
    await expectRefused(body, 400);
  });

  it("refuses a request from another origin with 403", async () => {
    await expectRefused({}, 403, { origin: "https://evil.example", "sec-fetch-site": "cross-site" });
  });

  it("refuses a signed-out request with 401", async () => {
    expect((await send({})).status).toBe(401);
    expect((await send({ lat: 1, lon: 1 })).status).toBe(401);
    expect(service.asked).toEqual([]);
  });
});
