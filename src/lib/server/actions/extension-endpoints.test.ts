// Tests for the extension's two requests (spec 05; blocker design): the origin rule side by side,
// the state (R15, R16, A3), extension_seen_at (R18), and attempts (record_attempt).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, fromExtension, read, type TestApp } from "@test/support/app";
import { attemptsOf, DEFAULT_SITES } from "@test/support/blocker";
import { seedEvent } from "@test/support/events";
import { seedGoal } from "@test/support/goals";
import { seedSession } from "@test/support/sessions";
import { extensionAttempts } from "./extension-attempts";
import { extensionState } from "./extension-state";

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

const state = (headers?: Record<string, string>) => extensionState(fromExtension("/api/extension/state", {}, headers), app.deps);
const attempts = (list: unknown, headers?: Record<string, string>) =>
  extensionAttempts(fromExtension("/api/extension/attempts", { attempts: list }, headers), app.deps);

async function seenAt(userId: string) {
  const [row] = await app.db.admin<{ seen: boolean }>("select extension_seen_at is not null as seen from app.profiles where id = $1", [userId]);
  return row.seen;
}

describe("only our extension, signed in, gets an answer (blocker design)", () => {
  // Every refused request gets exactly this answer, with no data, and nothing changes.
  const REFUSED = { status: 403, body: { error: "forbidden", message: "This request came from another site and was blocked." } };

  it.each([
    ["another extension's origin", { origin: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }],
    ["a web page's origin", { origin: "https://evil.example", "sec-fetch-site": "cross-site" }],
    ["our own app's page", { origin: "http://localhost:3000", "sec-fetch-site": "same-origin" }],
    ["a missing origin", { origin: "" }],
    ["our origin with Sec-Fetch-Site cross-site", { "sec-fetch-site": "cross-site" }],
    ["our origin with Sec-Fetch-Site same-site", { "sec-fetch-site": "same-site" }],
    ["our origin without Sec-Fetch-Site", { "sec-fetch-site": "" }],
    ["another host", { host: "evil.example" }],
  ])("refuses %s with the same answer for state and attempts, and changes nothing", async (_case, headers) => {
    const alice = await app.signedInAs("alice@example.com");
    const before = await app.snapshot();

    const forState = await read(await state(headers));
    const forAttempts = await read(await attempts([{ domain: "x.com", attemptedAt: "2026-11-16T08:59:00Z" }], headers));

    expect(forState).toEqual(REFUSED);
    expect(forAttempts).toEqual(REFUSED);
    expect(await app.snapshot()).toEqual(before);
    expect(await seenAt(alice)).toBe(false);
  });

  it("answers 401 and no data when signed out (R16)", async () => {
    const before = await app.snapshot();
    expect(await read(await state())).toEqual({ status: 401, body: { error: "unauthorized", message: "Please sign in." } });
    expect((await read(await attempts([]))).status).toBe(401);
    expect(await app.snapshot()).toEqual(before);
  });

  it("accepts our extension: the answer holds only the list, blocking_on and blocking_until", async () => {
    await app.signedInAs("alice@example.com");
    const answer = await read(await state());
    expect(answer).toEqual({ status: 200, body: { sites: DEFAULT_SITES.slice().sort(), blockingOn: false, blockingUntil: null } });
    expect(Object.keys(answer.body).sort()).toEqual(["blockingOn", "blockingUntil", "sites"]);
  });
});

describe("the state (R15, R16)", () => {
  it("A3: auto-block goal, event 09:00 to 11:00, no session: asked at 10:15, on until 11:00; at 11:00 off", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const goal = await seedGoal(app.db, alice, { deadline: "2027-03-14", autoBlock: true, rules: [{ kind: "count", target: 2 }] });
    await seedEvent(app.db, alice, { start: "2026-11-16T09:00:00Z", end: "2026-11-16T11:00:00Z", goalId: goal.id });

    app.advance(75 * 60_000); // 10:15
    expect((await read(await state())).body).toMatchObject({ blockingOn: true, blockingUntil: "2026-11-16T11:00:00.000Z" });

    app.advance(45 * 60_000); // 11:00
    expect((await read(await state())).body).toMatchObject({ blockingOn: false, blockingUntil: null });
  });

  it("does not block for an event of a goal without auto_block, nor for an event without goal", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const goal = await seedGoal(app.db, alice, { deadline: "2027-03-14", rules: [{ kind: "count", target: 2 }] });
    await seedEvent(app.db, alice, { start: "2026-11-16T08:00:00Z", end: "2026-11-16T11:00:00Z", goalId: goal.id });
    await seedEvent(app.db, alice, { start: "2026-11-16T08:00:00Z", end: "2026-11-16T11:00:00Z" });
    expect((await read(await state())).body).toMatchObject({ blockingOn: false });
  });

  it("blocks during a running session until its planned end, not while paused", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedSession(app.db, alice, { plannedMinutes: 60, startedAt: "2026-11-16T08:30:00Z", pausedSeconds: 300 });
    expect((await read(await state())).body).toMatchObject({ blockingOn: true, blockingUntil: "2026-11-16T09:35:00.000Z" });

    await app.db.admin("update app.focus_sessions set status = 'paused', paused_at = '2026-11-16T08:59:00Z'");
    expect((await read(await state())).body).toMatchObject({ blockingOn: false, blockingUntil: null });
  });

  it("stops blocking once a running session reached its planned end (finished by itself, R13)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedSession(app.db, alice, { plannedMinutes: 15, startedAt: "2026-11-16T08:30:00Z" });
    expect((await read(await state())).body).toMatchObject({ blockingOn: false });
  });

  it("gives each user only their own list and state (R3)", async () => {
    const bob = await app.signedInAs("bob@example.com");
    await seedSession(app.db, bob, { startedAt: "2026-11-16T08:50:00Z" });
    await app.db.admin("insert into app.blocked_sites (user_id, domain) values ($1, 'bob-only.com')", [bob]);
    await app.signedInAs("alice@example.com");
    const body = (await read(await state())).body;
    expect(body).toMatchObject({ blockingOn: false });
    expect(body.sites).not.toContain("bob-only.com");
  });

  it("sets extension_seen_at on every accepted state request (R18)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    expect(await seenAt(alice)).toBe(false);
    await state();
    expect(await seenAt(alice)).toBe(true);
  });
});

describe("record_attempt", () => {
  it("A3: saves (instagram.com, 10:15)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    app.advance(75 * 60_000);
    expect(await read(await attempts([{ domain: "instagram.com", attemptedAt: "2026-11-16T10:15:00.000Z" }]))).toEqual({
      status: 200,
      body: { saved: 1 },
    });
    expect(await attemptsOf(app.db, alice)).toEqual([{ domain: "instagram.com", attemptedAt: "2026-11-16T10:15:00.000Z" }]);
  });

  it("drops silently what is not on the list, older than 48 hours, more than a minute ahead, or not a time", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const answer = await read(
      await attempts([
        { domain: "not-listed.com", attemptedAt: "2026-11-16T08:59:00Z" },
        { domain: "x.com", attemptedAt: "2026-11-14T08:59:00Z" },
        { domain: "x.com", attemptedAt: "2026-11-16T09:01:30Z" },
        { domain: "x.com", attemptedAt: "yesterday" },
        { domain: "x.com", attemptedAt: "2026-11-14T09:00:00Z" },
        { domain: "x.com", attemptedAt: "2026-11-16T09:01:00Z" },
      ]),
    );
    expect(answer).toEqual({ status: 200, body: { saved: 2 } });
    expect(await attemptsOf(app.db, alice)).toEqual([
      { domain: "x.com", attemptedAt: "2026-11-14T09:00:00.000Z" },
      { domain: "x.com", attemptedAt: "2026-11-16T09:01:00.000Z" },
    ]);
  });

  it("refuses more than 50 attempts in one request (400) and saves none", async () => {
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    const many = Array.from({ length: 51 }, () => ({ domain: "x.com", attemptedAt: "2026-11-16T08:59:00Z" }));
    expect((await attempts(many)).status).toBe(400);
    expect(await app.snapshot()).toEqual(before);
  });

  it("stores at most 500 a day; the rest are dropped and the answer says how many were saved", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await app.db.admin(
      "insert into app.blocked_attempts (user_id, domain, attempted_at) select $1, 'x.com', now() from generate_series(1, 498)",
      [alice],
    );
    const five = Array.from({ length: 5 }, () => ({ domain: "x.com", attemptedAt: "2026-11-16T08:59:00Z" }));
    expect((await read(await attempts(five))).body).toEqual({ saved: 2 });
  });
});
