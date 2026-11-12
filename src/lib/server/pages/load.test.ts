// How many transactions each page opens, counted by a driver wrapped around the test database.
// Target: one transaction for the page's reads, plus at most one "by itself" step (R13 or R33).
// Each test also shows the number the page needed before (its separate loaders one after another),
// checks that the data is the same, and that the reads are sent together after the identity statement.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadAnalytics } from "@/lib/server/analytics/load";
import { loadBlocker } from "@/lib/server/blocker/page";
import { welcomeDue } from "@/lib/server/demo/rows";
import type { Deps } from "@/lib/server/deps";
import { loadWeek } from "@/lib/server/events/week";
import { loadFocus } from "@/lib/server/focus/load";
import { loadGoals } from "@/lib/server/goals/load";
import { readDisplay } from "@/lib/server/settings";
import { loadSettingsPage } from "@/lib/server/settings-page";
import { loadTasks } from "@/lib/server/tasks/load";
import { createTestApp, type TestApp } from "@test/support/app";
import { countingWithUser, type Sent } from "@test/support/counting";
import { seedEvent, seedAllDay } from "@test/support/events";
import { HALF_MARATHON, seedGoal } from "@test/support/goals";
import { seedSession } from "@test/support/sessions";
import { backdateDone, seedTask, tasksOf } from "@test/support/tasks";
import { loadAnalyticsPage, loadCalendarPage, loadFocusPage, loadSettingsPageAll } from "./load";

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

/** The app's withUser on the counting driver, with the test clock. */
function counted(): { deps: Pick<Deps, "withUser" | "now">; transactions: Sent[][] } {
  const { withUser, transactions } = countingWithUser(app.db);
  return { deps: { withUser, now: app.deps.now }, transactions };
}

/** Every transaction starts with the identity statement, before anything else. */
function expectIdentityFirst(transactions: Sent[][]) {
  for (const sent of transactions) {
    expect(sent[0].sql).toMatch(/set_config\('role', 'authenticated', true\)/);
    expect(sent.slice(1).some((s) => s.sql.includes("set_config"))).toBe(false);
  }
}

/** The reads of the page's main transaction (the last one) that went out in the first round. */
function firstRound(transactions: Sent[][]): Sent[] {
  return transactions[transactions.length - 1].filter((s) => s.answersBefore === 0);
}

async function seedWeek(alice: string) {
  const goal = await seedGoal(app.db, alice, { ...HALF_MARATHON, createdAt: "2026-11-09T10:00:00Z" });
  await seedEvent(app.db, alice, { title: "Run", start: "2026-11-16T07:00:00Z", end: "2026-11-16T08:00:00Z", status: "done", goalId: goal.id });
  await seedEvent(app.db, alice, { title: "Deep work", start: "2026-11-17T10:00:00Z", end: "2026-11-17T11:00:00Z" });
  await seedEvent(app.db, alice, { title: "Overlap", start: "2026-11-17T10:30:00Z", end: "2026-11-17T11:30:00Z" });
  await seedAllDay(app.db, alice, { title: "Exam week", firstDay: "2026-11-16", lastDay: "2026-11-18" });
  await seedAllDay(app.db, alice, { title: "Conference", firstDay: "2026-11-18", lastDay: "2026-11-18" });
  await seedTask(app.db, alice, { title: "Buy shoes", goalId: goal.id, dueDate: "2026-11-20" });
  const old = await seedTask(app.db, alice, { title: "Old done", status: "done" });
  await backdateDone(app.db, old, "8 days");
  return goal;
}

describe("calendar page", () => {
  it("opens 2 transactions (was 6): removing old done tasks by itself, then one for every read", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    await seedWeek(alice);

    const before = counted();
    const display = await before.deps.withUser(alice, readDisplay);
    const week = await loadWeek(before.deps, alice);
    const goals = await loadGoals(before.deps, alice);
    const tasks = await loadTasks(before.deps, alice);
    const showWelcome = await before.deps.withUser(alice, welcomeDue);
    expect(before.transactions).toHaveLength(6);

    const after = counted();
    const page = await loadCalendarPage(after.deps, alice);
    expect(after.transactions.length).toBeLessThanOrEqual(2);
    expect(after.transactions).toHaveLength(2);
    expect(page).toEqual({ display, week, goals, tasks, showWelcome });
    expectIdentityFirst(after.transactions);
    // The old done task is gone (R33), and that removal ran in the first, separate transaction.
    expect((await tasksOf(app.db, alice)).map((t) => t.title)).toEqual(["Buy shoes"]);
    expect(after.transactions[0].map((s) => s.sql).join(" ")).toMatch(/delete from app\.tasks/);
    // Settings, Outlook, goals, done events, tasks and the welcome go out together with the identity statement.
    expect(firstRound(after.transactions).length).toBeGreaterThanOrEqual(7);
    expect(firstRound(after.transactions).every((s) => !s.withParams)).toBe(true);
  });

  it("shows another week with the same data as the week loader, timed and all-day events in their order", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "America/New_York" });
    await seedWeek(alice);
    await seedAllDay(app.db, alice, { title: "Away", firstDay: "2026-11-22", lastDay: "2026-11-24" });
    const page = await loadCalendarPage(app.deps, alice, "2026-11-25");
    expect(page.week).toEqual(await loadWeek(app.deps, alice, "2026-11-25"));
    expect(page.week.days[0].allDay.map((e) => e.title)).toEqual(["Away"]);
  });
});

describe("focus page", () => {
  it("opens 2 transactions (was 5): finishing due sessions by itself, then one for every read", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const goal = await seedGoal(app.db, alice, { ...HALF_MARATHON, autoBlock: true });
    const event = await seedEvent(app.db, alice, { title: "Run", start: "2026-11-16T08:30:00Z", end: "2026-11-16T10:00:00Z", goalId: goal.id });
    await seedSession(app.db, alice, { plannedMinutes: 30, startedAt: "2026-11-16T08:00:00Z" });
    await seedSession(app.db, alice, { status: "finished", startedAt: "2026-11-15T09:00:00Z", endedAt: "2026-11-15T09:30:00Z" });

    // The page as it was: the display, then the two loaders, each finishing due sessions first.
    const before = counted();
    const display = await before.deps.withUser(alice, readDisplay);
    const focus = await loadFocus(before.deps, alice, event.id);
    const blocker = await loadBlocker(before.deps, alice);
    expect(before.transactions).toHaveLength(5);

    // Same situation again for the new loader: a session that is due once more.
    await app.db.admin("delete from app.focus_sessions where user_id = $1", [alice]);
    await seedSession(app.db, alice, { plannedMinutes: 30, startedAt: "2026-11-16T08:00:00Z" });
    await seedSession(app.db, alice, { status: "finished", startedAt: "2026-11-15T09:00:00Z", endedAt: "2026-11-15T09:30:00Z" });

    const after = counted();
    const page = await loadFocusPage(after.deps, alice, event.id);
    expect(after.transactions).toHaveLength(2);
    expectIdentityFirst(after.transactions);
    // Ids of the re-seeded sessions differ; everything else is the same.
    const withoutIds = (data: typeof focus) => ({ ...data, recent: data.recent.map((s) => ({ ...s, id: "" })) });
    expect({ ...page, focus: withoutIds(page.focus) }).toEqual({ display, focus: withoutIds(focus), blocker });
    expect(page.focus.recent[0]).toMatchObject({ status: "finished", endedAt: "2026-11-16T08:30:00.000Z" });
    expect(page.focus.forEvent).toMatchObject({ id: event.id, title: "Run" });
    expect(page.blocker.blockingOn).toBe(true);
    expect(after.transactions[0].map((s) => s.sql).join(" ")).toMatch(/update app\.focus_sessions/);
    expect(firstRound(after.transactions).length).toBeGreaterThanOrEqual(7);
  });
});

describe("analytics page", () => {
  it("opens 2 transactions (was 3): finishing due sessions by itself, then one for every read", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedSession(app.db, alice, { status: "finished", startedAt: "2026-11-16T07:00:00Z", endedAt: "2026-11-16T07:30:00Z" });

    const before = counted();
    const display = await before.deps.withUser(alice, readDisplay);
    const analytics = await loadAnalytics(before.deps, alice);
    expect(before.transactions).toHaveLength(3);

    const after = counted();
    const page = await loadAnalyticsPage(after.deps, alice);
    expect(after.transactions).toHaveLength(2);
    expectIdentityFirst(after.transactions);
    expect(page).toEqual({ display, analytics });
  });
});

describe("settings page", () => {
  it("opens 2 transactions (was 3): finishing due sessions by itself, then one for every read", async () => {
    const alice = await app.signedInAs("alice@example.com");

    const before = counted();
    const settingsPage = await loadSettingsPage(before.deps, alice);
    const blocker = await loadBlocker(before.deps, alice);
    expect(before.transactions).toHaveLength(3);

    const after = counted();
    const page = await loadSettingsPageAll(after.deps, alice);
    expect(after.transactions).toHaveLength(2);
    expectIdentityFirst(after.transactions);
    const { timeFormat, dayStartHour, dayEndHour } = settingsPage.settings;
    expect(page).toEqual({ display: { timeFormat, dayStartHour, dayEndHour }, page: settingsPage, blocker });
    // Settings, plan, Outlook, demo state, block list, extension and the running session: one round, no parameters.
    expect(firstRound(after.transactions).filter((s) => !s.withParams).length).toBeGreaterThanOrEqual(8);
  });

  it("reads only the signed-in user's plan (R3)", async () => {
    const bob = await app.signedInAs("bob@example.com");
    await app.db.admin("update app.profiles set plan = 'pro' where id = $1", [bob]);
    const alice = await app.signedInAs("alice@example.com");
    expect((await loadSettingsPageAll(app.deps, alice)).page.plan).toBe("free");
    expect((await loadSettingsPageAll(app.deps, bob)).page.plan).toBe("pro");
  });
});
