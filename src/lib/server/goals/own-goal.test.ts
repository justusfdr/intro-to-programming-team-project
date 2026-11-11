// Tests for the shared helpers of edit_goal, remove_rule, delete_goal and an event's goal (R3, R4).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "@test/support/app";
import { seedGoal } from "@test/support/goals";
import { ActionError } from "@/lib/server/errors";
import { assertOwnGoal, findOwnGoal, findOwnRule, touchGoal } from "./own-goal";

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

const GOAL = { deadline: "2027-03-14", rules: [{ kind: "count" as const, target: 2 }] };

async function errorOf(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    if (error instanceof ActionError) return { status: error.status, code: error.code, message: error.message };
    throw error;
  }
  return "no error";
}

describe("own goal and rule lookups (R3)", () => {
  it("find the user's own goal and rule", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const own = await seedGoal(app.db, alice, GOAL);
    expect(await app.db.withUser(alice, (q) => findOwnGoal(q, own.id))).toMatchObject({ id: own.id, deadline: "2027-03-14" });
    expect(await app.db.withUser(alice, (q) => findOwnRule(q, own.ruleIds[0]))).toEqual({ id: own.ruleIds[0], goal_id: own.id });
    await app.db.withUser(alice, (q) => assertOwnGoal(q, own.id));
    await app.db.withUser(alice, (q) => assertOwnGoal(q, null));
  });

  it("answer exactly the same 'Not found' for another user's row, a missing one and a malformed id", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const bobs = await seedGoal(app.db, bob, GOAL);
    const alice = await app.signedInAs("alice@example.com");
    const missing = "00000000-0000-4000-8000-000000000000";
    const expected = { status: 404, code: "not_found", message: "Not found" };

    const lookups: ((q: Parameters<typeof findOwnGoal>[0], id: string) => Promise<unknown>)[] = [findOwnGoal, assertOwnGoal];
    for (const lookup of lookups) {
      expect(await errorOf(() => app.db.withUser(alice, (q) => lookup(q, bobs.id)))).toEqual(expected);
      expect(await errorOf(() => app.db.withUser(alice, (q) => lookup(q, missing)))).toEqual(expected);
      expect(await errorOf(() => app.db.withUser(alice, (q) => lookup(q, "not-a-uuid")))).toEqual(expected);
    }
    expect(await errorOf(() => app.db.withUser(alice, (q) => findOwnRule(q, bobs.ruleIds[0])))).toEqual(expected);
    expect(await errorOf(() => app.db.withUser(alice, (q) => findOwnRule(q, missing)))).toEqual(expected);
    expect(await errorOf(() => app.db.withUser(alice, (q) => findOwnRule(q, "not-a-uuid")))).toEqual(expected);
  });
});

describe("touchGoal (R4)", () => {
  it("gives the goal a later updated_at and changes nothing else", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const own = await seedGoal(app.db, alice, GOAL);
    const [before] = await app.db.admin("select title, deadline, auto_block from app.goals where id = $1", [own.id]);
    await app.db.withUser(alice, (q) => touchGoal(q, own.id));
    const [after] = await app.db.admin<{ updated_at: Date }>("select updated_at from app.goals where id = $1", [own.id]);
    expect(new Date(after.updated_at).getTime()).toBeGreaterThan(Date.parse(own.updatedAt));
    expect(await app.db.admin("select title, deadline, auto_block from app.goals where id = $1", [own.id])).toEqual([before]);
  });
});
