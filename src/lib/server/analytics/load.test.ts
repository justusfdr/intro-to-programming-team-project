// Tests for the Analytics page's data: A2 from saved rows, R13, R3 and the week in the user's time zone.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "@test/support/app";
import { seedSession } from "@test/support/sessions";
import { loadAnalytics } from "./load";

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

async function addAttempt(userId: string, domain: string, at: string) {
  await app.db.admin("insert into app.blocked_attempts (user_id, domain, attempted_at) values ($1, $2, $3)", [userId, domain, at]);
}

/** A2 as saved rows: 60 minutes from 09:00, paused 09:20 to 09:30 (600 s), ended 09:55. */
async function seedA2(userId: string, day = "2026-11-16") {
  await seedSession(app.db, userId, {
    status: "finished",
    startedAt: `${day}T09:00:00Z`,
    pausedSeconds: 600,
    endedAt: `${day}T09:55:00Z`,
  });
  await addAttempt(userId, "instagram.com", `${day}T09:12:00Z`);
  await addAttempt(userId, "youtube.com", `${day}T09:40:00Z`);
}

describe("loadAnalytics", () => {
  it("A2 from saved rows: focused 45, score 65, 2 attempts on Monday", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedA2(alice);
    app.advance(2 * 3_600_000);

    const data = await loadAnalytics(app.deps, alice);

    expect(data.monday).toBe("2026-11-16");
    expect(data.today).toBe("2026-11-16");
    expect(data.analytics.days[0]).toEqual({ date: "2026-11-16", focusedMinutes: 45, sessions: 1, score: 65, attempts: 2 });
    expect(data.analytics.week).toEqual({ focusedMinutes: 45, sessions: 1, score: 65, attempts: 2 });
  });

  it("never includes another user's sessions or attempts (R3)", async () => {
    const bob = await app.signedInAs("bob@example.com");
    await seedA2(bob);
    await addAttempt(bob, "reddit.com", "2026-11-17T10:00:00Z");
    const alice = await app.signedInAs("alice@example.com");
    await seedSession(app.db, alice, { status: "finished", startedAt: "2026-11-16T07:00:00Z", endedAt: "2026-11-16T07:30:00Z", plannedMinutes: 30 });
    app.advance(2 * 3_600_000);

    const data = await loadAnalytics(app.deps, alice);

    expect(data.analytics.week).toEqual({ focusedMinutes: 30, sessions: 1, score: 100, attempts: 0 });
    expect(data.analytics.topSites).toEqual([]);
  });

  it("counts a session that finished by itself (R13)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedSession(app.db, alice, { plannedMinutes: 15, startedAt: "2026-11-16T08:00:00Z" }); // due 08:15, finishes by itself
    expect((await loadAnalytics(app.deps, alice)).analytics.week).toMatchObject({ focusedMinutes: 15, sessions: 1, score: 100 });
  });

  it("does not count a running or a paused session yet", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedSession(app.db, alice, { plannedMinutes: 60, status: "paused", startedAt: "2026-11-16T08:00:00Z", pausedAt: "2026-11-16T08:20:00Z" });
    expect((await loadAnalytics(app.deps, alice)).analytics.week.sessions).toBe(0);
    await app.db.admin("update app.focus_sessions set status = 'running', paused_at = null, started_at = '2026-11-16T08:50:00Z'");
    expect((await loadAnalytics(app.deps, alice)).analytics.week.sessions).toBe(0);
  });

  it("shows '–' (null) for a new account, and today only in the current week", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const empty = await loadAnalytics(app.deps, alice);
    expect(empty.analytics.week).toEqual({ focusedMinutes: 0, sessions: 0, score: null, attempts: 0 });
    const earlier = await loadAnalytics(app.deps, alice, "2026-11-04");
    expect([earlier.monday, earlier.today, earlier.previous, earlier.next]).toEqual(["2026-11-02", null, "2026-10-26", "2026-11-09"]);
  });

  it("counts an attempt just after the week for a session that started on Sunday night and ran past midnight", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    await seedSession(app.db, alice, { status: "finished", startedAt: "2026-11-22T23:40:00Z", endedAt: "2026-11-23T00:40:00Z" });
    await addAttempt(alice, "x.com", "2026-11-23T00:10:00Z");
    app.advance(8 * 24 * 3_600_000);
    const data = await loadAnalytics(app.deps, alice, "2026-11-16");
    expect(data.analytics.days[6]).toEqual({ date: "2026-11-22", focusedMinutes: 60, sessions: 1, score: 95, attempts: 0 });
    expect(data.analytics.week.attempts).toBe(0); // the attempt belongs to the next week's Monday
  });
});
