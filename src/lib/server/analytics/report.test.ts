// Tests for the report of the Analytics page (spec 49) against the temporary database: one
// realistic week, a goal that is deleted afterwards, and the rule that one user never sees another's data (R3).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "@test/support/app";
import { seedEvent } from "@test/support/events";
import { seedGoal } from "@test/support/goals";
import { seedSession } from "@test/support/sessions";
import { readTimeZone } from "@/lib/server/settings";
import { readAnalyticsReport } from "./report";

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

const HOUR = 3_600_000;

function reportFor(userId: string, week?: string) {
  const now = app.now();
  return app.deps.withUser(userId, (query) => readAnalyticsReport(query, now, week, readTimeZone(query)));
}

async function addAttempt(userId: string, domain: string, at: string) {
  await app.db.admin("insert into app.blocked_attempts (user_id, domain, attempted_at) values ($1, $2, $3)", [userId, domain, at]);
}

/** Wednesday 18 November, 12:00 UTC. */
function toWednesday() {
  app.advance(2 * 24 * HOUR + 3 * HOUR);
}

describe("readAnalyticsReport", () => {
  it("a new account gets an empty report that says so", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const report = await reportFor(alice);
    expect(report.monday).toBe("2026-11-16");
    expect(report.today).toBe("2026-11-16");
    expect(report.isCurrentWeek).toBe(true);
    expect(report.focus.week).toEqual({ focusedMinutes: 0, sessions: 0, score: null, attempts: 0 });
    expect(report.goals.list).toEqual([]);
    expect(report.streaks).toEqual({ current: 0, record: 0 });
    expect(report.insights.focus.summary).toBe("No focus sessions this week yet.");
    expect(report.summary).toBe("Nothing tracked this week yet.");
  });

  it("one realistic week: sessions, goals, plan, time and blocked visits", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const thesis = await seedGoal(app.db, alice, { title: "Thesis", deadline: "2026-11-30", createdAt: "2026-11-02T10:00:00Z", rules: [{ kind: "count", target: 2 }] });
    const gym = await seedGoal(app.db, alice, { title: "Gym", deadline: "2026-12-31", createdAt: "2026-11-02T10:00:00Z", rules: [{ kind: "hours", target: 3 }] });

    // Last week: 1 session of 30 minutes and 1 blocked visit.
    await seedSession(app.db, alice, { status: "finished", plannedMinutes: 30, startedAt: "2026-11-10T09:00:00Z", endedAt: "2026-11-10T09:30:00Z" });
    await addAttempt(alice, "x.com", "2026-11-10T20:00:00Z");

    // This week: two thesis events done (Mon, Tue), one planned and over (Tue), one still ahead (Thu), a gym hour done, an event without a goal.
    await seedEvent(app.db, alice, { title: "Thesis A", start: "2026-11-16T08:00:00Z", end: "2026-11-16T09:00:00Z", status: "done", goalId: thesis.id });
    const second = await seedEvent(app.db, alice, { title: "Thesis B", start: "2026-11-17T09:00:00Z", end: "2026-11-17T10:00:00Z", status: "done", goalId: thesis.id });
    await seedEvent(app.db, alice, { title: "Thesis C", start: "2026-11-17T14:00:00Z", end: "2026-11-17T15:00:00Z", goalId: thesis.id });
    await seedEvent(app.db, alice, { title: "Thesis D", start: "2026-11-19T09:00:00Z", end: "2026-11-19T10:00:00Z", goalId: thesis.id });
    await seedEvent(app.db, alice, { title: "Gym", start: "2026-11-17T17:00:00Z", end: "2026-11-17T18:00:00Z", status: "done", goalId: gym.id });
    await seedEvent(app.db, alice, { title: "Dentist", start: "2026-11-18T08:00:00Z", end: "2026-11-18T09:00:00Z", status: "done" });

    // Sessions: 40 of 60 minutes with a visit during it (second event: thesis), and a full 30 in the afternoon.
    await seedSession(app.db, alice, { status: "finished", plannedMinutes: 60, startedAt: "2026-11-17T09:00:00Z", endedAt: "2026-11-17T09:40:00Z", eventId: second.id });
    await addAttempt(alice, "x.com", "2026-11-17T09:10:00Z");
    await addAttempt(alice, "reddit.com", "2026-11-17T20:00:00Z");
    await seedSession(app.db, alice, { status: "finished", plannedMinutes: 30, startedAt: "2026-11-16T15:00:00Z", endedAt: "2026-11-16T15:30:00Z" });
    // A session that is still running does not count.
    await seedSession(app.db, alice, { status: "running", plannedMinutes: 30, startedAt: "2026-11-18T10:00:00Z" });
    toWednesday();

    const r = await reportFor(alice);

    // Tuesday: 40 of 60 = 67, minus 5 for the visit = 62; Monday: 100; average 81.
    expect(r.focus.week).toEqual({ focusedMinutes: 70, sessions: 2, score: 81, attempts: 2 });
    expect(r.focus.lastWeek).toEqual({ focusedMinutes: 30, sessions: 1, score: 100, attempts: 1 });
    expect(r.focus.days[0]).toMatchObject({ date: "2026-11-16", focusedMinutes: 30, sessions: 1 });
    expect(r.focus.longest).toEqual({ minutes: 40, date: "2026-11-17", goal: "Thesis" });
    expect(r.focus.finishedAsPlanned).toBe(1);
    expect(r.focus.activeDays).toBe(2);
    expect(r.focus.weeks).toHaveLength(8);
    expect(r.focus.hours.find((h) => h.block === "morning")).toEqual({ block: "morning", sessions: 2, score: 81 }); // this Tuesday (62) and last Tuesday (100)
    expect(r.focus.hours.find((h) => h.block === "afternoon")).toEqual({ block: "afternoon", sessions: 1, score: 100 });
    expect(r.focus.bestBlock).toBe("morning");

    expect(r.goals.judged).toBe(2);
    const byTitle = Object.fromEntries(r.goals.list.map((g) => [g.goal.title, g]));
    expect(byTitle["Thesis"]).toMatchObject({ status: "met", daysLeft: 12, deadline: "2026-11-30" });
    expect(byTitle["Thesis"].rules).toEqual([{ unit: "sessions", done: 2, target: 2, status: "met" }]);
    expect(byTitle["Gym"].rules).toEqual([{ unit: "hours", done: 1, target: 3, status: "open" }]);
    expect(r.goals.reached).toBe(1);
    expect(r.goals.planTotal).toBe(5);
    expect(r.goals.planDone).toBe(3);
    expect(r.goals.slipped.map((s) => s.title)).toEqual(["Thesis C"]);
    expect(r.goals.plan[3].items.map((i) => [i.title, i.state])).toEqual([["Thesis D", "planned"]]);

    expect(r.time.doneMinutes).toBe(240);
    expect(r.time.goalMinutes).toBe(180);
    expect(r.time.areas.map((a) => [a.goal?.title ?? "No goal", a.minutes])).toEqual([
      ["Thesis", 120],
      ["Gym", 60],
      ["No goal", 60],
    ]);
    expect(r.time.endedMinutes).toBe(300); // five events that are over (Thesis D is still ahead)
    expect(r.time.planKept).toBe(80);

    expect(r.blocked.week).toBe(2);
    expect(r.blocked.lastWeek).toBe(1);
    expect(r.blocked.sessionsClean).toEqual([true, false]);
    expect(r.blocked.topSites.map((s) => s.domain)).toEqual(["reddit.com", "x.com"]);

    // Monday and Tuesday have a session and done goal events; Wednesday (today) has nothing yet, so the streak ends on Tuesday.
    expect(r.streaks).toEqual({ current: 2, record: 2 });
  });

  it("a goal deleted afterwards: its events count as 'No goal' and its sessions have no goal", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const goal = await seedGoal(app.db, alice, { title: "Old plan", deadline: "2026-12-31", rules: [{ kind: "count", target: 1 }] });
    const event = await seedEvent(app.db, alice, { title: "Work", start: "2026-11-16T08:00:00Z", end: "2026-11-16T09:00:00Z", status: "done", goalId: goal.id });
    await seedSession(app.db, alice, { status: "finished", plannedMinutes: 30, startedAt: "2026-11-16T08:00:00Z", endedAt: "2026-11-16T08:30:00Z", eventId: event.id });
    app.advance(4 * HOUR);
    expect((await reportFor(alice)).focus.longest?.goal).toBe("Old plan");

    await app.db.admin("delete from app.goals where id = $1", [goal.id]);
    const r = await reportFor(alice);
    expect(r.goals.list).toEqual([]);
    expect(r.focus.longest?.goal).toBeNull();
    expect(r.time.areas.map((a) => [a.goal, a.minutes])).toEqual([[null, 60]]);
  });

  it("uses the user's time zone: Sunday night in New York is not yet Monday in UTC", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "America/New_York" });
    // 23:30 on Sunday 15 November in New York is 04:30 UTC on Monday the 16th.
    await seedSession(app.db, alice, { status: "finished", plannedMinutes: 30, startedAt: "2026-11-16T04:30:00Z", endedAt: "2026-11-16T05:00:00Z" });
    app.advance(4 * HOUR);
    const r = await reportFor(alice);
    expect(r.timeZone).toBe("America/New_York");
    expect(r.focus.week.sessions).toBe(0);
    expect(r.focus.lastWeek.sessions).toBe(1);
  });

  it("shows an earlier week when asked, with no 'today'", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedSession(app.db, alice, { status: "finished", plannedMinutes: 30, startedAt: "2026-11-04T09:00:00Z", endedAt: "2026-11-04T09:30:00Z" });
    const r = await reportFor(alice, "2026-11-04");
    expect([r.monday, r.today, r.isCurrentWeek, r.thisWeek]).toEqual(["2026-11-02", null, false, "2026-11-16"]);
    expect(r.focus.week.sessions).toBe(1);
    expect(r.insights.focus.summary).not.toBe("No focus sessions this week yet.");
  });

  it("never includes another user's data (R3)", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const bobGoal = await seedGoal(app.db, bob, { title: "Bob's goal", deadline: "2026-12-31", rules: [{ kind: "count", target: 1 }] });
    const bobEvent = await seedEvent(app.db, bob, { title: "Bob's event", start: "2026-11-16T08:00:00Z", end: "2026-11-16T10:00:00Z", status: "done", goalId: bobGoal.id });
    await seedSession(app.db, bob, { status: "finished", plannedMinutes: 60, startedAt: "2026-11-16T08:00:00Z", endedAt: "2026-11-16T09:00:00Z", eventId: bobEvent.id });
    await addAttempt(bob, "reddit.com", "2026-11-16T08:30:00Z");

    const alice = await app.signedInAs("alice@example.com");
    await seedSession(app.db, alice, { status: "finished", plannedMinutes: 30, startedAt: "2026-11-16T07:00:00Z", endedAt: "2026-11-16T07:30:00Z" });
    app.advance(4 * HOUR);

    const r = await reportFor(alice);
    expect(r.focus.week).toEqual({ focusedMinutes: 30, sessions: 1, score: 100, attempts: 0 });
    expect(r.goals.list).toEqual([]);
    expect(r.goals.planTotal).toBe(0);
    expect(r.time.doneMinutes).toBe(0);
    expect(r.blocked.topSites).toEqual([]);
    expect(r.streaks).toEqual({ current: 1, record: 1 });
    const bobs = await reportFor(bob);
    expect(bobs.focus.week.sessions).toBe(1);
    expect(bobs.goals.list.map((g) => g.goal.title)).toEqual(["Bob's goal"]);
  });
});
