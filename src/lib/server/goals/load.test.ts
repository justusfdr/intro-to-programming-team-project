// Tests for the goals panel's data: the user's goals in creation order with their calculated
// colour and progress (R8, R9, R3).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "@test/support/app";
import { seedEvent } from "@test/support/events";
import { seedGoal } from "@test/support/goals";
import { loadGoals } from "./load";

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

describe("loadGoals", () => {
  it("lists the user's goals oldest first, each with the next colour", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedGoal(app.db, alice, { title: "Second", deadline: "2027-01-31", createdAt: "2026-11-10T10:00:00Z", rules: [{ kind: "hours", target: 6 }] });
    await seedGoal(app.db, alice, { title: "First", deadline: "2027-03-14", createdAt: "2026-11-02T10:00:00Z", rules: [{ kind: "count", target: 2 }] });

    const goals = await loadGoals(app.deps, alice);

    expect(goals.map((g) => [g.title, g.colorIndex])).toEqual([["First", 0], ["Second", 1]]);
    expect(goals[0]).toMatchObject({ deadline: "2027-03-14", autoBlock: false, rules: [{ kind: "count", target: 2, minMinutes: null }] });
  });

  it("counts only the goal's done events (R8): this week's text and last week's strip", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const run = await seedGoal(app.db, alice, {
      deadline: "2026-12-20",
      createdAt: "2026-11-03T10:00:00Z",
      rules: [{ kind: "count", target: 2, minMinutes: 45 }],
    });
    const other = await seedGoal(app.db, alice, { title: "Other", deadline: "2026-12-20", rules: [{ kind: "count", target: 1 }] });
    // Last week (A1): runs of 50 and 40 minutes done; a planned one does not count; another goal's event does not count.
    await seedEvent(app.db, alice, { start: "2026-11-10T07:00:00Z", end: "2026-11-10T07:50:00Z", status: "done", goalId: run.id });
    await seedEvent(app.db, alice, { start: "2026-11-12T07:00:00Z", end: "2026-11-12T07:40:00Z", status: "done", goalId: run.id });
    await seedEvent(app.db, alice, { start: "2026-11-13T07:00:00Z", end: "2026-11-13T08:00:00Z", status: "planned", goalId: run.id });
    await seedEvent(app.db, alice, { start: "2026-11-11T07:00:00Z", end: "2026-11-11T08:00:00Z", status: "done", goalId: other.id });
    // This week: one run done.
    await seedEvent(app.db, alice, { start: "2026-11-16T07:00:00Z", end: "2026-11-16T08:00:00Z", status: "done", goalId: run.id });

    const [goal] = await loadGoals(app.deps, alice);

    expect(goal.progress.thisWeek.map((r) => r.text)).toEqual(["This week: 1 of 2 done"]);
    expect(goal.progress.weeks.find((w) => w.monday === "2026-11-09")?.status).toBe("missed");
    expect(goal.progress.countdown).toBe("34 days left");
  });

  it("shows only the signed-in user's goals (R3)", async () => {
    const bob = await app.signedInAs("bob@example.com");
    await seedGoal(app.db, bob, { title: "Bob's", deadline: "2027-03-14", rules: [{ kind: "count", target: 1 }] });
    const alice = await app.signedInAs("alice@example.com");
    expect(await loadGoals(app.deps, alice)).toEqual([]);
  });
});
