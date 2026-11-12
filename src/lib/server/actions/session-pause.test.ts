// Tests for pause_session and resume_session (spec 04, task F1). Same pattern as start-session.test.ts:
// the accepted cases check the saved session; each rejected case checks the exact answer and that
// nothing changed, with app.snapshot() before and after.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { seedSession, sessionsOf } from "@test/support/sessions";
import { pauseSession, resumeSession } from "./session-pause";

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

const pause = (id: string, headers?: Record<string, string>) =>
  pauseSession(postJson(`/api/sessions/${id}/pause`, {}, headers), app.deps, id);
const resume = (id: string, headers?: Record<string, string>) =>
  resumeSession(postJson(`/api/sessions/${id}/resume`, {}, headers), app.deps, id);

describe("pause_session accepted", () => {
  const send = pause;

  it("pauses a running session at the clock's time: paused, paused_at set, answer 'Paused.' with the session", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const id = await seedSession(app.db, alice, { startedAt: "2026-11-16T09:00:00Z" });
    app.advance(5 * MINUTE);

    const answer = await read(await send(id));

    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({
      message: "Paused.",
      session: { id, status: "paused", pausedAt: "2026-11-16T09:05:00.000Z", pausedSeconds: 0 },
    });
    expect(await sessionsOf(app.db, alice)).toMatchObject([
      { status: "paused", paused_at: "2026-11-16T09:05:00.000Z", paused_seconds: 0, ended_at: null },
    ]);
  });
});

describe("resume_session accepted", () => {
  const send = resume;

  it("resumes a session paused 10 minutes: running, paused_seconds 600, paused_at empty; answer 'Resumed.'", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const id = await seedSession(app.db, alice, { status: "paused", startedAt: "2026-11-16T09:00:00Z", pausedAt: "2026-11-16T09:00:00Z" });
    app.advance(10 * MINUTE);

    const answer = await read(await send(id));

    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({
      message: "Resumed.",
      session: { id, status: "running", pausedAt: null, pausedSeconds: 600 },
    });
    expect(await sessionsOf(app.db, alice)).toMatchObject([
      { status: "running", paused_at: null, paused_seconds: 600, ended_at: null },
    ]);
  });
});

describe("pause and resume together", () => {
  it("adds up two pauses of 5 and 10 minutes to 900 paused seconds", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const id = await seedSession(app.db, alice, { startedAt: "2026-11-16T09:00:00Z" });

    app.advance(10 * MINUTE);
    expect((await read(await pause(id))).status).toBe(200);
    app.advance(5 * MINUTE);
    expect((await read(await resume(id))).status).toBe(200);
    app.advance(5 * MINUTE);
    expect((await read(await pause(id))).status).toBe(200);
    app.advance(10 * MINUTE);
    expect((await read(await resume(id))).status).toBe(200);

    expect(await sessionsOf(app.db, alice)).toMatchObject([{ status: "running", paused_seconds: 900, paused_at: null }]);
  });

  it("keeps a paused session paused a day later and still resumes it", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const id = await seedSession(app.db, alice, { status: "paused", startedAt: "2026-11-16T09:00:00Z", pausedAt: "2026-11-16T09:00:00Z" });

    app.advance(24 * 60 * MINUTE);
    expect(await sessionsOf(app.db, alice)).toMatchObject([{ status: "paused", ended_at: null }]);

    const answer = await read(await resume(id));
    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({ message: "Resumed.", session: { status: "running", pausedSeconds: 86400 } });
  });

  it("a running session past its planned end is finished by itself first: pausing answers 'This session has already ended' and ends at start + planned + paused", async () => {
    const alice = await app.signedInAs("alice@example.com");
    // Planned 30 minutes, paused 10 minutes earlier: due at 08:40, before the clock's 09:00.
    const id = await seedSession(app.db, alice, { plannedMinutes: 30, pausedSeconds: 600, startedAt: "2026-11-16T08:00:00Z" });

    expect(await read(await pause(id))).toEqual({
      status: 409,
      body: { error: "session_ended", message: "This session has already ended" },
    });
    expect(await sessionsOf(app.db, alice)).toMatchObject([{ status: "finished", ended_at: "2026-11-16T08:40:00.000Z" }]);
  });
});

describe("pause_session and resume_session rejected: nothing is saved (R1)", () => {
  it("answers 'Not possible in this state' when pausing a paused session; unchanged", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const paused = await seedSession(app.db, alice, { status: "paused", startedAt: "2026-11-16T08:30:00Z", pausedAt: "2026-11-16T08:45:00Z" });
    const before = await app.snapshot();

    expect(await read(await pause(paused))).toEqual({
      status: 409,
      body: { error: "not_possible", message: "Not possible in this state" },
    });
    expect(await app.snapshot()).toEqual(before);
  });

  it("answers 'Not possible in this state' when resuming a running session; unchanged", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const running = await seedSession(app.db, alice, { plannedMinutes: 15, startedAt: "2026-11-16T08:55:00Z" });
    const before = await app.snapshot();

    expect(await read(await resume(running))).toEqual({
      status: 409,
      body: { error: "not_possible", message: "Not possible in this state" },
    });
    expect(await app.snapshot()).toEqual(before);
  });

  it("answers 'This session has already ended' for pause and resume on a finished session; unchanged", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const finished = await seedSession(app.db, alice, {
      status: "finished",
      startedAt: "2026-11-16T08:00:00Z",
      endedAt: "2026-11-16T08:30:00Z",
    });
    const before = await app.snapshot();

    const expected = { status: 409, body: { error: "session_ended", message: "This session has already ended" } };
    expect(await read(await pause(finished))).toEqual(expected);
    expect(await read(await resume(finished))).toEqual(expected);
    expect(await app.snapshot()).toEqual(before);
  });

  describe("pause_session", () => {
    const send = pause;

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

  describe("resume_session", () => {
    const send = resume;

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
      const id = await seedSession(app.db, alice, { status: "paused", startedAt: "2026-11-16T08:30:00Z", pausedAt: "2026-11-16T08:45:00Z" });
      const signedIn = await app.snapshot();
      expect((await send(id, { origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status).toBe(403);
      expect(await app.snapshot()).toEqual(signedIn);
    });
  });
});
