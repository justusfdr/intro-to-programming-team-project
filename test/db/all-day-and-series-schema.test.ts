// Tests for supabase/migrations/*_all_day_and_repeating.sql: every R29 rule in the database itself.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedGoal } from "@test/support/goals";
import { createTestDb, type TestDb } from "./harness";

let db: TestDb;
let alice: string;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.admin("delete from auth.users");
  alice = await db.createUser("alice@example.com", { confirmed: true });
});

function insertAs(columns: string, values: unknown[]) {
  const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
  return db.withUser(alice, (q) => q(`insert into app.events (${columns}) values (${placeholders})`, values));
}

const SERIES = "11111111-1111-4111-8111-111111111111";

describe("all-day events in the database (R29)", () => {
  it("accepts an all-day event with a first and last day and no times (31 days at most)", async () => {
    await insertAs("title, all_day, first_day, last_day", ["Exam week", true, "2026-11-16", "2026-11-20"]);
    await insertAs("title, all_day, first_day, last_day", ["Trip", true, "2026-12-01", "2026-12-31"]);
    expect(await db.admin("select count(*)::int as n from app.events where all_day")).toEqual([{ n: 2 }]);
  });

  it.each([
    ["all-day with times", "title, all_day, first_day, last_day, start_at, end_at", ["x", true, "2026-11-16", "2026-11-16", "2026-11-16T09:00:00Z", "2026-11-16T10:00:00Z"], /events_timed_or_all_day/],
    ["all-day without a last day", "title, all_day, first_day", ["x", true, "2026-11-16"], /events_timed_or_all_day/],
    ["timed with days", "title, start_at, end_at, first_day, last_day", ["x", "2026-11-16T09:00:00Z", "2026-11-16T10:00:00Z", "2026-11-16", "2026-11-16"], /events_timed_or_all_day/],
    ["timed without times", "title", ["x"], /events_timed_or_all_day/],
    ["the last day before the first", "title, all_day, first_day, last_day", ["x", true, "2026-11-20", "2026-11-16"], /events_last_day_after_first/],
    ["32 days", "title, all_day, first_day, last_day", ["x", true, "2026-12-01", "2027-01-01"], /events_at_most_31_days/],
    ["a series", "title, all_day, first_day, last_day, series_id", ["x", true, "2026-11-16", "2026-11-16", SERIES], /events_all_day_no_series/],
  ])("refuses %s", async (_case, columns, values, constraint) => {
    await expect(insertAs(columns, values)).rejects.toThrow(constraint);
    expect(await db.admin("select 1 from app.events")).toEqual([]);
  });

  it("refuses a goal on an all-day event and marking it done", async () => {
    const goal = await seedGoal(db, alice, { deadline: "2027-03-14", rules: [{ kind: "count", target: 1 }] });
    await expect(insertAs("title, all_day, first_day, last_day, goal_id", ["x", true, "2026-11-16", "2026-11-16", goal.id])).rejects.toThrow(
      /events_all_day_no_goal/,
    );
    await insertAs("title, all_day, first_day, last_day", ["x", true, "2026-11-16", "2026-11-16"]);
    await expect(db.withUser(alice, (q) => q("update app.events set status = 'done'"))).rejects.toThrow(/events_all_day_not_done/);
  });

  it("does not let a user move an event to another series afterwards", async () => {
    await insertAs("title, start_at, end_at, series_id", ["x", "2026-11-16T09:00:00Z", "2026-11-16T10:00:00Z", SERIES]);
    await expect(db.withUser(alice, (q) => q("update app.events set series_id = null"))).rejects.toThrow(/permission denied/);
  });
});
