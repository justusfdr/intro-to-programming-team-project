// Tests for edit_event (spec 02, task E1). Same pattern as create-event.test.ts: the accepted case
// checks every saved field; each rejected case checks the exact message and that nothing changed,
// with app.snapshot() before and after. The two-device case (R4) is tested as two requests.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { eventsOf, seedEvent } from "@test/support/events";
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

function send(id: string, body: unknown, headers?: Record<string, string>) {
  return editEvent(postJson(`/api/events/${id}/edit`, body, headers), app.deps, id);
}

// The event as it was seen by the device: 09:00 to 10:00 UTC on Monday 16 November 2026 (Lisbon is UTC in November).
const SEED = { title: "Statistics revision", start: "2026-11-16T09:00:00Z", end: "2026-11-16T10:00:00Z" };
const EDIT = { title: "Revision", start: "2026-11-16T10:00", end: "2026-11-16T12:00", mayOverlap: true };

const BODY_FOR = (e: { updatedAt: string }) => ({ title: "Statistics revision", start: "2026-11-16T09:00", end: "2026-11-16T11:00", updatedAt: e.updatedAt });

describe("edit_event accepted", () => {
  it("changes title, times and may_overlap; status, source and user_id stay; updated_at grows; answers 200 with 'Event saved.' and the new event", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const { id, updatedAt } = await seedEvent(app.db, alice, { ...SEED, status: "done" });
    const [before] = await eventsOf(app.db, alice);

    const answer = await read(await send(id, { ...EDIT, updatedAt }));

    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({
      message: "Event saved.",
      event: {
        id,
        title: "Revision",
        startAt: "2026-11-16T10:00:00.000Z",
        endAt: "2026-11-16T12:00:00.000Z",
        mayOverlap: true,
        status: "done",
      },
    });
    const [after] = await eventsOf(app.db, alice);
    expect(after).toMatchObject({ id, title: "Revision", may_overlap: true, status: "done", source: before.source });
    expect(new Date(after.start_at as Date).toISOString()).toBe("2026-11-16T10:00:00.000Z");
    expect(new Date(after.end_at as Date).toISOString()).toBe("2026-11-16T12:00:00.000Z");
    expect(new Date(after.updated_at as Date).getTime()).toBeGreaterThan(Date.parse(updatedAt));
  });

  it("reads the new times in the user's time zone and stores them in UTC", async () => {
    const ny = await app.signedInAs("nora@example.com", { timeZone: "America/New_York" });
    const { id, updatedAt } = await seedEvent(app.db, ny, SEED);
    expect((await send(id, { ...EDIT, updatedAt })).status).toBe(200);
    const [saved] = await eventsOf(app.db, ny);
    expect(new Date(saved.start_at as Date).toISOString()).toBe("2026-11-16T15:00:00.000Z");
  });
});

describe("edit_event rejected: nothing is changed (R1, A10)", () => {
  it.each([
    ["an empty title", { title: "" }, 400, "title_length", "Title must be 1 to 100 characters"],
    ["a title of only spaces", { title: "   " }, 400, "title_length", "Title must be 1 to 100 characters"],
    ["a 101-character title", { title: "x".repeat(101) }, 400, "title_length", "Title must be 1 to 100 characters"],
    ["14:00 to 13:00", { start: "2026-11-16T14:00", end: "2026-11-16T13:00" }, 400, "end_before_start", "End must be after start"],
    ["an end equal to the start", { end: "2026-11-16T10:00" }, 400, "end_before_start", "End must be after start"],
    ["25 hours", { end: "2026-11-17T11:00" }, 400, "too_long", "An event can last at most 24 hours"],
  ])("rejects %s", async (_case, change, status, error, message) => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const { id, updatedAt } = await seedEvent(app.db, alice, SEED);
    const before = await app.snapshot();

    const answer = await read(await send(id, { ...EDIT, ...change, updatedAt }));

    expect(answer).toEqual({ status, body: { error, message } });
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("edit_event: 'Not found' for another user's event (R3, A8)", () => {
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
});

describe("edit_event: two devices (R4, A7)", () => {
  it("the first save stays; a save with an older updated_at is rejected with 'Changed on another device. Reload to see the latest version'", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const { id, updatedAt } = await seedEvent(app.db, alice, SEED);
    // Laptop and desktop both loaded the event, so both hold the same updated_at.

    const laptop = await read(
      await send(id, { title: "Statistics revision", start: "2026-11-16T10:00", end: "2026-11-16T11:00", updatedAt }),
    );
    expect(laptop.status).toBe(200);
    const before = await app.snapshot();

    const desktop = await read(await send(id, { title: "Revision", start: "2026-11-16T09:00", end: "2026-11-16T10:00", updatedAt }));

    expect(desktop).toEqual({
      status: 409,
      body: { error: "changed_elsewhere", message: "Changed on another device. Reload to see the latest version" },
    });
    expect(await app.snapshot()).toEqual(before);
    const [saved] = await eventsOf(app.db, alice);
    expect(saved).toMatchObject({ title: "Statistics revision" });
    expect(new Date(saved.start_at as Date).toISOString()).toBe("2026-11-16T10:00:00.000Z");
  });

  it("an updated_at that is not a time ('yesterday') is treated as stale: 409, nothing changed", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const { id } = await seedEvent(app.db, alice, SEED);
    const before = await app.snapshot();

    const answer = await read(await send(id, { ...EDIT, updatedAt: "yesterday" }));

    expect(answer).toEqual({
      status: 409,
      body: { error: "changed_elsewhere", message: "Changed on another device. Reload to see the latest version" },
    });
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("edit_event: sign-in and same-origin checks (R3)", () => {
  it("answers 401 without a session and changes nothing", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const { id, updatedAt } = await seedEvent(app.db, alice, SEED);
    await app.auth.signOut();
    const before = await app.snapshot();

    const answer = await read(await send(id, { ...EDIT, updatedAt }));

    expect(answer).toEqual({ status: 401, body: { error: "unauthorized", message: "Please sign in." } });
    expect(await app.snapshot()).toEqual(before);
  });

  it("rejects a request from another site (403) and changes nothing", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const { id, updatedAt } = await seedEvent(app.db, alice, SEED);
    const before = await app.snapshot();

    const response = await send(id, { ...EDIT, updatedAt }, { origin: "https://evil.example", "sec-fetch-site": "cross-site" });

    expect(response.status).toBe(403);
    expect(await app.snapshot()).toEqual(before);
  });
});
