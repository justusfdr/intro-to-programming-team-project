// Tests for mark_event_done and mark_event_planned (spec 02, task E3). Same pattern as delete-event.test.ts:
// the accepted case checks the saved status; each rejected case checks the exact answer and that nothing
// changed, with app.snapshot() before and after. Neither action takes a body, so requests send none.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { eventsOf, seedEvent } from "@test/support/events";
import { markEventDone, markEventPlanned } from "./event-status";

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

// The clock starts at 09:00 UTC on Monday 16 November 2026; this event starts at 10:00 UTC.
const LATER = { title: "Half-marathon long run", start: "2026-11-16T10:00:00Z", end: "2026-11-16T11:00:00Z" };
// An event that started at 08:00 UTC, before the clock's 09:00.
const EARLIER = { title: "Statistics lecture", start: "2026-11-16T08:00:00Z", end: "2026-11-16T09:30:00Z" };

describe("mark_event_done", () => {
  function send(id: string, headers?: Record<string, string>) {
    return markEventDone(postJson(`/api/events/${id}/done`, {}, headers), app.deps, id);
  }

  it("rejects marking done before the start: 409 'You can mark an event done once it has started'; nothing changes", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { id } = await seedEvent(app.db, alice, LATER);
    const before = await app.snapshot();

    const answer = await read(await send(id));

    expect(answer).toEqual({
      status: 409,
      body: { error: "not_started", message: "You can mark an event done once it has started" },
    });
    expect(await app.snapshot()).toEqual(before);
  });

  it("accepts marking done exactly at the start, and after it: status done", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const atStart = await seedEvent(app.db, alice, LATER);
    const started = await seedEvent(app.db, alice, { ...EARLIER, title: "Reading" });

    app.advance(60 * 60 * 1000); // 10:00, the exact start of LATER
    const exact = await read(await send(atStart.id));
    expect(exact.status).toBe(200);
    expect(exact.body).toMatchObject({ event: { id: atStart.id, status: "done" } });

    app.advance(60 * 60 * 1000); // 11:00, after the start
    const after = await read(await send(started.id));
    expect(after.status).toBe(200);

    const saved = await eventsOf(app.db, alice);
    expect(saved.map((row) => [row.title, row.status])).toEqual([
      ["Reading", "done"],
      ["Half-marathon long run", "done"],
    ]);
  });

  it("marking a done event done again answers 200 and leaves updated_at unchanged", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedEvent(app.db, alice, { ...EARLIER, status: "done" });
    const [before] = await eventsOf(app.db, alice);

    const answer = await read(await send(before.id as string));

    expect(answer.status).toBe(200);
    const [after] = await eventsOf(app.db, alice);
    expect(after.status).toBe("done");
    expect(after.updated_at).toEqual(before.updated_at);
  });

  it("answers exactly the same 'Not found' for another user's event, a missing event and a malformed id, and changes nothing (R3, A8)", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const bobs = await seedEvent(app.db, bob, { start: "2026-11-16T07:00:00Z", end: "2026-11-16T08:00:00Z" });
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();

    const othersEvent = await read(await send(bobs.id));
    const missing = await read(await send("00000000-0000-4000-8000-000000000000"));
    const malformed = await read(await send("not-a-uuid"));

    expect(othersEvent).toEqual({ status: 404, body: { error: "not_found", message: "Not found" } });
    expect(missing).toEqual(othersEvent);
    expect(malformed).toEqual(othersEvent);
    expect(await app.snapshot()).toEqual(before);
  });

  it("answers 401 without a session and changes nothing (R3)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { id } = await seedEvent(app.db, alice, EARLIER);
    await app.auth.signOut();
    const before = await app.snapshot();

    const answer = await read(await send(id));

    expect(answer).toEqual({ status: 401, body: { error: "unauthorized", message: "Please sign in." } });
    expect(await app.snapshot()).toEqual(before);
  });

  it("rejects a request from another site (403) and changes nothing", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { id } = await seedEvent(app.db, alice, EARLIER);
    const before = await app.snapshot();
    const response = await send(id, { origin: "https://evil.example", "sec-fetch-site": "cross-site" });
    expect(response.status).toBe(403);
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("mark_event_planned", () => {
  function send(id: string, headers?: Record<string, string>) {
    return markEventPlanned(postJson(`/api/events/${id}/planned`, {}, headers), app.deps, id);
  }

  it("turns a done event back to planned", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { id } = await seedEvent(app.db, alice, { ...EARLIER, status: "done" });

    const answer = await read(await send(id));

    expect(answer).toMatchObject({ status: 200, body: { event: { id, status: "planned" } } });
    expect(await eventsOf(app.db, alice)).toMatchObject([{ status: "planned" }]);
  });

  it("marking a planned event planned again answers 200 and leaves updated_at unchanged", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedEvent(app.db, alice, LATER);
    const [before] = await eventsOf(app.db, alice);

    const answer = await read(await send(before.id as string));

    expect(answer.status).toBe(200);
    const [after] = await eventsOf(app.db, alice);
    expect(after.status).toBe("planned");
    expect(after.updated_at).toEqual(before.updated_at);
  });

  it("answers exactly the same 'Not found' for another user's event, a missing event and a malformed id, and changes nothing (R3, A8)", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const bobs = await seedEvent(app.db, bob, { start: "2026-11-16T07:00:00Z", end: "2026-11-16T08:00:00Z" });
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();

    const othersEvent = await read(await send(bobs.id));
    const missing = await read(await send("00000000-0000-4000-8000-000000000000"));
    const malformed = await read(await send("not-a-uuid"));

    expect(othersEvent).toEqual({ status: 404, body: { error: "not_found", message: "Not found" } });
    expect(missing).toEqual(othersEvent);
    expect(malformed).toEqual(othersEvent);
    expect(await app.snapshot()).toEqual(before);
  });

  it("answers 401 without a session and changes nothing (R3)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { id } = await seedEvent(app.db, alice, { ...EARLIER, status: "done" });
    await app.auth.signOut();
    const before = await app.snapshot();

    const answer = await read(await send(id));

    expect(answer).toEqual({ status: 401, body: { error: "unauthorized", message: "Please sign in." } });
    expect(await app.snapshot()).toEqual(before);
  });

  it("rejects a request from another site (403) and changes nothing", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { id } = await seedEvent(app.db, alice, { ...EARLIER, status: "done" });
    const before = await app.snapshot();
    const response = await send(id, { origin: "https://evil.example", "sec-fetch-site": "cross-site" });
    expect(response.status).toBe(403);
    expect(await app.snapshot()).toEqual(before);
  });
});
