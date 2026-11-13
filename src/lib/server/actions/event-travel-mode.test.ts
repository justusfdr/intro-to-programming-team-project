// Tests for an event's way of getting there (R27, changed on 13 November 2026): create_event and edit_event
// take it ("driving", "cycling", "walking" or "transit"; null or none means the standard from the settings),
// left out of an edit it stays, a series gets it on every event (R28), an all-day event has none (R29),
// and an event of another user cannot be changed (R3). Each rejected case checks that nothing changed (R1).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { seedAllDay, seedEvent } from "@test/support/events";
import { createEvent } from "./create-event";
import { editEvent } from "./edit-event";

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.reset();
});

const create = async (body: unknown) => read(await createEvent(postJson("/api/events", body), app.deps));
const edit = async (id: string, body: unknown) => read(await editEvent(postJson(`/api/events/${id}/edit`, body), app.deps, id));

const LUNCH = { title: "Lunch", start: "2026-11-17T12:30", end: "2026-11-17T13:30" };
const SEED = { title: "Lunch", start: "2026-11-17T12:30:00Z", end: "2026-11-17T13:30:00Z" };

const modesOf = async (user: string) =>
  (await app.db.admin<{ travel_mode: string | null }>("select travel_mode from app.events where user_id = $1 order by start_at", [user])).map((r) => r.travel_mode);
const modeOf = async (id: string) => (await app.db.admin<{ travel_mode: string | null }>("select travel_mode from app.events where id = $1", [id]))[0].travel_mode;

describe("create_event with a way of getting there", () => {
  it("saves each of the four ways and answers with it", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    for (const [i, travelMode] of (["driving", "cycling", "walking", "transit"] as const).entries()) {
      const start = `2026-11-${17 + i}T12:30`;
      const answer = await create({ title: "Lunch", start, end: `2026-11-${17 + i}T13:30`, travelMode });
      expect(answer.status).toBe(201);
      expect(answer.body).toMatchObject({ event: { travelMode } });
    }
    expect(await modesOf(alice)).toEqual(["driving", "cycling", "walking", "transit"]);
  });

  it("saves none (the standard) for null or for nothing", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    expect((await create({ ...LUNCH, travelMode: null })).status).toBe(201);
    expect((await create({ ...LUNCH, start: "2026-11-18T12:30", end: "2026-11-18T13:30" })).body).toMatchObject({ event: { travelMode: null } });
    expect(await modesOf(alice)).toEqual([null, null]);
  });

  it("refuses a way that does not exist, and saves nothing", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    for (const travelMode of ["flying", "Driving", "", 3]) expect((await create({ ...LUNCH, travelMode })).status).toBe(400);
    expect(await modesOf(alice)).toEqual([]);
  });

  it("refuses a way for an all-day event, which has no travel time (R29)", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const answer = await create({ title: "Trip", allDay: true, firstDay: "2026-11-20", lastDay: "2026-11-21", travelMode: "transit" });
    expect(answer.status).toBe(400);
    expect(await modesOf(alice)).toEqual([]);
    expect((await create({ title: "Trip", allDay: true, firstDay: "2026-11-20", lastDay: "2026-11-21", travelMode: null })).status).toBe(201);
  });

  it("gives every event of a series the same way", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const answer = await create({ ...LUNCH, travelMode: "transit", repeat: { frequency: "daily", until: "2026-11-19" } });
    expect(answer.status).toBe(201);
    expect(await modesOf(alice)).toEqual(["transit", "transit", "transit"]);
  });
});

describe("edit_event with a way of getting there", () => {
  it("changes it, and null brings back the standard", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const { id, updatedAt } = await seedEvent(app.db, alice, SEED);
    const first = await edit(id, { ...LUNCH, travelMode: "transit", updatedAt });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ event: { travelMode: "transit" } });
    expect(await modeOf(id)).toBe("transit");
    const next = (first.body.event as { updatedAt: string }).updatedAt;
    expect((await edit(id, { ...LUNCH, travelMode: null, updatedAt: next })).status).toBe(200);
    expect(await modeOf(id)).toBeNull();
  });

  it("leaves it as it is when the body does not name it", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const { id, updatedAt } = await seedEvent(app.db, alice, SEED);
    const first = await edit(id, { ...LUNCH, travelMode: "walking", updatedAt });
    const next = (first.body.event as { updatedAt: string }).updatedAt;
    expect((await edit(id, { ...LUNCH, title: "Lunch with Lea", updatedAt: next })).status).toBe(200);
    expect(await modeOf(id)).toBe("walking");
  });

  it("refuses a way that does not exist and changes nothing (R1)", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const { id, updatedAt } = await seedEvent(app.db, alice, SEED);
    const before = await app.snapshot();
    expect((await edit(id, { ...LUNCH, travelMode: "flying", updatedAt })).status).toBe(400);
    expect(await app.snapshot()).toEqual(before);
  });

  it("refuses a way for an all-day event (R29)", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const { id, updatedAt } = await seedAllDay(app.db, alice, { title: "Trip", firstDay: "2026-11-20", lastDay: "2026-11-21" });
    const before = await app.snapshot();
    expect((await edit(id, { title: "Trip", allDay: true, firstDay: "2026-11-20", lastDay: "2026-11-21", travelMode: "driving", updatedAt })).status).toBe(400);
    expect(await app.snapshot()).toEqual(before);
  });

  it("changes the way of this and the following events of a series", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const made = await create({ ...LUNCH, repeat: { frequency: "daily", until: "2026-11-19" } });
    const first = made.body.event as { id: string; updatedAt: string };
    const [, second] = await app.db.admin<{ id: string; updated_at: Date }>("select id, updated_at from app.events where user_id = $1 order by start_at", [alice]);
    const answer = await edit(second.id, {
      ...LUNCH,
      start: "2026-11-18T12:30",
      end: "2026-11-18T13:30",
      travelMode: "cycling",
      scope: "this_and_following",
      updatedAt: new Date(second.updated_at).toISOString(),
    });
    expect(answer.status).toBe(200);
    expect(first.id).not.toBe(second.id);
    expect(await modesOf(alice)).toEqual([null, "cycling", "cycling"]);
  });

  it("does not change an event of another user (R3)", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const { id, updatedAt } = await seedEvent(app.db, alice, SEED);
    await app.signedInAs("bob@example.com", { timeZone: "Europe/Lisbon" });
    const before = await app.snapshot();
    expect((await edit(id, { ...LUNCH, travelMode: "driving", updatedAt })).status).toBe(404);
    expect(await app.snapshot()).toEqual(before);
    expect(await modeOf(id)).toBeNull();
  });
});
