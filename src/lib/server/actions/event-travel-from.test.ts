// Tests for where the trip to an event starts (travel_from): create_event and edit_event take it as stored
// text ("home", "last", "place:<id>", "address:<text>"; null or none is the standard), left out of an edit
// it stays, a series gets it on every event, an all-day event has none, and nothing else is taken.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { seedEvent } from "@test/support/events";
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
const PLACE = "place:0b1e2c3d-1111-4222-8333-944455556666";
const fromsOf = async (user: string) =>
  (await app.db.admin<{ travel_from: string | null }>("select travel_from from app.events where user_id = $1 order by start_at", [user])).map((r) => r.travel_from);

describe("create_event with a start of the trip", () => {
  it("saves each choice and answers with it; none is the standard", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    for (const [i, travelFrom] of ["home", "last", PLACE, "address: Rua Augusta 1 "].entries()) {
      const answer = await create({ title: "Lunch", start: `2026-11-${17 + i}T12:30`, end: `2026-11-${17 + i}T13:30`, travelFrom });
      expect(answer.status).toBe(201);
    }
    expect((await create({ title: "Lunch", start: "2026-11-25T12:30", end: "2026-11-25T13:30" })).status).toBe(201);
    expect(await fromsOf(alice)).toEqual(["home", "last", PLACE, "address:Rua Augusta 1", null]);
  });

  it("gives a series the same start on every event", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    expect((await create({ ...LUNCH, travelFrom: "home", repeat: { frequency: "daily", until: "2026-11-19" } })).status).toBe(201);
    expect(await fromsOf(alice)).toEqual(["home", "home", "home"]);
  });

  it("refuses an unknown choice and a start for an all-day event, and saves nothing", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    for (const travelFrom of ["work", "place:nope", "address:", "", 3]) expect((await create({ ...LUNCH, travelFrom })).status).toBe(400);
    expect((await create({ title: "Trip", allDay: true, firstDay: "2026-11-17", lastDay: "2026-11-17", travelFrom: "home" })).status).toBe(400);
    expect(await fromsOf(alice)).toEqual([]);
  });
});

describe("edit_event with a start of the trip", () => {
  it("changes it, keeps it when left out, and clears it with null", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const { id } = await seedEvent(app.db, alice, { title: "Lunch", start: "2026-11-17T12:30:00Z", end: "2026-11-17T13:30:00Z" });
    const updatedAt = async () => (await app.db.admin<{ updated_at: Date }>("select updated_at from app.events where id = $1", [id]))[0].updated_at.toISOString();
    expect((await edit(id, { ...LUNCH, travelFrom: PLACE, updatedAt: await updatedAt() })).status).toBe(200);
    expect(await fromsOf(alice)).toEqual([PLACE]);
    expect((await edit(id, { ...LUNCH, title: "Long lunch", updatedAt: await updatedAt() })).status).toBe(200);
    expect(await fromsOf(alice)).toEqual([PLACE]);
    expect((await edit(id, { ...LUNCH, travelFrom: null, updatedAt: await updatedAt() })).status).toBe(200);
    expect(await fromsOf(alice)).toEqual([null]);
  });
});
