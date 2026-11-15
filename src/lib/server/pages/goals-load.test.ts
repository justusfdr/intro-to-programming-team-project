// The Goals page's loader (spec 39), counted like the other pages in load.test.ts: removing old done
// tasks by itself (R33), then one transaction for every read; the same goals and tasks the calendar
// page reads, the user's local date, and only the signed-in user's rows (R3).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Deps } from "@/lib/server/deps";
import { createTestApp, type TestApp } from "@test/support/app";
import { countingWithUser, heldBack, type Sent } from "@test/support/counting";
import { HALF_MARATHON, seedGoal } from "@test/support/goals";
import { backdateDone, seedTask, tasksOf } from "@test/support/tasks";
import { loadCalendarPage, loadGoalsPage } from "./load";

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

function counted(): { deps: Pick<Deps, "withUser" | "now">; transactions: Sent[][] } {
  const { withUser, transactions } = countingWithUser(app.db);
  return { deps: { withUser, now: app.deps.now }, transactions };
}

describe("goals page", () => {
  it("opens 2 transactions: removing old done tasks by itself, then one for every read", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const goal = await seedGoal(app.db, alice, { ...HALF_MARATHON, createdAt: "2026-11-09T10:00:00Z" });
    await seedTask(app.db, alice, { title: "Buy shoes", goalId: goal.id, dueDate: "2026-11-20" });
    await seedTask(app.db, alice, { title: "Call the bank" });
    const old = await seedTask(app.db, alice, { title: "Old done", status: "done" });
    await backdateDone(app.db, old, "8 days");

    const after = counted();
    const page = await loadGoalsPage(after.deps, alice);
    expect(after.transactions).toHaveLength(2);
    for (const sent of after.transactions) {
      expect(sent[0].sql).toMatch(/set_config\('role', 'authenticated', true\)/);
      expect(heldBack(sent)).toEqual([]);
    }
    expect(after.transactions[0].map((s) => s.sql).join(" ")).toMatch(/delete from app\.tasks/);
    expect((await tasksOf(app.db, alice)).map((t) => t.title).sort()).toEqual(["Buy shoes", "Call the bank"]);

    // The same goals, tasks and display the calendar page reads.
    const calendar = await loadCalendarPage(app.deps, alice);
    expect(page).toEqual({ display: calendar.display, goals: calendar.goals, tasks: calendar.tasks, today: "2026-11-16" });
    expect(page.goals.map((g) => g.title)).toEqual([HALF_MARATHON.title]);
  });

  it("gives the date in the user's time zone", async () => {
    // 09:00 UTC on Monday 16 November is still Sunday night in Honolulu.
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Pacific/Honolulu" });
    expect((await loadGoalsPage(app.deps, alice)).today).toBe("2026-11-15");
  });

  it("reads only the signed-in user's goals and tasks (R3)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const bob = await app.signedInAs("bob@example.com");
    await seedGoal(app.db, bob, HALF_MARATHON);
    await seedTask(app.db, bob, { title: "Bob's task" });
    const page = await loadGoalsPage(app.deps, alice);
    expect(page.goals).toEqual([]);
    expect(page.tasks).toEqual([]);
  });
});
