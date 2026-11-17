// Tests for supabase/migrations/*_widgets.sql: the widget list on app.settings
// (empty by default, null or a list of at most 18, own row only).
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
const widget = { kind: "focus", size: "1x1" };

describe("widgets column", () => {
  it("is empty for a new account", async () => {
    const [row] = await db.admin("select widgets from app.settings where user_id = $1", [alice]);
    expect(row).toEqual({ widgets: null });
  });

  it("lets a user save a list and set it back to null on their own row", async () => {
    const saved = await asAlice("update app.settings set widgets = $1::jsonb returning widgets", [JSON.stringify([widget])]);
    expect(saved).toEqual([{ widgets: [widget] }]);
    const cleared = await asAlice("update app.settings set widgets = null returning widgets");
    expect(cleared).toEqual([{ widgets: null }]);
  });

  it("accepts the empty list and exactly 18 elements", async () => {
    expect(await asAlice("update app.settings set widgets = '[]'::jsonb returning widgets")).toEqual([{ widgets: [] }]);
    const eighteen = JSON.stringify(Array.from({ length: 18 }, () => widget));
    const rows = await asAlice("update app.settings set widgets = $1::jsonb returning jsonb_array_length(widgets) as n", [eighteen]);
    expect(rows).toEqual([{ n: 18 }]);
  });

  it.each([['{"kind":"focus"}'], ['"focus"'], ["5"], ["true"]])("refuses %s, which is not a list", async (json) => {
    await expect(asAlice("update app.settings set widgets = $1::jsonb", [json])).rejects.toThrow(/settings_widgets/);
  });

  it("refuses 19 elements", async () => {
    const nineteen = JSON.stringify(Array.from({ length: 19 }, () => widget));
    await expect(asAlice("update app.settings set widgets = $1::jsonb", [nineteen])).rejects.toThrow(/settings_widgets/);
    const [row] = await db.admin("select widgets from app.settings where user_id = $1", [alice]);
    expect(row).toEqual({ widgets: null });
  });

  it("does not change another user's widgets", async () => {
    const rows = await asAlice("update app.settings set widgets = '[]'::jsonb where user_id = $1 returning id", [bob]);
    expect(rows).toEqual([]);
    const [row] = await db.admin("select widgets from app.settings where user_id = $1", [bob]);
    expect(row).toEqual({ widgets: null });
  });

  it("leaves the older columns writable as before (main keeps working)", async () => {
    const rows = await asAlice("update app.settings set time_zone = 'Europe/Lisbon', travel_buffer_minutes = 5 returning time_zone");
    expect(rows).toEqual([{ time_zone: "Europe/Lisbon" }]);
  });
});
