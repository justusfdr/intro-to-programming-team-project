// Tests for supabase/migrations/*_goal_must_days.sql: a goal added the old way gets no must days; the
// check accepts days in rising order and refuses repeats, other characters and days that are ruled out;
// a signed-in user can write the column of their own goal only.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedGoal } from "@test/support/goals";
import { createTestDb, type TestDb } from "./harness";

let db: TestDb;
let alice: string;
let bob: string;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.admin("delete from auth.users");
  alice = await db.createUser("alice@example.com", { confirmed: true });
  bob = await db.createUser("bob@example.com", { confirmed: true });
});

const RULES = [{ kind: "count" as const, target: 3 }];

async function setOnGoal(set: string, params: unknown[] = []) {
  const g = await seedGoal(db, alice, { deadline: "2027-03-14", rules: RULES });
  return db.withUser(alice, (q) => q(`update app.goals set ${set} where id = $1::uuid returning id`, [g.id, ...params]));
}

describe("goal must days", () => {
  it("is empty for a goal added the old way", async () => {
    const g = await seedGoal(db, alice, { deadline: "2027-03-14", rules: RULES });
    const [row] = await db.admin("select must_days from app.goals where id = $1", [g.id]);
    expect(row).toEqual({ must_days: "" });
  });

  it.each(["", "1", "135", "67"])("accepts %j", async (days) => {
    expect(await setOnGoal("must_days = $2::text", [days])).toHaveLength(1);
  });

  it.each(["31", "11", "8", "0", "1,3", "a"])("refuses %j", async (days) => {
    await expect(setOnGoal("must_days = $2::text", [days])).rejects.toThrow(/goals_must_days/);
  });

  it("refuses a day that is also ruled out", async () => {
    await expect(setOnGoal("avoid_days = '45', must_days = '15'")).rejects.toThrow(/goals_must_days/);
    expect(await setOnGoal("avoid_days = '45', must_days = '13'")).toHaveLength(1);
  });

  it("cannot be written on another user's goal", async () => {
    const g = await seedGoal(db, alice, { deadline: "2027-03-14", rules: RULES });
    const rows = await db.withUser(bob, (q) => q("update app.goals set must_days = '1' where id = $1::uuid returning id", [g.id]));
    expect(rows).toHaveLength(0);
  });
});
