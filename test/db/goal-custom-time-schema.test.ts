// Tests for supabase/migrations/*_goal_custom_time.sql: a goal added the old way has no own window; the
// check accepts a window inside one day and refuses half windows, reversed ones, ones outside the day
// and a window together with a part of the day; only the owner can write it.
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

async function setOnGoal(set: string) {
  const g = await seedGoal(db, alice, { deadline: "2027-03-14", rules: RULES });
  return db.withUser(alice, (q) => q(`update app.goals set ${set} where id = $1::uuid returning id`, [g.id]));
}

describe("goal custom time window", () => {
  it("is empty for a goal added the old way", async () => {
    const g = await seedGoal(db, alice, { deadline: "2027-03-14", rules: RULES });
    const [row] = await db.admin("select day_from_min, day_until_min from app.goals where id = $1", [g.id]);
    expect(row).toEqual({ day_from_min: null, day_until_min: null });
  });

  it.each(["day_from_min = 390, day_until_min = 480", "day_from_min = 0, day_until_min = 1440", "day_from_min = null, day_until_min = null"])("accepts %s", async (set) => {
    expect(await setOnGoal(set)).toHaveLength(1);
  });

  it.each([
    "day_from_min = 390",
    "day_until_min = 480",
    "day_from_min = 480, day_until_min = 390",
    "day_from_min = 480, day_until_min = 480",
    "day_from_min = -1, day_until_min = 60",
    "day_from_min = 60, day_until_min = 1441",
    "day_part = 'morning', day_from_min = 390, day_until_min = 480",
  ])("refuses %s", async (set) => {
    await expect(setOnGoal(set)).rejects.toThrow(/goals_day_window/);
  });

  it("cannot be written on another user's goal", async () => {
    const g = await seedGoal(db, alice, { deadline: "2027-03-14", rules: RULES });
    const rows = await db.withUser(bob, (q) => q("update app.goals set day_from_min = 390, day_until_min = 480 where id = $1::uuid returning id", [g.id]));
    expect(rows).toHaveLength(0);
  });
});
