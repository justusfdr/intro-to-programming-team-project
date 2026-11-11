// Tests for supabase/migrations/*_accounts.sql and withUser: row-level security, grants and constraints.
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

describe("rows created at sign-up", () => {
  it("creates a free profile and a settings row with the given time zone and defaults", async () => {
    const [profile] = await db.admin("select plan from app.profiles where id = $1", [alice]);
    const [settings] = await db.admin(
      "select time_zone, home_address, travel_mode, travel_buffer_minutes from app.settings where user_id = $1",
      [alice],
    );
    expect(profile).toEqual({ plan: "free" });
    expect(settings).toEqual({
      time_zone: "Europe/Berlin",
      home_address: null,
      travel_mode: "driving",
      travel_buffer_minutes: 10,
    });
  });

  it("uses Europe/Lisbon when the time zone is missing or unknown", async () => {
    const none = await db.createUser("none@example.com");
    const wrong = await db.createUser("wrong@example.com", { timeZone: "Mars/Olympus_Mons" });
    const rows = await db.admin<{ time_zone: string }>(
      "select time_zone from app.settings where user_id in ($1, $2)",
      [none, wrong],
    );
    expect(rows.map((r) => r.time_zone)).toEqual(["Europe/Lisbon", "Europe/Lisbon"]);
  });

  it("deletes the rows together with the user", async () => {
    await db.admin("delete from auth.users where id = $1", [alice]);
    const rows = await db.admin(
      "select 1 from app.profiles where id = $1 union all select 1 from app.settings where user_id = $1",
      [alice],
    );
    expect(rows).toEqual([]);
  });
});

describe("row-level security (R3)", () => {
  it("lets a user read only their own profile and settings", async () => {
    const profiles = await db.withUser(alice, (q) => q("select id from app.profiles"));
    const settings = await db.withUser(alice, (q) => q("select user_id from app.settings"));
    expect(profiles).toEqual([{ id: alice }]);
    expect(settings).toEqual([{ user_id: alice }]);
  });

  it("returns nothing when a user asks for another user's row", async () => {
    const rows = await db.withUser(alice, (q) => q("select * from app.settings where user_id = $1", [bob]));
    expect(rows).toEqual([]);
  });

  it("does not change another user's settings", async () => {
    const changed = await db.withUser(alice, (q) =>
      q("update app.settings set travel_buffer_minutes = 99 where user_id = $1 returning id", [bob]),
    );
    expect(changed).toEqual([]);
    const [row] = await db.admin("select travel_buffer_minutes from app.settings where user_id = $1", [bob]);
    expect(row).toEqual({ travel_buffer_minutes: 10 });
  });

  it("lets a user change their own settings", async () => {
    await db.withUser(alice, (q) =>
      q("update app.settings set travel_buffer_minutes = 25 where user_id = $1", [alice]),
    );
    const [row] = await db.admin("select travel_buffer_minutes from app.settings where user_id = $1", [alice]);
    expect(row).toEqual({ travel_buffer_minutes: 25 });
  });

  it("has row-level security switched on for every table in the app schema", async () => {
    const tables = await db.admin<{ name: string; rls: boolean }>(
      `select c.relname as name, c.relrowsecurity as rls
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'app' and c.relkind = 'r'`,
    );
    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) expect(table, table.name).toEqual({ name: table.name, rls: true });
  });

  it("gives the public role 'anon' no access to any table in the app schema", async () => {
    const grants = await db.admin(
      `select table_name, privilege_type from information_schema.role_table_grants
        where table_schema = 'app' and grantee in ('anon', 'PUBLIC')`,
    );
    expect(grants).toEqual([]);
  });
});

describe("the plan cannot be changed by the user (R6)", () => {
  it("rejects a direct update of the own plan and leaves it free", async () => {
    await expect(
      db.withUser(alice, (q) => q("update app.profiles set plan = 'pro' where id = $1", [alice])),
    ).rejects.toThrow(/permission denied/);
    const [row] = await db.admin("select plan from app.profiles where id = $1", [alice]);
    expect(row).toEqual({ plan: "free" });
  });

  it("rejects inserting or deleting profiles and settings", async () => {
    await expect(
      db.withUser(alice, (q) => q("delete from app.profiles where id = $1", [alice])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.withUser(alice, (q) => q("insert into app.settings (user_id) values ($1)", [alice])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("constraints the database enforces itself", () => {
  it.each([-1, 121])("rejects a travel buffer of %i minutes", async (minutes) => {
    await expect(
      db.withUser(alice, (q) =>
        q("update app.settings set travel_buffer_minutes = $2 where user_id = $1", [alice, minutes]),
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it("rejects an unknown travel mode", async () => {
    await expect(
      db.withUser(alice, (q) => q("update app.settings set travel_mode = 'flying' where user_id = $1", [alice])),
    ).rejects.toThrow(/check constraint/);
  });
});

describe("withUser", () => {
  it("rolls everything back when the callback throws (R1)", async () => {
    await expect(
      db.withUser(alice, async (q) => {
        await q("update app.settings set travel_buffer_minutes = 50 where user_id = $1", [alice]);
        throw new Error("something later failed");
      }),
    ).rejects.toThrow("something later failed");
    const [row] = await db.admin("select travel_buffer_minutes from app.settings where user_id = $1", [alice]);
    expect(row).toEqual({ travel_buffer_minutes: 10 });
  });

  it("refuses statements that would switch role or identity", async () => {
    for (const sql of [
      "reset role",
      "set role postgres",
      "SET LOCAL ROLE postgres",
      "set session authorization postgres",
      "select set_config('request.jwt.claim.sub', 'x', true)",
      'set local "request.jwt.claim.sub" = \'x\'',
    ]) {
      await expect(db.withUser(alice, (q) => q(sql)), sql).rejects.toThrow(/may not run inside withUser/);
    }
  });

  it("refuses a user id that is not a uuid", async () => {
    await expect(db.withUser("' or 1=1 --", (q) => q("select 1"))).rejects.toThrow(/uuid/);
  });

  it("runs as the role authenticated and leaves no role behind after the transaction", async () => {
    const [inside] = await db.withUser(alice, (q) => q("select current_user as role, auth.uid() as uid"));
    expect(inside).toEqual({ role: "authenticated", uid: alice });
    const [after] = await db.admin("select current_user as role");
    expect(after).toEqual({ role: "postgres" });
  });
});
