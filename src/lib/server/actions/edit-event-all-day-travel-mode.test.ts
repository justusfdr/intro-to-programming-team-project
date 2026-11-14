// Tests for edit_event turning a timed event into an all-day event: an all-day event has no travel time
// (R29), so the way of getting there it had as a timed event is cleared. A timed edit keeps it, and a
// refused change to all-day changes nothing (R1).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { seedEvent } from "@test/support/events";
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

const edit = async (id: string, body: unknown) => read(await editEvent(postJson(`/api/events/${id}/edit`, body), app.deps, id));
const SEED = { title: "Lunch", start: "2026-11-17T12:30:00Z", end: "2026-11-17T13:30:00Z" };
const modeOf = async (id: string) => (await app.db.admin<{ travel_mode: string | null }>("select travel_mode from app.events where id = $1", [id]))[0].travel_mode;

async function timedWithMode(email: string, mode: string) {
  const user = await app.signedInAs(email, { timeZone: "Europe/Lisbon" });
  const { id } = await seedEvent(app.db, user, SEED);
  await app.db.admin("update app.events set travel_mode = $2 where id = $1", [id, mode]);
  const [row] = await app.db.admin<{ updated_at: Date }>("select updated_at from app.events where id = $1", [id]);
  return { user, id, updatedAt: new Date(row.updated_at).toISOString() };
}

describe("edit_event: a timed event becomes all-day", () => {
  it("clears the event's travel mode and answers with none", async () => {
    const { id, updatedAt } = await timedWithMode("alice@example.com", "transit");
    const answer = await edit(id, { title: "Trip", allDay: true, firstDay: "2026-11-20", lastDay: "2026-11-21", updatedAt });
    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({ event: { allDay: true, travelMode: null } });
    expect(await modeOf(id)).toBeNull();
  });

  it("keeps the travel mode when the event stays timed", async () => {
    const { id, updatedAt } = await timedWithMode("alice@example.com", "cycling");
    expect((await edit(id, { title: "Lunch", start: "2026-11-17T13:00", end: "2026-11-17T14:00", updatedAt })).status).toBe(200);
    expect(await modeOf(id)).toBe("cycling");
  });

  it("changes nothing when the change to all-day is refused (R1)", async () => {
    const { id, updatedAt } = await timedWithMode("alice@example.com", "walking");
    const before = await app.snapshot();
    // The last day before the first: refused.
    expect((await edit(id, { title: "Trip", allDay: true, firstDay: "2026-11-21", lastDay: "2026-11-20", updatedAt })).status).toBe(400);
    expect(await app.snapshot()).toEqual(before);
    expect(await modeOf(id)).toBe("walking");
  });

  it("changes nothing on an outdated edit (R4)", async () => {
    const { id } = await timedWithMode("alice@example.com", "driving");
    const before = await app.snapshot();
    const answer = await edit(id, { title: "Trip", allDay: true, firstDay: "2026-11-20", lastDay: "2026-11-21", updatedAt: "2026-01-01T00:00:00.000Z" });
    expect(answer.status).toBe(409);
    expect(await app.snapshot()).toEqual(before);
  });
});
