// Tests for supabase/migrations/*_default_view.sql: the calendar's default view on app.settings
// (default, check, column right, own row only).
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

describe("default view", () => {
  it("gives a new account the week", async () => {
    const [row] = await db.admin("select default_view from app.settings where user_id = $1", [alice]);
    expect(row).toEqual({ default_view: "week" });
  });

  it.each(["day", "week", "month"])("lets a user choose %s on their own row", async (view) => {
    const rows = await asAlice("update app.settings set default_view = $1 returning default_view", [view]);
    expect(rows).toEqual([{ default_view: view }]);
  });

  it("does not change another user's default view", async () => {
    const rows = await asAlice("update app.settings set default_view = 'month' where user_id = $1 returning id", [bob]);
    expect(rows).toEqual([]);
    const [row] = await db.admin("select default_view from app.settings where user_id = $1", [bob]);
    expect(row).toEqual({ default_view: "week" });
  });

  it.each(["year", "", "Week"])("refuses the view %j", async (view) => {
    await expect(asAlice("update app.settings set default_view = $1", [view])).rejects.toThrow(/settings_default_view/);
  });

  it("leaves the older columns writable as before (main keeps working)", async () => {
    const rows = await asAlice("update app.settings set time_zone = 'Europe/Lisbon', travel_buffer_minutes = 5 returning time_zone");
    expect(rows).toEqual([{ time_zone: "Europe/Lisbon" }]);
  });
});
