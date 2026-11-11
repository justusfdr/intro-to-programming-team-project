// Tests for delete_event (spec 02, task E2). Same pattern as edit-event.test.ts: the accepted case
// checks what is left; each rejected case checks the exact answer and that nothing changed,
// with app.snapshot() before and after. The two-device case (R4) is tested as two requests.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { eventsOf, seedEvent } from "@test/support/events";
import { deleteEvent } from "./delete-event";

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

function send(id: string, body: unknown, headers?: Record<string, string>) {
  return deleteEvent(postJson(`/api/events/${id}/delete`, body, headers), app.deps, id);
}

// The event as the device saw it: 09:00 to 10:00 UTC on Monday 16 November 2026.
const SEED = { title: "Statistics revision", start: "2026-11-16T09:00:00Z", end: "2026-11-16T10:00:00Z" };
const OTHER = { title: "Call", start: "2026-11-16T11:00:00Z", end: "2026-11-16T12:00:00Z" };

const BODY_FOR = (e: { updatedAt: string }) => ({ updatedAt: e.updatedAt });

describe("delete_event accepted", () => {
  it("removes the event, keeps the user's other events, and answers 200 'Event deleted.'", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const { id, updatedAt } = await seedEvent(app.db, alice, SEED);
    await seedEvent(app.db, alice, OTHER);

    const answer = await read(await send(id, { updatedAt }));

    expect(answer).toEqual({ status: 200, body: { message: "Event deleted." } });
    const left = await eventsOf(app.db, alice);
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ title: "Call" });
  });
});

describe("delete_event: 'Not found' for another user's event (R3, A8)", () => {
  it("answers exactly the same 'Not found' for another user's event, a missing event and a malformed id, and changes nothing (R3, A8)", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const bobs = await seedEvent(app.db, bob, { start: "2026-11-16T07:00:00Z", end: "2026-11-16T08:00:00Z" });
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();

    const othersEvent = await read(await send(bobs.id, BODY_FOR(bobs)));
    const missing = await read(await send("00000000-0000-4000-8000-000000000000", BODY_FOR(bobs)));
    const malformed = await read(await send("not-a-uuid", BODY_FOR(bobs)));

    expect(othersEvent).toEqual({ status: 404, body: { error: "not_found", message: "Not found" } });
    expect(missing).toEqual(othersEvent);
    expect(malformed).toEqual(othersEvent);
    expect(await app.snapshot()).toEqual(before);
  });

  it("answers 'Not found' when the same event is deleted a second time, and changes nothing more", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const { id, updatedAt } = await seedEvent(app.db, alice, SEED);
    expect((await read(await send(id, { updatedAt }))).status).toBe(200);
    const before = await app.snapshot();

    const again = await read(await send(id, { updatedAt }));

    expect(again).toEqual({ status: 404, body: { error: "not_found", message: "Not found" } });
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("delete_event: two devices (R4, A7)", () => {
  it("a delete with an older updated_at is rejected with 'Changed on another device. Reload to see the latest version'; the laptop's change stays", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const { id, updatedAt } = await seedEvent(app.db, alice, SEED);
    // Laptop and desktop both loaded the event, so both hold the same updated_at.

    // The laptop changes the title first (the database sets a newer updated_at).
    await app.db.admin("update app.events set title = $2 where id = $1", [id, "Revision"]);
    const before = await app.snapshot();

    const desktop = await read(await send(id, { updatedAt }));

    expect(desktop).toEqual({
      status: 409,
      body: { error: "changed_elsewhere", message: "Changed on another device. Reload to see the latest version" },
    });
    expect(await app.snapshot()).toEqual(before);
    const [saved] = await eventsOf(app.db, alice);
    expect(saved).toMatchObject({ title: "Revision" });
  });
});

describe("delete_event: sign-in and same-origin checks (R3)", () => {
  it("answers 401 without a session and deletes nothing", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const { id, updatedAt } = await seedEvent(app.db, alice, SEED);
    await app.auth.signOut();
    const before = await app.snapshot();

    const answer = await read(await send(id, { updatedAt }));

    expect(answer).toEqual({ status: 401, body: { error: "unauthorized", message: "Please sign in." } });
    expect(await app.snapshot()).toEqual(before);
  });

  it("rejects a request from another site (403) and deletes nothing", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const { id, updatedAt } = await seedEvent(app.db, alice, SEED);
    const before = await app.snapshot();

    const response = await send(id, { updatedAt }, { origin: "https://evil.example", "sec-fetch-site": "cross-site" });

    expect(response.status).toBe(403);
    expect(await app.snapshot()).toEqual(before);
  });
});
