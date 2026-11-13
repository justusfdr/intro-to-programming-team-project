// Tests for start_session (spec 04, What lines 1 to 4). Reference pattern for the session actions.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { seedEvent } from "@test/support/events";
import { seedSession, sessionsOf } from "@test/support/sessions";
import { startSession } from "./start-session";

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.reset(); // Monday 16 November 2026, 09:00 UTC
});

function send(body: unknown, headers?: Record<string, string>) {
  return startSession(postJson("/api/sessions", body, headers), app.deps);
}

describe("start_session accepted", () => {
  it("starts 60 minutes without event: running, started now by the server's clock, nothing paused", async () => {
    const alice = await app.signedInAs("alice@example.com");

    const answer = await read(await send({ minutes: 60 }));

    expect(answer.status).toBe(201);
    expect(answer.body).toMatchObject({
      message: "Focus session started.",
      session: { status: "running", plannedMinutes: 60, startedAt: "2026-11-16T09:00:00.000Z", pausedSeconds: 0, eventId: null },
    });
    expect(await sessionsOf(app.db, alice)).toMatchObject([
      { status: "running", planned_minutes: 60, started_at: "2026-11-16T09:00:00.000Z", paused_at: null, paused_seconds: 0, ended_at: null, rating: null },
    ]);
  });

  it.each([1, 15, 25, 30, 70, 90, 120, 240])("accepts %i minutes (R12)", async (minutes) => {
    await app.signedInAs("alice@example.com");
    expect((await send({ minutes })).status).toBe(201);
  });

  it("links the user's own event and answers its title", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const event = await seedEvent(app.db, alice, { title: "Statistics revision", start: "2026-11-16T09:00:00Z", end: "2026-11-16T11:00:00Z" });
    const answer = await read(await send({ minutes: 120, eventId: event.id }));
    expect(answer.body).toMatchObject({ session: { eventId: event.id, eventTitle: "Statistics revision" } });
  });

  it("starts again once the last session has finished by itself (R13)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedSession(app.db, alice, { plannedMinutes: 15, startedAt: "2026-11-16T08:00:00Z" }); // due at 08:15
    expect((await send({ minutes: 30 })).status).toBe(201);
    const sessions = await sessionsOf(app.db, alice);
    expect(sessions.map((s) => [s.status, s.ended_at])).toEqual([
      ["finished", "2026-11-16T08:15:00.000Z"],
      ["running", null],
    ]);
  });
});

describe("start_session rejected: nothing is saved (R1)", () => {
  it.each([0, 241, 600, 60.5, -15])("rejects %s minutes with 'Choose a length from 1 to 240 minutes' (A10)", async (minutes) => {
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    expect(await read(await send({ minutes }))).toEqual({
      status: 400,
      body: { error: "choose_length", message: "Choose a length from 1 to 240 minutes" },
    });
    expect(await app.snapshot()).toEqual(before);
  });

  it.each([
    ["running", { startedAt: "2026-11-16T08:50:00Z" }],
    ["paused", { status: "paused" as const, startedAt: "2026-11-16T08:30:00Z", pausedAt: "2026-11-16T08:45:00Z" }],
  ])("answers 'A session is already running' while one is %s (R4)", async (_state, seeded) => {
    const alice = await app.signedInAs("alice@example.com");
    await seedSession(app.db, alice, seeded);
    const before = await app.snapshot();
    expect(await read(await send({ minutes: 30 }))).toEqual({
      status: 409,
      body: { error: "session_running", message: "A session is already running" },
    });
    expect(await app.snapshot()).toEqual(before);
  });

  it("answers exactly the same 'Not found' for another user's event, a missing event and a malformed id (R3)", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const bobs = await seedEvent(app.db, bob, { start: "2026-11-16T07:00:00Z", end: "2026-11-16T08:00:00Z" });
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();

    const othersEvent = await read(await send({ minutes: 60, eventId: bobs.id }));
    const missing = await read(await send({ minutes: 60, eventId: "00000000-0000-4000-8000-000000000000" }));
    const malformed = await read(await send({ minutes: 60, eventId: "not-a-uuid" }));

    expect(othersEvent).toEqual({ status: 404, body: { error: "not_found", message: "Not found" } });
    expect(missing).toEqual(othersEvent);
    expect(malformed).toEqual(othersEvent);
    expect(await app.snapshot()).toEqual(before);
  });

  it("rejects a body of the wrong shape (400), no session (401) and another site (403); nothing saved", async () => {
    const before = await app.snapshot();
    expect((await read(await send({ minutes: 60 }))).status).toBe(401);
    expect(await app.snapshot()).toEqual(before);

    await app.signedInAs("alice@example.com");
    const signedIn = await app.snapshot();
    expect((await send({ minutes: "60" })).status).toBe(400);
    expect((await send({ minutes: 60 }, { origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect(await app.snapshot()).toEqual(signedIn);
  });
});
