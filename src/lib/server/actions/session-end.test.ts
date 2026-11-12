// Tests for end_session and cancel_session (spec 04, task F2). Same pattern as session-pause.test.ts:
// the accepted cases check the saved session; each rejected case checks the exact answer and that
// nothing changed, with app.snapshot() before and after.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { seedSession, sessionsOf } from "@test/support/sessions";
import { focusedMinutes } from "@/lib/focus/session-time";
import { startSession } from "./start-session";
import { pauseSession, resumeSession } from "./session-pause";
import { cancelSession, endSession } from "./session-end";

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

const MINUTE = 60_000;

const end = (id: string, headers?: Record<string, string>) =>
  endSession(postJson(`/api/sessions/${id}/end`, {}, headers), app.deps, id);
const cancel = (id: string, headers?: Record<string, string>) =>
  cancelSession(postJson(`/api/sessions/${id}/cancel`, {}, headers), app.deps, id);
const pause = (id: string) => pauseSession(postJson(`/api/sessions/${id}/pause`, {}), app.deps, id);
const resume = (id: string) => resumeSession(postJson(`/api/sessions/${id}/resume`, {}), app.deps, id);

describe("end_session accepted", () => {
  it("A2: 60 minutes from 09:00, paused 09:20 to 09:30, ended 09:55: finished, paused 600 seconds, focused 45 minutes", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const started = await read(
      await startSession(postJson("/api/sessions", { minutes: 60 }), app.deps),
    );
    const id = (started.body as { session: { id: string } }).session.id;

    app.advance(20 * MINUTE);
    expect((await read(await pause(id))).status).toBe(200);
    app.advance(10 * MINUTE);
    expect((await read(await resume(id))).status).toBe(200);
    app.advance(25 * MINUTE);

    const answer = await read(await end(id));
    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({
      message: "Session ended.",
      session: { id, status: "finished", endedAt: "2026-11-16T09:55:00.000Z", pausedSeconds: 600 },
    });
    const [saved] = await sessionsOf(app.db, alice);
    expect(saved).toMatchObject({ status: "finished", paused_at: null, paused_seconds: 600, ended_at: "2026-11-16T09:55:00.000Z" });
    expect(
      focusedMinutes(
        {
          status: "finished",
          plannedMinutes: 60,
          startedAt: new Date("2026-11-16T09:00:00Z"),
          pausedAt: null,
          pausedSeconds: 600,
          endedAt: new Date("2026-11-16T09:55:00Z"),
        },
        new Date("2026-11-16T09:55:00Z"),
      ),
    ).toBe(45);
  });

  it("counts the open pause when a paused session ends (paused 09:20, ended 09:55 without resume: focused 20 minutes)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const id = await seedSession(app.db, alice, { status: "paused", startedAt: "2026-11-16T09:00:00Z", pausedAt: "2026-11-16T09:20:00Z" });
    app.advance(55 * MINUTE); // from 09:00 to 09:55

    expect((await read(await end(id))).status).toBe(200);

    expect(await sessionsOf(app.db, alice)).toMatchObject([
      { status: "finished", paused_at: null, paused_seconds: 2100, ended_at: "2026-11-16T09:55:00.000Z" },
    ]);
  });

  it("deletes a session that ran under one focused minute (40 seconds) and answers 'Under one minute of focus, so it was not saved.' with session null", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const id = await seedSession(app.db, alice, { startedAt: "2026-11-16T09:00:00Z" });
    app.advance(40_000);

    expect(await read(await end(id))).toEqual({
      status: 200,
      body: { message: "Under one minute of focus, so it was not saved.", session: null },
    });
    expect(await sessionsOf(app.db, alice)).toEqual([]);
  });
});

describe("cancel_session accepted", () => {
  it("deletes a running session and answers 'Session cancelled. Nothing was saved.'", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const id = await seedSession(app.db, alice, { startedAt: "2026-11-16T08:50:00Z" });

    expect(await read(await cancel(id))).toEqual({
      status: 200,
      body: { message: "Session cancelled. Nothing was saved." },
    });
    expect(await sessionsOf(app.db, alice)).toEqual([]);
  });

  it("deletes a paused session and answers 'Session cancelled. Nothing was saved.'", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const id = await seedSession(app.db, alice, { status: "paused", startedAt: "2026-11-16T08:30:00Z", pausedAt: "2026-11-16T08:45:00Z" });

    expect(await read(await cancel(id))).toEqual({
      status: 200,
      body: { message: "Session cancelled. Nothing was saved." },
    });
    expect(await sessionsOf(app.db, alice)).toEqual([]);
  });
});

describe("end_session and cancel_session rejected: nothing is saved (R1)", () => {
  it("answers 'This session has already ended' for end and cancel on a finished session; unchanged", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const finished = await seedSession(app.db, alice, {
      status: "finished",
      startedAt: "2026-11-16T08:00:00Z",
      endedAt: "2026-11-16T08:30:00Z",
    });
    const before = await app.snapshot();

    const expected = { status: 409, body: { error: "session_ended", message: "This session has already ended" } };
    expect(await read(await end(finished))).toEqual(expected);
    expect(await read(await cancel(finished))).toEqual(expected);
    expect(await app.snapshot()).toEqual(before);
  });

  it("a running session past its planned end: end answers 'This session has already ended' and keeps the end the server worked out (R13)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    // Planned 30 minutes, started 08:00: due at 08:30, before the clock's 09:00.
    const id = await seedSession(app.db, alice, { plannedMinutes: 30, startedAt: "2026-11-16T08:00:00Z" });

    expect(await read(await end(id))).toEqual({
      status: 409,
      body: { error: "session_ended", message: "This session has already ended" },
    });
    expect(await sessionsOf(app.db, alice)).toMatchObject([{ status: "finished", ended_at: "2026-11-16T08:30:00.000Z" }]);
  });

  describe("end_session", () => {
    const send = end;

    it("answers exactly the same 'Not found' for another user's session, a missing session and a malformed id, and changes nothing (R3)", async () => {
      const bob = await app.signedInAs("bob@example.com");
      const bobs = await seedSession(app.db, bob, { startedAt: "2026-11-16T08:50:00Z" });
      await app.signedInAs("alice@example.com");
      const before = await app.snapshot();

      const othersSession = await read(await send(bobs));
      const missing = await read(await send("00000000-0000-4000-8000-000000000000"));
      const malformed = await read(await send("not-a-uuid"));

      expect(othersSession).toEqual({ status: 404, body: { error: "not_found", message: "Not found" } });
      expect(missing).toEqual(othersSession);
      expect(malformed).toEqual(othersSession);
      expect(await app.snapshot()).toEqual(before);
    });

    it("rejects no session (401) and another site (403); unchanged", async () => {
      const before = await app.snapshot();
      expect((await read(await send("00000000-0000-4000-8000-000000000000"))).status).toBe(401);
      expect(await app.snapshot()).toEqual(before);

      const alice = await app.signedInAs("alice@example.com");
      const id = await seedSession(app.db, alice, { startedAt: "2026-11-16T08:50:00Z" });
      const signedIn = await app.snapshot();
      expect((await send(id, { origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status).toBe(403);
      expect(await app.snapshot()).toEqual(signedIn);
    });
  });

  describe("cancel_session", () => {
    const send = cancel;

    it("answers exactly the same 'Not found' for another user's session, a missing session and a malformed id, and changes nothing (R3)", async () => {
      const bob = await app.signedInAs("bob@example.com");
      const bobs = await seedSession(app.db, bob, { startedAt: "2026-11-16T08:50:00Z" });
      await app.signedInAs("alice@example.com");
      const before = await app.snapshot();

      const othersSession = await read(await send(bobs));
      const missing = await read(await send("00000000-0000-4000-8000-000000000000"));
      const malformed = await read(await send("not-a-uuid"));

      expect(othersSession).toEqual({ status: 404, body: { error: "not_found", message: "Not found" } });
      expect(missing).toEqual(othersSession);
      expect(malformed).toEqual(othersSession);
      expect(await app.snapshot()).toEqual(before);
    });

    it("rejects no session (401) and another site (403); unchanged", async () => {
      const before = await app.snapshot();
      expect((await read(await send("00000000-0000-4000-8000-000000000000"))).status).toBe(401);
      expect(await app.snapshot()).toEqual(before);

      const alice = await app.signedInAs("alice@example.com");
      const id = await seedSession(app.db, alice, { startedAt: "2026-11-16T08:50:00Z" });
      const signedIn = await app.snapshot();
      expect((await send(id, { origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status).toBe(403);
      expect(await app.snapshot()).toEqual(signedIn);
    });
  });
});
