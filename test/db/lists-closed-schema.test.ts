// Tests for supabase/migrations/*_lists_closed.sql (spec 34): the shared lists of spec 30 are withdrawn.
// Their tables and functions stay in the database (nothing is dropped), but a signed-in user can no
// longer call any list function or read any list table. The text rule the bio shares stays callable,
// and the bio is saved as before. A refusal changes nothing (R1).
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

const DENIED = /permission denied/;
const ANY_ID = "00000000-0000-4000-8000-000000000001";
const NOW = "2026-11-15T12:00:00Z";

/** Every list function a user could call before, with arguments of the right types. */
const CALLS: { signature: string; sql: string; params: unknown[] }[] = [
  { signature: "app.create_list(text)", sql: "select app.create_list($1)", params: ["Flat shopping"] },
  { signature: "app.rename_list(uuid, text, timestamptz)", sql: "select app.rename_list($1::uuid, $2, $3::timestamptz)", params: [ANY_ID, "Trip", NOW] },
  { signature: "app.delete_list(uuid)", sql: "select app.delete_list($1::uuid)", params: [ANY_ID] },
  { signature: "app.add_list_member(uuid, uuid)", sql: "select app.add_list_member($1::uuid, $2::uuid)", params: [ANY_ID, ANY_ID] },
  { signature: "app.remove_list_member(uuid, uuid)", sql: "select app.remove_list_member($1::uuid, $2::uuid)", params: [ANY_ID, ANY_ID] },
  { signature: "app.leave_list(uuid)", sql: "select app.leave_list($1::uuid)", params: [ANY_ID] },
  { signature: "app.add_list_item(uuid, text)", sql: "select app.add_list_item($1::uuid, $2)", params: [ANY_ID, "Milk"] },
  { signature: "app.rename_list_item(uuid, text, timestamptz)", sql: "select app.rename_list_item($1::uuid, $2, $3::timestamptz)", params: [ANY_ID, "Bread", NOW] },
  { signature: "app.tick_list_item(uuid, boolean, timestamptz)", sql: "select app.tick_list_item($1::uuid, true, $2::timestamptz)", params: [ANY_ID, NOW] },
  { signature: "app.move_list_item(uuid, integer, timestamptz)", sql: "select app.move_list_item($1::uuid, 0, $2::timestamptz)", params: [ANY_ID, NOW] },
  { signature: "app.delete_list_item(uuid, timestamptz)", sql: "select app.delete_list_item($1::uuid, $2::timestamptz)", params: [ANY_ID, NOW] },
  { signature: "app.list_people(uuid)", sql: "select * from app.list_people($1::uuid)", params: [ANY_ID] },
  { signature: "app.can_use_list(uuid)", sql: "select app.can_use_list($1::uuid)", params: [ANY_ID] },
];

const TABLES = ["app.lists", "app.list_members", "app.list_items", "app.list_leaves"];

const counts = () =>
  db.admin<{ lists: number; members: number; items: number }>(
    `select (select count(*)::int from app.lists) as lists, (select count(*)::int from app.list_members) as members,
            (select count(*)::int from app.list_items) as items`,
  );

describe("the list functions", () => {
  for (const call of CALLS) {
    it(`${call.signature}: a signed-in user is refused and nothing changes`, async () => {
      const before = await counts();
      await expect(as(alice, call.sql, call.params)).rejects.toThrow(DENIED);
      expect(await counts()).toEqual(before);
    });
  }

  it("no role a visitor or user has may execute any of them; they all still exist", async () => {
    for (const call of CALLS) {
      const [row] = await db.admin<{ authenticated: boolean; anon: boolean; public: boolean }>(
        `select has_function_privilege('authenticated', $1, 'execute') as authenticated,
                has_function_privilege('anon', $1, 'execute') as anon,
                exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                         where p.oid = $1::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') as public`,
        [call.signature],
      );
      expect({ signature: call.signature, ...row }).toEqual({ signature: call.signature, authenticated: false, anon: false, public: false });
    }
  });
});

describe("the list tables", () => {
  it("a signed-in user cannot read any of them, not even a row of their own", async () => {
    // A list as the database's owner would have made it: Alice owns it.
    const [{ id }] = await db.admin<{ id: string }>("insert into app.lists (owner, title) values ($1, 'Flat shopping') returning id", [alice]);
    await db.admin("insert into app.list_items (list_id, title, position, added_by) values ($1, 'Milk', 0, $2)", [id, alice]);
    for (const table of TABLES) {
      await expect(as(alice, `select * from ${table}`)).rejects.toThrow(DENIED);
      await expect(as(bob, `select * from ${table}`)).rejects.toThrow(DENIED);
    }
    await expect(as(alice, "select id, list_id, user_id, added_at from app.list_members")).rejects.toThrow(DENIED);
  });

  it("no table or column right is left for users; the tables still exist with row-level security on", async () => {
    for (const table of TABLES) {
      const [row] = await db.admin<{ any: boolean; rls: boolean }>(
        `select has_table_privilege('authenticated', $1, 'select, insert, update, delete') as any,
                (select relrowsecurity from pg_class where oid = $1::regclass) as rls`,
        [table],
      );
      expect({ table, ...row }).toEqual({ table, any: false, rls: true });
      const [anon] = await db.admin<{ any: boolean }>("select has_table_privilege('anon', $1, 'select, insert, update, delete') as any", [table]);
      expect(anon.any).toBe(false);
    }
    const [column] = await db.admin<{ any: boolean }>(
      "select has_any_column_privilege('authenticated', 'app.list_members', 'select, insert, update') as any",
    );
    expect(column.any).toBe(false);
  });
});

describe("what stays", () => {
  it("the text rule the bio shares is still callable by a signed-in user", async () => {
    expect(await as(alice, "select app.list_text_valid($1, 160) as ok", ["Runs on coffee"])).toEqual([{ ok: true }]);
    expect(await as(alice, "select app.list_text_valid($1, 160) as ok", ["Line\nbreak"])).toEqual([{ ok: false }]);
  });

  it("the bio is still saved through app.set_profile, and a broken one is still refused", async () => {
    await as(alice, "select app.set_profile($1, $2, $3)", ["Alice", "Runs on coffee", null]);
    await expect(as(alice, "select app.set_profile($1, $2, $3)", ["Alice", "Two\nlines", null])).rejects.toThrow();
    const [row] = await db.admin<{ bio: string }>("select bio from app.profiles where id = $1", [alice]);
    expect(row.bio).toBe("Runs on coffee");
  });

  it("contacts still see each other's card: app.may_see_profile works without any list rows", async () => {
    await as(alice, "select app.invite_contact($1)", ["bob@example.com"]);
    const [invitation] = await as<{ id: string }>(bob, "select id from app.contact_cards() where kind = 'received'");
    await as(bob, "select app.answer_invitation($1::uuid, true)", [invitation.id]);
    expect((await as(alice, "select * from app.profile_card($1::uuid)", [bob])).length).toBe(1);
  });
});
