// Tests for rate_session (spec 04, task F3). Same pattern as start-session.test.ts.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { seedSession, sessionsOf } from "@test/support/sessions";
import { rateSession } from "./session-rate";

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

function send(id: string, body: unknown = { rating: 3 }, headers?: Record<string, string>) {
  return rateSession(postJson(`/api/sessions/${id}/rate`, body, headers), app.deps, id);
}

/** A session that finished at 08:30, 30 minutes long. */
const finished = { status: "finished" as const, startedAt: "2026-11-16T08:00:00Z", plannedMinutes: 30, endedAt: "2026-11-16T08:30:00Z" };

describe("rate_session accepted", () => {
  it("saves a rating of 4 on a finished session, then changes it to 0 (0 is kept, not empty)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const id = await seedSession(app.db, alice, finished);

    const first = await read(await send(id, { rating: 4 }));
    expect(first).toMatchObject({ status: 200, body: { message: "Rating saved.", session: { id, status: "finished", rating: 4 } } });
    expect((await sessionsOf(app.db, alice))[0].rating).toBe(4);

    const changed = await read(await send(id, { rating: 0 }));
    expect(changed).toMatchObject({ status: 200, body: { message: "Rating saved.", session: { id, rating: 0 } } });
    expect((await sessionsOf(app.db, alice))[0].rating).toBe(0);
  });

  it("an unrated finished session keeps its rating empty (null, not 0) when another session is rated", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const rated = await seedSession(app.db, alice, { ...finished, startedAt: "2026-11-16T07:00:00Z", endedAt: "2026-11-16T07:30:00Z" });
    await seedSession(app.db, alice, finished);

    expect((await read(await send(rated, { rating: 4 }))).status).toBe(200);

    expect((await sessionsOf(app.db, alice)).map((s) => s.rating)).toEqual([4, null]);
  });
});

describe("rate_session rejected: nothing is saved (R1)", () => {
  it.each([6, 4.5, -1])("rejects %s with 'Rating must be a whole number from 0 to 5', the old rating stays", async (rating) => {
    const alice = await app.signedInAs("alice@example.com");
    const id = await seedSession(app.db, alice, { ...finished, rating: 2 });
    const before = await app.snapshot();

    expect(await read(await send(id, { rating }))).toEqual({
      status: 400,
      body: { error: "rating_range", message: "Rating must be a whole number from 0 to 5" },
    });
    expect((await sessionsOf(app.db, alice))[0].rating).toBe(2);
    expect(await app.snapshot()).toEqual(before);
  });

  it.each([
    ["running", { startedAt: "2026-11-16T08:50:00Z" }],
    ["paused", { status: "paused" as const, startedAt: "2026-11-16T08:30:00Z", pausedAt: "2026-11-16T08:45:00Z" }],
  ])("answers 'Not possible in this state' while the session is %s (R13)", async (_state, seeded) => {
    const alice = await app.signedInAs("alice@example.com");
    const id = await seedSession(app.db, alice, seeded);
    const before = await app.snapshot();

    expect(await read(await send(id, { rating: 3 }))).toEqual({
      status: 409,
      body: { error: "not_possible", message: "Not possible in this state" },
    });
    expect(await app.snapshot()).toEqual(before);
  });

  it.each([{ rating: "4" }, { rating: null }, {}])("rejects a body without a number (%j) as a 400 shape error; unchanged", async (body) => {
    const alice = await app.signedInAs("alice@example.com");
    const id = await seedSession(app.db, alice, finished);
    const before = await app.snapshot();

    expect((await read(await send(id, body))).status).toBe(400);
    expect(await app.snapshot()).toEqual(before);
  });

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

  it("rejects no session (401) and another site (403); nothing saved", async () => {
    const before = await app.snapshot();
    expect((await read(await send("00000000-0000-4000-8000-000000000000"))).status).toBe(401);
    expect(await app.snapshot()).toEqual(before);

    const alice = await app.signedInAs("alice@example.com");
    const id = await seedSession(app.db, alice, finished);
    const signedIn = await app.snapshot();
    expect((await send(id, { rating: 3 }, { origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect(await app.snapshot()).toEqual(signedIn);
  });
});
