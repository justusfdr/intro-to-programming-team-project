// Tests for event_place (spec 35): where one of the user's events is, for the preview's map. The address
// service is replaced by the stand-in (FakeRouting), so no test reaches the internet. Nothing is ever
// saved, so the cases also check that the database is unchanged. Answers are checked against an
// allow-list of keys.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, read, type TestApp } from "@test/support/app";
import { seedAllDay, seedEvent } from "@test/support/events";
import { FakeRouting } from "@/lib/server/routing/fake";
import { eventPlace } from "./event-place";

let app: TestApp;
let routing: FakeRouting;
let asked: string[];

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.reset();
  routing = new FakeRouting();
  routing.places.set("nova sbe, carcavelos", { lat: 38.679712345, lon: -9.319698765 });
  asked = [];
  const geocode = routing.geocode.bind(routing);
  routing.geocode = (address: string) => {
    asked.push(address);
    return geocode(address);
  };
});

const ask = (id: string, headers: Record<string, string> = {}) =>
  eventPlace(
    new Request(`http://localhost:3000/api/events/${id}/place`, {
      headers: { host: "localhost:3000", origin: "http://localhost:3000", "sec-fetch-site": "same-origin", ...headers },
    }),
    app.deps,
    id,
    routing,
  );

async function lecture(user: string, location: string | null) {
  const { id } = await seedEvent(app.db, user, { title: "Lecture", start: "2026-11-17T10:00:00Z", end: "2026-11-17T11:00:00Z" });
  await app.db.admin("update app.events set location = $2 where id = $1", [id, location]);
  return id;
}

describe("event_place", () => {
  it("finds the place of the user's own event, rounded to five decimals, with nothing but status, lat and lon", async () => {
    const id = await lecture(await app.signedInAs("alice@example.com"), "  Nova SBE, Carcavelos ");
    const before = await app.snapshot();
    const answer = await read(await ask(id));
    expect(answer).toEqual({ status: 200, body: { status: "found", lat: 38.67971, lon: -9.3197 } });
    expect(Object.keys(answer.body).sort()).toEqual(["lat", "lon", "status"]);
    expect(asked).toEqual(["Nova SBE, Carcavelos"]);
    expect(await app.snapshot()).toEqual(before);
  });

  it("an all-day event with an address has a place too", async () => {
    const user = await app.signedInAs("alice@example.com");
    const { id } = await seedAllDay(app.db, user, { title: "Trip", firstDay: "2026-11-20", lastDay: "2026-11-21" });
    await app.db.admin("update app.events set location = 'Nova SBE, Carcavelos' where id = $1", [id]);
    expect((await read(await ask(id))).body).toMatchObject({ status: "found" });
  });

  it("says 'not_found' for an address the service does not know", async () => {
    const id = await lecture(await app.signedInAs("alice@example.com"), "Nowhere street 1");
    expect((await read(await ask(id))).body).toEqual({ status: "not_found" });
  });

  it("refuses a position that is not on Earth as 'not_found'", async () => {
    routing.places.set("broken", { lat: 123, lon: 7 });
    routing.places.set("not a number", { lat: Number.NaN, lon: 7 });
    const user = await app.signedInAs("alice@example.com");
    expect((await read(await ask(await lecture(user, "broken")))).body).toEqual({ status: "not_found" });
    expect((await read(await ask(await lecture(user, "not a number")))).body).toEqual({ status: "not_found" });
  });

  it("says 'unavailable' when the service cannot be reached, and changes nothing", async () => {
    routing.down = true;
    const id = await lecture(await app.signedInAs("alice@example.com"), "Nova SBE, Carcavelos");
    const before = await app.snapshot();
    expect(await read(await ask(id))).toEqual({ status: 200, body: { status: "unavailable" } });
    expect(await app.snapshot()).toEqual(before);
  });

  it("says 'none' without asking for no location and for a web link (an online meeting)", async () => {
    const user = await app.signedInAs("alice@example.com");
    for (const location of [null, "https://teams.microsoft.com/l/meetup", "www.zoom.us/j/123"]) {
      expect((await read(await ask(await lecture(user, location)))).body).toEqual({ status: "none" });
    }
    expect(asked).toEqual([]);
  });

  it("is Not found for another user's event, an unknown id and an id that is not one (R3), without asking", async () => {
    const id = await lecture(await app.signedInAs("alice@example.com"), "Nova SBE, Carcavelos");
    await app.signedInAs("bob@example.com");
    for (const other of [id, "00000000-0000-4000-8000-000000000000", "not-an-id", "../travel"]) {
      expect(await read(await ask(other))).toEqual({ status: 404, body: { error: "not_found", message: "Not found" } });
    }
    expect(asked).toEqual([]);
  });

  it("rejects a request from another site (403) and a signed-out one (401), without asking", async () => {
    const id = await lecture(await app.signedInAs("alice@example.com"), "Nova SBE, Carcavelos");
    expect((await ask(id, { origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status).toBe(403);
    await app.reset();
    expect((await ask(id)).status).toBe(401);
    expect(asked).toEqual([]);
  });

  it("answers at most 60 questions per user per minute, then 'Too many searches' until the minute is over", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const id = await lecture(alice, "Nova SBE, Carcavelos");
    // A new minute for this test: earlier tests counted on the same limiter.
    app.advance(61_000);
    for (let i = 0; i < 60; i += 1) expect((await ask(id)).status).toBe(200);
    expect(await read(await ask(id))).toEqual({ status: 429, body: { error: "too_many_places", message: "Too many searches. Try again in a minute." } });
    // Another user has their own count.
    const bobsEvent = await lecture(await app.signedInAs("bob@example.com"), "Nova SBE, Carcavelos");
    expect((await ask(bobsEvent)).status).toBe(200);
    app.advance(61_000);
    await app.signedInAs("alice@example.com");
    expect((await ask(id)).status).toBe(200);
  });
});
