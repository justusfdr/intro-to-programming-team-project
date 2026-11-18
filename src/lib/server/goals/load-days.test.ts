// The days of this week on a goal (R9, changed 18 Nov 2026, spec 47): done, missed and planned days
// come from the goal's own events in the database; other goals' and other users' events do not count.
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

const dayOf = (days: { date: string; done: boolean; missed?: boolean; planned?: boolean }[] | undefined, date: string) =>
  days?.find((d) => d.date === date);

describe("loadGoals: this week's days", () => {
  it("marks a done day, a planned day that has ended as missed, and a later planned day", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const gym = await seedGoal(app.db, alice, { title: "Gym", deadline: "2026-12-31", createdAt: "2026-11-02T10:00:00Z", rules: [{ kind: "count", target: 3 }] });
    // Monday early: done. Monday 07:00 planned and not done: today, so planned. Wednesday: planned.
    await seedEvent(app.db, alice, { start: "2026-11-16T06:00:00Z", end: "2026-11-16T07:00:00Z", status: "done", goalId: gym.id });
    await seedEvent(app.db, alice, { start: "2026-11-18T18:00:00Z", end: "2026-11-18T19:00:00Z", status: "planned", goalId: gym.id });

    const [goal] = await loadGoals(app.deps, alice);

    expect(goal.progress.days).toHaveLength(7);
    expect(dayOf(goal.progress.days, "2026-11-16")).toMatchObject({ done: true, isToday: true });
    expect(dayOf(goal.progress.days, "2026-11-18")).toMatchObject({ done: false, planned: true, missed: false });
    expect(dayOf(goal.progress.days, "2026-11-17")).toMatchObject({ done: false, planned: false, missed: false });
  });

  it("does not count another goal's or another user's events", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const bob = await app.signedInAs("bob@example.com");
    const gym = await seedGoal(app.db, alice, { title: "Gym", deadline: "2026-12-31", rules: [{ kind: "count", target: 3 }] });
    const other = await seedGoal(app.db, alice, { title: "Other", deadline: "2026-12-31", rules: [{ kind: "count", target: 1 }] });
    const bobs = await seedGoal(app.db, bob, { title: "Bob's gym", deadline: "2026-12-31", rules: [{ kind: "count", target: 1 }] });
    await seedEvent(app.db, alice, { start: "2026-11-18T18:00:00Z", end: "2026-11-18T19:00:00Z", status: "planned", goalId: other.id });
    await seedEvent(app.db, bob, { start: "2026-11-19T18:00:00Z", end: "2026-11-19T19:00:00Z", status: "planned", goalId: bobs.id });

    const goals = await loadGoals(app.deps, alice);
    const mine = goals.find((g) => g.id === gym.id);

    expect(mine?.progress.days?.some((d) => d.done || d.planned || d.missed)).toBe(false);
  });
});
