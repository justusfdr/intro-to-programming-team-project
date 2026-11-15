// Tests for supabase/migrations/*_demo_contacts.sql (spec 32): the choice to see the demo contacts is
// off for every account, is written only through app.set_demo_contacts on the user's own row, and is
// read by the user only. Nothing else about the demo contacts lives in the database: no table of real
// people gains a row for them. A refusal changes nothing (R1).
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
  alice = await db.createUser("alice@example.com", { confirmed: true });
  bob = await db.createUser("bob@example.com", { confirmed: true });
});

const as = <T extends Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) =>
  db.withUser(user, (q) => q<T>(sql, params));

const setDemo = (user: string, on: boolean | null) => as(user, "select app.set_demo_contacts($1::boolean)", [on]);
const choices = () => db.admin<{ id: string; demo_contacts: boolean }>("select id, demo_contacts from app.profiles order by id");

describe("app.profiles.demo_contacts", () => {
  it("is off for every account, new and old", async () => {
    expect((await choices()).every((row) => row.demo_contacts === false)).toBe(true);
    const carol = await db.createUser("carol@example.com", { confirmed: true });
    const [row] = await db.admin<{ demo_contacts: boolean }>("select demo_contacts from app.profiles where id = $1", [carol]);
    expect(row.demo_contacts).toBe(false);
  });

  it("the user reads only their own choice", async () => {
    await setDemo(alice, true);
    expect(await as(bob, "select id, demo_contacts from app.profiles")).toEqual([{ id: bob, demo_contacts: false }]);
    expect(await as(alice, "select id, demo_contacts from app.profiles")).toEqual([{ id: alice, demo_contacts: true }]);
  });
});

describe("app.set_demo_contacts", () => {
  it("switches the user's own choice on and off, nobody else's", async () => {
    await setDemo(alice, true);
    const after = await choices();
    expect(after.find((r) => r.id === alice)?.demo_contacts).toBe(true);
    expect(after.find((r) => r.id === bob)?.demo_contacts).toBe(false);
    await setDemo(alice, false);
    expect((await choices()).every((row) => row.demo_contacts === false)).toBe(true);
  });

  it("adds no row anywhere else: demo contacts are not accounts, contacts or shares", async () => {
    const count = async () =>
      db.admin<{ users: number; contacts: number; shares: number; invitations: number }>(
        `select (select count(*)::int from auth.users) as users, (select count(*)::int from app.contacts) as contacts,
                (select count(*)::int from app.shares) as shares, (select count(*)::int from app.contact_invitations) as invitations`,
      );
    const before = await count();
    await setDemo(alice, true);
    expect(await count()).toEqual(before);
  });

  it("refuses null, a caller who is not signed in, and changes nothing (R1)", async () => {
    await setDemo(alice, true);
    const before = await choices();
    await expect(setDemo(alice, null)).rejects.toThrow("Invalid request.");
    await expect(db.admin("select app.set_demo_contacts(true)")).rejects.toThrow("not signed in");
    expect(await choices()).toEqual(before);
  });

  it("the column cannot be written directly, even on the user's own row (R6)", async () => {
    await expect(as(alice, "update app.profiles set demo_contacts = true")).rejects.toThrow(/permission denied/);
    expect((await choices()).every((row) => row.demo_contacts === false)).toBe(true);
  });

  it("only signed-in users may call it, never anonymous visitors", async () => {
    const [rights] = await db.admin<{ anon: boolean; authenticated: boolean; everyone: boolean }>(
      `select has_function_privilege('anon', 'app.set_demo_contacts(boolean)', 'execute') as anon,
              has_function_privilege('authenticated', 'app.set_demo_contacts(boolean)', 'execute') as authenticated,
              exists (select 1 from information_schema.routine_privileges
                       where routine_schema = 'app' and routine_name = 'set_demo_contacts' and grantee = 'PUBLIC') as everyone`,
    );
    expect(rights).toEqual({ anon: false, authenticated: true, everyone: false });
  });
});
