// Tests for supabase/migrations/*_settings_and_account.sql: the display columns of app.settings
// (defaults, checks, column rights) and app.delete_account() (only the signed-in user, Free plan only).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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
  alice = await db.createUser("alice@example.com", { timeZone: "Europe/Berlin", confirmed: true });
  bob = await db.createUser("bob@example.com", { timeZone: "America/New_York", confirmed: true });
});

const asAlice = (sql: string, params: unknown[] = []) => db.withUser(alice, (q) => q(sql, params));

describe("display settings", () => {
  it("gives a new account 12-hour times and the hours 7 to 21", async () => {
    const [row] = await db.admin("select time_format, day_start_hour, day_end_hour from app.settings where user_id = $1", [alice]);
    expect(row).toEqual({ time_format: "12h", day_start_hour: 7, day_end_hour: 21 });
  });

  it("lets a user change the new columns of their own row", async () => {
    const rows = await asAlice("update app.settings set time_format = '24h', day_start_hour = 0, day_end_hour = 24 returning user_id");
    expect(rows).toEqual([{ user_id: alice }]);
  });

  it("does not change another user's display settings", async () => {
    const rows = await asAlice("update app.settings set time_format = '24h' where user_id = $1 returning id", [bob]);
    expect(rows).toEqual([]);
    const [row] = await db.admin("select time_format from app.settings where user_id = $1", [bob]);
    expect(row).toEqual({ time_format: "12h" });
  });

  it.each([
    ["an unknown time format", "time_format = '36h'"],
    ["a first hour of 24", "day_start_hour = 24, day_end_hour = 24"],
    ["a first hour below 0", "day_start_hour = -1"],
    ["a last hour of 25", "day_end_hour = 25"],
    ["a last hour of 0", "day_start_hour = 0, day_end_hour = 0"],
    ["hours that end before they start", "day_start_hour = 10, day_end_hour = 9"],
    ["hours that end where they start", "day_start_hour = 9, day_end_hour = 9"],
  ])("refuses %s", async (_name, set) => {
    await expect(asAlice(`update app.settings set ${set}`)).rejects.toThrow(/settings_/);
  });

  it("still lets a user write neither their plan nor their user id", async () => {
    await expect(asAlice("update app.profiles set plan = 'pro'")).rejects.toThrow(/permission denied/);
    await expect(asAlice("update app.settings set user_id = $1", [bob])).rejects.toThrow(/permission denied/);
  });
});

describe("app.delete_account()", () => {
  it("deletes the signed-in user and every row of theirs, and nobody else", async () => {
    await asAlice("select app.delete_account()");
    const users = await db.admin<{ email: string }>("select email from auth.users order by email");
    expect(users).toEqual([{ email: "bob@example.com" }]);
    const left = await db.admin(
      "select 1 from app.profiles where id = $1 union all select 1 from app.settings where user_id = $1 union all select 1 from app.blocked_sites where user_id = $1",
      [alice],
    );
    expect(left).toEqual([]);
    const [bobSettings] = await db.admin<{ n: number }>("select count(*)::int as n from app.settings where user_id = $1", [bob]);
    expect(bobSettings.n).toBe(1);
  });

  it("refuses while the plan is Pro, and deletes nothing", async () => {
    await db.admin("update app.profiles set plan = 'pro' where id = $1", [alice]);
    await expect(asAlice("select app.delete_account()")).rejects.toThrow("Cancel Pro before deleting your account");
    const [user] = await db.admin<{ n: number }>("select count(*)::int as n from auth.users where id = $1", [alice]);
    expect(user.n).toBe(1);
  });

  it("refuses without a signed-in user", async () => {
    // No user id in the request: auth.uid() is null.
    await expect(db.admin("select app.delete_account()")).rejects.toThrow(/not signed in/);
    const users = await db.admin("select id from auth.users");
    expect(users).toHaveLength(2);
  });

  it("cannot be run by anonymous visitors", async () => {
    const [row] = await db.admin<{ allowed: boolean }>(
      "select has_function_privilege('anon', 'app.delete_account()', 'execute') as allowed",
    );
    expect(row.allowed).toBe(false);
  });
});
