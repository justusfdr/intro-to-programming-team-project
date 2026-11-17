// Spec 43: /coach?plan=<goal id> fills the message field only for one of the user's own goals, as the
// page reads them (row-level security); another user's goal, an unknown or a malformed id reveal nothing.
// Nothing is sent and nothing is counted by opening the page.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "@test/support/app";
import { sentToday } from "@test/support/chat";
import { seedGoal } from "@test/support/goals";
import { planGoalHref, planGoalText } from "@/lib/chat/plan-goal";
import { loadChatPage } from "./load";

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.reset();
});

describe("the coach page's ?plan=", () => {
  it("the user's own goal: 'Plan \"<title>\" into my week.'; nothing sent, nothing counted", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const gym = await seedGoal(app.db, alice, { title: "Gym", deadline: "2027-03-14", rules: [{ kind: "count", target: 3 }] });
    const before = await app.snapshot();
    const data = await loadChatPage(app.deps, alice);
    expect(planGoalText(gym.id, data.goals)).toBe('Plan "Gym" into my week.');
    expect(planGoalText(gym.id.toUpperCase(), data.goals)).toBe('Plan "Gym" into my week.');
    expect(app.assistant.requests).toEqual([]);
    expect(await sentToday(app.db, alice)).toBe(0);
    expect(await app.snapshot()).toEqual(before);
  });

  it("another user's goal, an unknown id, a malformed value or a list: ignored", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const bob = await app.db.createUser("bob@example.com");
    const bobs = await seedGoal(app.db, bob, { title: "Bob's secret goal", deadline: "2027-03-14", rules: [{ kind: "count", target: 1 }] });
    await seedGoal(app.db, alice, { title: "Gym", deadline: "2027-03-14", rules: [{ kind: "count", target: 3 }] });
    const data = await loadChatPage(app.deps, alice);
    expect(JSON.stringify(data)).not.toContain(bobs.id);
    for (const value of [bobs.id, "00000000-0000-4000-8000-000000000000", "gym", "", undefined, [bobs.id]]) {
      expect(planGoalText(value, data.goals), String(value)).toBeNull();
    }
  });

  it("the link the goal card and the success screen use", () => {
    expect(planGoalHref("0b9c8d7e-6f5a-4b3c-9d2e-1f0a9b8c7d6e")).toBe("/coach?plan=0b9c8d7e-6f5a-4b3c-9d2e-1f0a9b8c7d6e");
  });
});
