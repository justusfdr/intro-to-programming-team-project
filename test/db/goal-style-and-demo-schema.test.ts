// Tests for supabase/migrations/*_goal_style_and_demo.sql (spec 13): the defaults main relies on, the
// checks on colour, icon and why, which columns a user may write, the demo mark (set once when a row
// is added, never changed later) and the welcome flag.
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

const RULES = [{ kind: "count" as const, target: 2 }];
const asAlice = (sql: string, params: unknown[] = []) => db.withUser(alice, (q) => q(sql, params));

/** A goal added the way main adds it: only its own columns, then a rule, in one transaction. */
function addAsMain(userId: string) {
  return db.withUser(userId, async (q) => {
    const [{ id }] = await q<{ id: string }>("insert into app.goals (title, deadline, auto_block) values ('Old', '2027-01-31', false) returning id");
    await q("insert into app.rules (goal_id, kind, target) values ($1, 'count', 2)", [id]);
    return id;
  });
}

describe("goal look: defaults main can ignore", () => {
  it("gives a goal added like main no colour, the rocket icon, an empty why and no demo mark", async () => {
    const id = await addAsMain(alice);
    const [row] = await db.admin("select color, icon, why, demo from app.goals where id = $1", [id]);
    expect(row).toEqual({ color: null, icon: "rocket", why: "", demo: false });
  });

  it("gives events, tasks and settings rows the defaults: no demo mark, welcome not answered", async () => {
    const [{ id: event }] = await asAlice(
      "insert into app.events (title, start_at, end_at) values ('Run', '2026-11-16T09:00Z', '2026-11-16T10:00Z') returning id",
    ) as { id: string }[];
    const [{ id: task }] = await asAlice("insert into app.tasks (title) values ('Shoes') returning id") as { id: string }[];
    expect(await db.admin("select demo from app.events where id = $1", [event])).toEqual([{ demo: false }]);
    expect(await db.admin("select demo from app.tasks where id = $1", [task])).toEqual([{ demo: false }]);
    expect(await db.admin("select welcome_answered from app.settings where user_id = $1", [alice])).toEqual([{ welcome_answered: false }]);
  });
});

describe("goal look: checks", () => {
  it("lets a user set colour, icon and why on their own goal", async () => {
    const g = await seedGoal(db, alice, { deadline: "2027-03-14", rules: RULES });
    const rows = await asAlice("update app.goals set color = 'slate', icon = 'code', why = $2 where id = $1 returning id", [g.id, "w".repeat(200)]);
    expect(rows).toHaveLength(1);
  });

  it.each([
    ["a colour outside the ten", "color = 'lime'", /goals_color/],
    ["an icon outside the ten", "icon = 'target'", /goals_icon/],
    ["an empty icon", "icon = ''", /goals_icon/],
    ["no icon", "icon = null", /null value|not-null/],
    ["a why of 201 characters", `why = '${"w".repeat(201)}'`, /goals_why_length/],
    ["no why", "why = null", /null value|not-null/],
  ])("refuses %s", async (_name, set, error) => {
    const g = await seedGoal(db, alice, { deadline: "2027-03-14", rules: RULES });
    await expect(asAlice(`update app.goals set ${set} where id = $1`, [g.id])).rejects.toThrow(error);
  });

  it("does not change another user's goal", async () => {
    const g = await seedGoal(db, bob, { deadline: "2027-03-14", rules: RULES });
    expect(await asAlice("update app.goals set color = 'pink' where id = $1 returning id", [g.id])).toEqual([]);
    expect(await db.admin("select color from app.goals where id = $1", [g.id])).toEqual([{ color: null }]);
  });
});

describe("the demo mark", () => {
  it("can be set when a goal, an event or a task is added", async () => {
    await db.withUser(alice, async (q) => {
      const [{ id }] = await q<{ id: string }>(
        "insert into app.goals (title, deadline, color, icon, why, demo) values ('Demo', '2027-01-31', 'rose', 'video', 'x', true) returning id",
      );
      await q("insert into app.rules (goal_id, kind, target) values ($1, 'hours', 6)", [id]);
      await q("insert into app.events (title, start_at, end_at, goal_id, demo) values ('E', '2026-11-16T09:00Z', '2026-11-16T10:00Z', $1, true)", [id]);
      await q("insert into app.tasks (title, goal_id, demo) values ('T', $1, true)", [id]);
    });
    const [counts] = await db.admin(
      `select (select count(*)::int from app.goals where demo) as goals, (select count(*)::int from app.events where demo) as events,
              (select count(*)::int from app.tasks where demo) as tasks`,
    );
    expect(counts).toEqual({ goals: 1, events: 1, tasks: 1 });
  });

  it("can never be changed afterwards, in either direction", async () => {
    const g = await seedGoal(db, alice, { deadline: "2027-03-14", rules: RULES });
    await expect(asAlice("update app.goals set demo = true where id = $1", [g.id])).rejects.toThrow(/permission denied/);
    await expect(asAlice("update app.events set demo = true")).rejects.toThrow(/permission denied/);
    await expect(asAlice("update app.tasks set demo = false")).rejects.toThrow(/permission denied/);
  });
});

describe("the welcome flag", () => {
  it("lets a user set it on their own settings row only", async () => {
    expect(await asAlice("update app.settings set welcome_answered = true returning user_id")).toEqual([{ user_id: alice }]);
    expect(await asAlice("update app.settings set welcome_answered = true where user_id = $1 returning user_id", [bob])).toEqual([]);
    expect(await db.admin("select welcome_answered from app.settings where user_id = $1", [bob])).toEqual([{ welcome_answered: false }]);
  });
});
