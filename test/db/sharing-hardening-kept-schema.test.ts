// The parts of test/db/_closed/sharing-hardening-schema.test.ts that do not need the shared lists, kept
// running after spec 34 closed the lists (copied unchanged except where the lists' functions are now
// closed). Tests for supabase/migrations/*_sharing_hardening.sql (security review of sharing):
// 1. invite_contact does the same work whether or not an address has an account;
// 2. an address of an account the sender already has a row for gets a row only the sender sees;
// 3. names and other shown texts refuse blank-looking and invisible characters and stacks of combining
//    marks, and a display name needs a letter or digit (the same table as the TypeScript side).
// Each with the accepted and the rejected case; a refusal changes nothing (R1).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TEXT_EXAMPLES } from "@test/support/text-examples";
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
  // Bob first: his row is the first one a scan of auth.users meets (see the timing test).
  bob = await db.createUser("bob@example.com", { confirmed: true });
  alice = await db.createUser("alice@example.com", { confirmed: true });
  // Carol and Dave as in the original file, so the timing test sees the same accounts.
  await db.createUser("carol@example.com", { confirmed: true });
  await db.createUser("dave@example.com", { confirmed: true });
});

const as = <T extends Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) =>
  db.withUser(user, (q) => q<T>(sql, params));

const sent = async (user: string) =>
  (await as<{ email: string }>(user, "select email from app.contact_cards() where kind = 'sent' order by email")).map((r) => r.email);
const received = async (user: string) =>
  (await as<{ user_id: string }>(user, "select user_id from app.contact_cards() where kind = 'received'")).map((r) => r.user_id);

describe("invite_contact: the same work for an address with and without an account (fix 1)", () => {
  /** The rows of auth.users read by sequential scans during one invitation (in its own transaction). */
  async function rowsRead(email: string): Promise<number> {
    return db.withUser(alice, async (q) => {
      const read = async () =>
        Number((await q<{ n: string }>("select seq_tup_read::text as n from pg_stat_xact_user_tables where relid = 'auth.users'::regclass"))[0]?.n ?? 0);
      const before = await read();
      await q("select app.invite_contact($1)", [email]);
      return (await read()) - before;
    });
  }

  it("reads every account for an address that matches the first one and for one without an account", async () => {
    for (let i = 0; i < 30; i += 1) await db.createUser(`user${i}@example.com`);
    const accounts = Number((await db.admin<{ n: string }>("select count(*)::text as n from auth.users"))[0].n);
    const match = await rowsRead("bob@example.com");
    const miss = await rowsRead("nobody@example.com");
    expect(miss).toBeGreaterThanOrEqual(accounts);
    expect(match).toBe(miss);
    // The look-up still finds the account: Bob has the invitation.
    expect(await received(bob)).toEqual([alice]);
  });
});

describe("invite_contact: an account under a changed address (fix 2)", () => {
  it("a second address of an account the sender already invited gets a row only the sender sees", async () => {
    await as(alice, "select app.invite_contact($1)", ["bob@example.com"]);
    await db.admin("update auth.users set email = 'bob@new.example' where id = $1", [bob]);
    await as(alice, "select app.invite_contact($1)", ["bob@new.example"]);
    // The sender's list shows both addresses, exactly as for an address without an account.
    expect(await sent(alice)).toEqual(["bob@example.com", "bob@new.example"]);
    await as(alice, "select app.invite_contact($1)", ["nobody@example.com"]);
    expect(await sent(alice)).toEqual(["bob@example.com", "bob@new.example", "nobody@example.com"]);
    // Bob still has one invitation from Alice, not two; the new row is linked to nobody.
    expect(await received(bob)).toEqual([alice]);
    expect(
      await db.admin("select to_email, to_user from app.contact_invitations where from_user = $1 order by to_email", [alice]),
    ).toEqual([
      { to_email: "bob@example.com", to_user: bob },
      { to_email: "bob@new.example", to_user: null },
      { to_email: "nobody@example.com", to_user: null },
    ]);
  });

  it("without an earlier row the address is still linked to the account (unchanged)", async () => {
    await db.admin("update auth.users set email = 'bob@new.example' where id = $1", [bob]);
    await as(alice, "select app.invite_contact($1)", ["bob@new.example"]);
    expect(await received(bob)).toEqual([alice]);
    expect(await sent(alice)).toEqual(["bob@new.example"]);
  });
});

describe("names and titles other people see (fix 3)", () => {
  for (const example of TEXT_EXAMPLES) {
    it(`${example.what}: name ${example.name ? "accepted" : "refused"}, title ${example.title ? "accepted" : "refused"}`, async () => {
      const [row] = await db.admin<{ name: boolean; title: boolean; list: boolean }>(
        "select app.display_name_valid($1) as name, app.list_text_valid($1, 200) as title, app.list_text_valid($1, 60) as list",
        [example.text],
      );
      expect(row).toEqual({ name: example.name, title: example.title, list: example.title });
    });
  }

  it("set_display_name refuses a blank-looking name and a name without a letter, and keeps the old one", async () => {
    await as(alice, "select app.set_display_name($1)", ["Lea Martins"]);
    for (const bad of ["ㅤ", "Lea­Martins", "😀", "á̂̃"]) {
      await expect(as(alice, "select app.set_display_name($1)", [bad])).rejects.toThrow(
        "Name must be 1 to 40 characters, without control characters",
      );
    }
    expect(await db.admin("select display_name from app.profiles where id = $1", [alice])).toEqual([{ display_name: "Lea Martins" }]);
  });

  it("the file stops with nothing changed when a stored name breaks the new rules", async () => {
    const dir = join(__dirname, "..", "..", "supabase", "migrations");
    const files = readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();
    const hardening = files.find((name) => name.endsWith("_sharing_hardening.sql"))!;
    const fresh = new PGlite();
    try {
      await fresh.exec(readFileSync(join(__dirname, "supabase-shim.sql"), "utf8"));
      for (const name of files.filter((n) => n < hardening)) await fresh.exec(readFileSync(join(dir, name), "utf8"));
      await fresh.query("insert into auth.users (email) values ('emma@example.com')");
      // Allowed before this file: only an emoji.
      await fresh.query("update app.profiles set display_name = '😀'");
      await expect(fresh.exec(readFileSync(join(dir, hardening), "utf8"))).rejects.toThrow(/breaks the new rules/);
      // The file's own transaction is left aborted, as in any SQL editor; ending it undoes everything.
      await fresh.exec("rollback");
      // Nothing of the file stayed: the old rule and no new table.
      expect((await fresh.query("select app.display_name_valid('😀') as ok")).rows).toEqual([{ ok: true }]);
      expect((await fresh.query("select to_regclass('app.list_leaves') as t")).rows).toEqual([{ t: null }]);
    } finally {
      await fresh.close();
    }
  });
});

// Spec 34: add_list_member and leave_list are closed (20261209000000_lists_closed.sql); the rest keep their rights.
const CALLABLE = ["display_name_valid", "invite_contact", "list_text_valid"];
const CLOSED = ["add_list_member", "leave_list"];
const INTERNAL = ["lock_usable_list"];

describe("rights on the replaced functions and the new table", () => {
  it("keep their signatures, security definer, empty search path and rights; the list functions are closed", async () => {
    const rows = await db.admin<{ name: string; args: string; result: string; definer: boolean; config: string[] | null; anon: boolean; user: boolean }>(
      `select p.proname as name, pg_get_function_identity_arguments(p.oid) as args, pg_get_function_result(p.oid) as result,
              p.prosecdef as definer, p.proconfig as config,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as user
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'app' and p.proname = any ($1::text[])
        order by 1`,
      [[...CALLABLE, ...CLOSED, ...INTERNAL]],
    );
    expect(rows.map(({ name, args, result, definer }) => ({ name, args, result, definer }))).toEqual([
      { name: "add_list_member", args: "p_list uuid, p_contact uuid", result: "uuid", definer: true },
      { name: "display_name_valid", args: "p_name text", result: "boolean", definer: false },
      { name: "invite_contact", args: "p_email text", result: "void", definer: true },
      { name: "leave_list", args: "p_list uuid", result: "void", definer: true },
      { name: "list_text_valid", args: "p_text text, p_max integer", result: "boolean", definer: false },
      { name: "lock_usable_list", args: "p_list uuid", result: "uuid", definer: true },
    ]);
    for (const row of rows) {
      expect(row.config, row.name).toContain('search_path=""');
      expect(row.anon, row.name).toBe(false);
      expect(row.user, row.name).toBe(CALLABLE.includes(row.name));
    }
  });

  it("app.list_leaves has row-level security and no rights for users", async () => {
    expect(await db.admin("select relrowsecurity as rls from pg_class where oid = 'app.list_leaves'::regclass")).toEqual([{ rls: true }]);
    expect(
      await db.admin(
        `select privilege_type from information_schema.role_table_grants
          where table_schema = 'app' and table_name = 'list_leaves' and grantee in ('anon', 'authenticated', 'PUBLIC')`,
      ),
    ).toEqual([]);
  });
});
