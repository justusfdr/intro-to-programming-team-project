// Tests for supabase/migrations/*_goal_routine.sql (spec 41): a goal added the old way still works and
// gets the defaults; every check on the new columns accepts and refuses what it should; a signed-in user
// can write the new columns of their own goal and not of another user's.
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

/** Sets the given columns on a fresh goal of Alice's, as Alice. */
async function setOnGoal(set: string, params: unknown[] = []) {
  const g = await seedGoal(db, alice, { deadline: "2027-03-14", rules: RULES });
  return asAlice(`update app.goals set ${set} where id = $1::uuid returning id`, [g.id, ...params]);
}

describe("goal routine: a goal added the old way", () => {
  it("still works with only title, deadline and auto_block, and gets the defaults", async () => {
    const id = await db.withUser(alice, async (q) => {
      const [{ id }] = await q<{ id: string }>("insert into app.goals (title, deadline, auto_block) values ('Old', '2027-01-31', false) returning id");
      await q("insert into app.rules (goal_id, kind, target) values ($1, 'count', 2)", [id]);
      return id;
    });
    const [row] = await db.admin(
      "select category, category_other, session_minutes, day_part, avoid_days, location, open_ended, deadline::text as deadline from app.goals where id = $1",
      [id],
    );
    expect(row).toEqual({
      category: null,
      category_other: null,
      session_minutes: null,
      day_part: null,
      avoid_days: "",
      location: null,
      open_ended: false,
      deadline: "2027-01-31",
    });
  });

  it("keeps the deadline required, also for an open-ended goal", async () => {
    await expect(
      db.withUser(alice, async (q) => {
        const [{ id }] = await q<{ id: string }>("insert into app.goals (title, deadline, open_ended) values ('No end', null, true) returning id");
        await q("insert into app.rules (goal_id, kind, target) values ($1, 'count', 2)", [id]);
      }),
    ).rejects.toThrow(/null value|not-null/);
  });
});

describe("goal routine: category", () => {
  it.each(["sport", "uni", "work", "personal", "other"])("accepts %s", async (category) => {
    expect(await setOnGoal("category = $2::text", [category])).toHaveLength(1);
  });

  it.each([["Sport"], ["music"], [""]])("refuses %j", async (category) => {
    await expect(setOnGoal("category = $2::text", [category])).rejects.toThrow(/goals_category/);
  });

  it("accepts an own word with 'other', up to 30 characters", async () => {
    expect(await setOnGoal("category = 'other', category_other = $2::text", ["Music"])).toHaveLength(1);
    expect(await setOnGoal("category = 'other', category_other = $2::text", ["m".repeat(30)])).toHaveLength(1);
  });

  it.each([
    ["without a category", "category_other = 'Music'"],
    ["with another category", "category = 'sport', category_other = 'Music'"],
    ["of 31 characters", `category = 'other', category_other = '${"m".repeat(31)}'`],
    ["with a line break", "category = 'other', category_other = E'Mu\\nsic'"],
    ["with a space at the end", "category = 'other', category_other = 'Music '"],
    ["empty", "category = 'other', category_other = ''"],
    ["with a zero-width space", "category = 'other', category_other = E'Mu\\u200bsic'"],
  ])("refuses an own word %s", async (_name, set) => {
    await expect(setOnGoal(set)).rejects.toThrow(/goals_category_other/);
  });
});

describe("goal routine: session minutes", () => {
  it.each([1, 15, 50, 240, 720])("accepts %i", async (minutes) => {
    expect(await setOnGoal("session_minutes = $2::integer", [minutes])).toHaveLength(1);
  });

  it.each([0, -15, 721])("refuses %i", async (minutes) => {
    await expect(setOnGoal("session_minutes = $2::integer", [minutes])).rejects.toThrow(/goals_session_minutes/);
  });
});

describe("goal routine: day part", () => {
  it.each(["morning", "afternoon", "evening"])("accepts %s", async (part) => {
    expect(await setOnGoal("day_part = $2::text", [part])).toHaveLength(1);
  });

  it.each(["night", "Morning", ""])("refuses %j", async (part) => {
    await expect(setOnGoal("day_part = $2::text", [part])).rejects.toThrow(/goals_day_part/);
  });
});

describe("goal routine: avoided days", () => {
  it.each(["", "5", "67", "123456"])("accepts %j", async (days) => {
    expect(await setOnGoal("avoid_days = $2::text", [days])).toHaveLength(1);
  });

  it.each(["1234567", "55", "51", "8", "a", "0"])("refuses %j", async (days) => {
    await expect(setOnGoal("avoid_days = $2::text", [days])).rejects.toThrow(/goals_avoid_days/);
  });

  it("refuses no value at all", async () => {
    await expect(setOnGoal("avoid_days = null")).rejects.toThrow(/null value|not-null/);
  });
});

describe("goal routine: location", () => {
  it("accepts 1 and 200 characters", async () => {
    expect(await setOnGoal("location = $2::text", ["Gym"])).toHaveLength(1);
    expect(await setOnGoal("location = $2::text", ["l".repeat(200)])).toHaveLength(1);
  });

  it.each([
    ["an empty string", ""],
    ["201 characters", "l".repeat(201)],
    ["a space at the start", " Gym"],
  ])("refuses %s", async (_name, location) => {
    await expect(setOnGoal("location = $2::text", [location])).rejects.toThrow(/goals_location/);
  });
});

describe("goal routine: rights", () => {
  it("lets a signed-in user write every new column of their own goal, when adding and changing it", async () => {
    const id = await db.withUser(alice, async (q) => {
      const [{ id }] = await q<{ id: string }>(
        `insert into app.goals (title, deadline, category, category_other, session_minutes, day_part, avoid_days, location, open_ended)
         values ('Band', '2027-11-15', 'other', 'Music', 60, 'evening', '67', 'Studio', true) returning id`,
      );
      await q("insert into app.rules (goal_id, kind, target) values ($1, 'count', 2)", [id]);
      return id;
    });
    const changed = await asAlice(
      `update app.goals set category = 'sport', category_other = null, session_minutes = 45, day_part = 'morning',
              avoid_days = '1', location = 'Park', open_ended = false where id = $1::uuid returning id`,
      [id],
    );
    expect(changed).toHaveLength(1);
    const [row] = await db.admin("select category, session_minutes, day_part, avoid_days, location, open_ended from app.goals where id = $1", [id]);
    expect(row).toEqual({ category: "sport", session_minutes: 45, day_part: "morning", avoid_days: "1", location: "Park", open_ended: false });
  });

  it("does not change another user's goal", async () => {
    const g = await seedGoal(db, bob, { deadline: "2027-03-14", rules: RULES });
    const changed = await asAlice(
      "update app.goals set category = 'uni', session_minutes = 30, day_part = 'evening', avoid_days = '7', location = 'Library', open_ended = true where id = $1::uuid returning id",
      [g.id],
    );
    expect(changed).toEqual([]);
    const [row] = await db.admin("select category, session_minutes, day_part, avoid_days, location, open_ended from app.goals where id = $1", [g.id]);
    expect(row).toEqual({ category: null, session_minutes: null, day_part: null, avoid_days: "", location: null, open_ended: false });
  });
});
