// Tests for supabase/migrations/*_goals.sql: row-level security (R3), links only within one user's
// rows, the R7 checks, "a goal needs at least one rule", and what deleting a goal does.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedEvent } from "@test/support/events";
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

const COUNT_2 = { kind: "count" as const, target: 2, minMinutes: 45 };
const TIMES = { start: "2026-11-17T09:00:00Z", end: "2026-11-17T10:00:00Z" };

/** A goal with one rule, written as the user in one statement (the way the actions do it). */
function createGoalAs(userId: string, rule: { kind: string; target: number; min: number | null }, title = "Run") {
  return db.withUser(userId, (q) =>
    q<{ id: string }>(
      `with g as (insert into app.goals (title, deadline) values ($1, '2027-03-14') returning id)
       insert into app.rules (goal_id, kind, target, min_minutes) select id, $2, $3, $4 from g returning goal_id as id`,
      [title, rule.kind, rule.target, rule.min],
    ),
  );
}

describe("goals and rules belong to their user (R3)", () => {
  it("lets a user create a goal with a rule; the database fills in owner, created_at and updated_at", async () => {
    const [{ id }] = await createGoalAs(alice, { kind: "count", target: 2, min: 45 });
    const [goal] = await db.admin("select user_id, auto_block, created_at is not null as created from app.goals where id = $1", [id]);
    expect(goal).toEqual({ user_id: alice, auto_block: false, created: true });
  });

  it("hides another user's goal and rule: not returned, not changed, not deleted", async () => {
    const bobs = await seedGoal(db, bob, { deadline: "2027-03-14", rules: [COUNT_2] });
    const before = await db.admin("select * from app.goals, app.rules where app.goals.id = $1", [bobs.id]);

    expect(await db.withUser(alice, (q) => q("select * from app.goals"))).toEqual([]);
    expect(await db.withUser(alice, (q) => q("select * from app.rules"))).toEqual([]);
    expect(await db.withUser(alice, (q) => q("update app.goals set title = 'x' where id = $1 returning id", [bobs.id]))).toEqual([]);
    expect(await db.withUser(alice, (q) => q("delete from app.rules where id = $1 returning id", [bobs.ruleIds[0]]))).toEqual([]);
    expect(await db.withUser(alice, (q) => q("delete from app.goals where id = $1 returning id", [bobs.id]))).toEqual([]);

    expect(await db.admin("select * from app.goals, app.rules where app.goals.id = $1", [bobs.id])).toEqual(before);
  });

  it("refuses a rule for another user's goal, even with its id", async () => {
    const bobs = await seedGoal(db, bob, { deadline: "2027-03-14", rules: [COUNT_2] });
    await expect(
      db.withUser(alice, (q) => q("insert into app.rules (goal_id, kind, target) values ($1, 'count', 1)", [bobs.id])),
    ).rejects.toThrow(/rules_goal_of_same_user/);
  });

  it("does not let a user write the columns the database owns", async () => {
    const own = await seedGoal(db, alice, { deadline: "2027-03-14", rules: [COUNT_2] });
    for (const assignment of ["created_at = now()", "updated_at = now()", "user_id = user_id", "id = id"]) {
      await expect(
        db.withUser(alice, (q) => q(`update app.goals set ${assignment} where id = $1`, [own.id])),
        assignment,
      ).rejects.toThrow(/permission denied/);
    }
    await expect(
      db.withUser(alice, (q) => q("update app.rules set goal_id = goal_id where id = $1", [own.ruleIds[0]])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("an event links only to its owner's goals", () => {
  it("accepts the user's own goal", async () => {
    const own = await seedGoal(db, alice, { deadline: "2027-03-14", rules: [COUNT_2] });
    const event = await seedEvent(db, alice, TIMES);
    await db.withUser(alice, (q) => q("update app.events set goal_id = $2 where id = $1", [event.id, own.id]));
    expect(await db.admin("select goal_id from app.events where id = $1", [event.id])).toEqual([{ goal_id: own.id }]);
  });

  it("refuses another user's goal on insert and on update, even with its id", async () => {
    const bobs = await seedGoal(db, bob, { deadline: "2027-03-14", rules: [COUNT_2] });
    const event = await seedEvent(db, alice, TIMES);
    await expect(
      db.withUser(alice, (q) =>
        q("insert into app.events (title, start_at, end_at, goal_id) values ('x', $1, $2, $3)", [TIMES.start, TIMES.end, bobs.id]),
      ),
    ).rejects.toThrow(/events_goal_of_same_user/);
    await expect(
      db.withUser(alice, (q) => q("update app.events set goal_id = $2 where id = $1", [event.id, bobs.id])),
    ).rejects.toThrow(/events_goal_of_same_user/);
    expect(await db.admin("select goal_id from app.events where id = $1", [event.id])).toEqual([{ goal_id: null }]);
  });
});

describe("a goal always has at least one rule (R7)", () => {
  it("refuses a goal without a rule", async () => {
    await expect(
      db.withUser(alice, (q) => q("insert into app.goals (title, deadline) values ('Run', '2027-03-14')")),
    ).rejects.toThrow(/A goal needs at least one rule/);
    expect(await db.admin("select 1 from app.goals")).toEqual([]);
  });

  it("refuses deleting the last rule, and allows deleting one of two", async () => {
    const own = await seedGoal(db, alice, { deadline: "2027-03-14", rules: [COUNT_2, { kind: "hours", target: 6 }] });
    await db.withUser(alice, (q) => q("delete from app.rules where id = $1", [own.ruleIds[0]]));
    await expect(
      db.withUser(alice, (q) => q("delete from app.rules where id = $1", [own.ruleIds[1]])),
    ).rejects.toThrow(/A goal needs at least one rule/);
    expect(await db.admin("select count(*)::int as n from app.rules")).toEqual([{ n: 1 }]);
  });

  it("deletes the goal with its rules and keeps its events, without goal", async () => {
    const own = await seedGoal(db, alice, { deadline: "2027-03-14", rules: [COUNT_2] });
    const event = await seedEvent(db, alice, { ...TIMES, goalId: own.id });
    await db.withUser(alice, (q) => q("delete from app.goals where id = $1", [own.id]));
    expect(await db.admin("select 1 from app.rules")).toEqual([]);
    expect(await db.admin("select user_id, goal_id from app.events where id = $1", [event.id])).toEqual([
      { user_id: alice, goal_id: null },
    ]);
  });
});

describe("checks the database enforces itself (R7)", () => {
  it.each([
    ["count 0", { kind: "count", target: 0, min: null }, /rules_count_target/],
    ["count 15", { kind: "count", target: 15, min: null }, /rules_count_target/],
    ["count 2.5", { kind: "count", target: 2.5, min: null }, /rules_count_target/],
    ["hours 0", { kind: "hours", target: 0, min: null }, /rules_hours_target/],
    ["hours 60.5", { kind: "hours", target: 60.5, min: null }, /rules_hours_target/],
    ["hours 1.3", { kind: "hours", target: 1.3, min: null }, /rules_hours_target/],
    ["min_minutes 14", { kind: "count", target: 2, min: 14 }, /rules_min_minutes/],
    ["min_minutes 241", { kind: "count", target: 2, min: 241 }, /rules_min_minutes/],
    ["min_minutes on an hours rule", { kind: "hours", target: 2, min: 30 }, /rules_min_minutes/],
    ["an unknown kind", { kind: "days", target: 2, min: null }, /rules_kind/],
  ])("rejects %s and saves no goal", async (_case, rule, constraint) => {
    await expect(createGoalAs(alice, rule)).rejects.toThrow(constraint);
    expect(await db.admin("select 1 from app.goals")).toEqual([]);
  });

  it.each([
    ["count 1 and 14, min_minutes 15 and 240", [{ kind: "count", target: 1, min: 15 }, { kind: "count", target: 14, min: 240 }]],
    ["hours 0.5 and 60", [{ kind: "hours", target: 0.5, min: null }, { kind: "hours", target: 60, min: null }]],
  ])("accepts the limits: %s", async (_case, rules) => {
    for (const rule of rules) await createGoalAs(alice, rule);
    expect(await db.admin("select count(*)::int as n from app.goals")).toEqual([{ n: 2 }]);
  });

  it("rejects an empty and an 81-character title, accepts 80", async () => {
    await expect(createGoalAs(alice, { kind: "count", target: 1, min: null }, "")).rejects.toThrow(/goals_title_length/);
    await expect(createGoalAs(alice, { kind: "count", target: 1, min: null }, "x".repeat(81))).rejects.toThrow(/goals_title_length/);
    await createGoalAs(alice, { kind: "count", target: 1, min: null }, "x".repeat(80));
  });
});

describe("updated_at of a goal (R4)", () => {
  it("grows with every change and cannot be set by the user", async () => {
    const own = await seedGoal(db, alice, { deadline: "2027-03-14", rules: [COUNT_2] });
    const [row] = await db.withUser(alice, (q) =>
      q<{ updated_at: Date }>("update app.goals set title = 'New' where id = $1 returning updated_at", [own.id]),
    );
    expect(new Date(row.updated_at).getTime()).toBeGreaterThan(Date.parse(own.updatedAt));
  });
});
