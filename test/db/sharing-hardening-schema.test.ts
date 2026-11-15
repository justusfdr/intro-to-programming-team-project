// Tests for supabase/migrations/*_sharing_hardening.sql (security review of sharing, specs 28 and 30):
// 1. invite_contact does the same work whether or not an address has an account;
// 2. an address of an account the sender already has a row for gets a row only the sender sees;
// 3. names and titles refuse blank-looking and invisible characters and stacks of combining marks, and a
//    display name needs a letter or digit (the same table as the TypeScript side);
// 4. a stranger never takes the lock of a list;
// 7. a member who left a list cannot be added to it again for 30 days, and nobody is a member of more
//    than 50 lists of other people.
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
let carol: string;
let dave: string;

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
  carol = await db.createUser("carol@example.com", { confirmed: true });
  dave = await db.createUser("dave@example.com", { confirmed: true });
});

const as = <T extends Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) =>
  db.withUser(user, (q) => q<T>(sql, params));

const NOT_FOUND = "Not found";
const LEFT = "This person left the list";
const FULL = "This person cannot join more lists";

/** Makes two users contacts the way the app does (invite, accept); returns the contact row's id. */
async function connect(a: string, b: string, bEmail: string): Promise<string> {
  await as(a, "select app.invite_contact($1)", [bEmail]);
  const [invitation] = await as<{ id: string }>(b, "select id from app.contact_cards() where kind = 'received'");
  await as(b, "select app.answer_invitation($1::uuid, true)", [invitation.id]);
  const [row] = await db.admin<{ id: string }>(
    "select id from app.contacts where user_a = least($1::uuid, $2::uuid) and user_b = greatest($1::uuid, $2::uuid)",
    [a, b],
  );
  return row.id;
}

const createList = async (user: string, title: string) =>
  (await as<{ id: string }>(user, "select app.create_list($1) as id", [title]))[0].id;
const addMember = (user: string, list: string, contact: string) =>
  as(user, "select app.add_list_member($1::uuid, $2::uuid)", [list, contact]);
const leave = (user: string, list: string) => as(user, "select app.leave_list($1::uuid)", [list]);
const members = async (list: string) =>
  (await db.admin<{ user_id: string }>("select user_id from app.list_members where list_id = $1 order by user_id", [list])).map((r) => r.user_id);
const leaves = () => db.admin("select list_id, user_id from app.list_leaves order by list_id, user_id");
const everything = () =>
  Promise.all(["lists", "list_members", "list_items", "list_leaves", "profiles"].map((t) => db.admin(`select * from app.${t} order by 1`)));
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

  it("lists and entries refuse invisible characters but take an entry of one emoji", async () => {
    const list = await createList(alice, "Flat shopping");
    await as(alice, "select app.add_list_item($1::uuid, $2)", [list, "🛒"]);
    await expect(as(alice, "select app.add_list_item($1::uuid, $2)", [list, "Milk⠀"])).rejects.toThrow(
      "An entry needs a title of 1 to 200 characters",
    );
    await expect(as(alice, "select app.create_list($1)", ["Trip\u{e0041}"])).rejects.toThrow("A list needs a title of 1 to 60 characters");
    expect(await db.admin("select title from app.list_items")).toEqual([{ title: "🛒" }]);
    expect(await db.admin("select title from app.lists")).toEqual([{ title: "Flat shopping" }]);
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

describe("a stranger never takes the lock of a list (fix 4)", () => {
  /** The transaction that last locked or changed the list row; a lock taken by anyone changes it. */
  const lastLocker = async (list: string) =>
    (await db.admin<{ x: string }>("select xmax::text as x from app.lists where id = $1", [list]))[0].x;

  it("a stranger gets Not found without locking; the owner and a member still lock it", async () => {
    const aliceBob = await connect(alice, bob, "bob@example.com");
    const list = await createList(alice, "Flat shopping");
    await addMember(alice, list, aliceBob);
    const before = await lastLocker(list);
    for (const call of [
      "select app.add_list_item($1::uuid, 'Milk')",
      "select app.leave_list($1::uuid)",
      "select app.delete_list($1::uuid)",
    ]) {
      await expect(as(carol, call, [list])).rejects.toThrow(NOT_FOUND);
    }
    expect(await lastLocker(list)).toBe(before);
    expect(await db.admin("select title from app.list_items")).toEqual([]);

    await as(bob, "select app.add_list_item($1::uuid, 'Milk')", [list]);
    const afterMember = await lastLocker(list);
    expect(afterMember).not.toBe(before);
    expect(await db.admin("select title from app.list_items")).toEqual([{ title: "Milk" }]);
  });

  it("a member removed before the lock is free gets Not found after it", async () => {
    const aliceBob = await connect(alice, bob, "bob@example.com");
    const list = await createList(alice, "Flat shopping");
    await addMember(alice, list, aliceBob);
    await as(alice, "select app.remove_list_member($1::uuid, $2::uuid)", [list, bob]);
    await expect(as(bob, "select app.add_list_item($1::uuid, 'Milk')", [list])).rejects.toThrow(NOT_FOUND);
  });
});

describe("leaving a list and joining many (fix 7, R53)", () => {
  async function flat() {
    const aliceBob = await connect(alice, bob, "bob@example.com");
    const list = await createList(alice, "Flat shopping");
    await addMember(alice, list, aliceBob);
    return { aliceBob, list };
  }

  it("the owner cannot add someone who left by themselves for 30 days, and nothing changes", async () => {
    const { aliceBob, list } = await flat();
    await leave(bob, list);
    expect(await leaves()).toEqual([{ list_id: list, user_id: bob }]);
    const before = await everything();
    await expect(addMember(alice, list, aliceBob)).rejects.toThrow(LEFT);
    expect(await everything()).toEqual(before);
    // Another list of Alice's is fine.
    const trip = await createList(alice, "Trip");
    await addMember(alice, trip, aliceBob);
    expect(await members(trip)).toEqual([bob]);
  });

  it("after 30 days the owner can add them again, and the leave is gone", async () => {
    const { aliceBob, list } = await flat();
    await leave(bob, list);
    await db.admin("update app.list_leaves set until = now() - interval '1 second'");
    await addMember(alice, list, aliceBob);
    expect(await members(list)).toEqual([bob]);
    expect(await leaves()).toEqual([]);
  });

  it("someone the owner removed (not left) can be added again at once", async () => {
    const { aliceBob, list } = await flat();
    await as(alice, "select app.remove_list_member($1::uuid, $2::uuid)", [list, bob]);
    expect(await leaves()).toEqual([]);
    await addMember(alice, list, aliceBob);
    expect(await members(list)).toEqual([bob]);
  });

  it("a leave goes with the list, with the contact row and with either account", async () => {
    const { aliceBob, list } = await flat();
    await leave(bob, list);
    await as(alice, "select app.delete_list($1::uuid)", [list]);
    expect(await leaves()).toEqual([]);

    const second = await createList(alice, "Trip");
    await addMember(alice, second, aliceBob);
    await leave(bob, second);
    await as(alice, "select app.remove_contact($1::uuid)", [aliceBob]);
    expect(await leaves()).toEqual([]);
    // Contacts again: a new contact row, so the owner can add Bob at once.
    const again = await connect(alice, bob, "bob@example.com");
    await addMember(alice, second, again);
    expect(await members(second)).toEqual([bob]);

    await leave(bob, second);
    expect(await leaves()).toEqual([{ list_id: second, user_id: bob }]);
    await as(bob, "select app.delete_account()");
    expect(await leaves()).toEqual([]);
  });

  it("nobody reads or writes the leaves table directly", async () => {
    const { list } = await flat();
    await leave(bob, list);
    for (const user of [alice, bob]) {
      await expect(as(user, "select * from app.list_leaves")).rejects.toThrow(/permission denied/);
      await expect(as(user, "delete from app.list_leaves")).rejects.toThrow(/permission denied/);
    }
    expect(await leaves()).toEqual([{ list_id: list, user_id: bob }]);
  });

  it("one user is a member of at most 50 lists of other people", async () => {
    const contactOf = new Map<string, string>([
      [alice, await connect(alice, bob, "bob@example.com")],
      [carol, await connect(carol, bob, "bob@example.com")],
      [dave, await connect(dave, bob, "bob@example.com")],
    ]);
    // 20 + 20 + 10 = 50 lists of three owners (an owner has at most 20).
    const plan: [string, number][] = [[alice, 20], [carol, 20], [dave, 10]];
    const added: string[] = [];
    for (const [owner, count] of plan) {
      for (let i = 0; i < count; i += 1) {
        const list = await createList(owner, `List ${i}`);
        await addMember(owner, list, contactOf.get(owner)!);
        added.push(list);
      }
    }
    expect(Number((await db.admin<{ n: string }>("select count(*)::text as n from app.list_members where user_id = $1", [bob]))[0].n)).toBe(50);
    // Adding again to one of the 50 still changes nothing and is no error.
    await addMember(alice, added[0], contactOf.get(alice)!);
    const extra = await createList(dave, "One more");
    const before = await everything();
    await expect(addMember(dave, extra, contactOf.get(dave)!)).rejects.toThrow(FULL);
    expect(await everything()).toEqual(before);
    // Bob leaves one list; then there is room again.
    await leave(bob, added[1]);
    await addMember(dave, extra, contactOf.get(dave)!);
    expect(await members(extra)).toEqual([bob]);
  });
});

const CALLABLE = ["add_list_member", "display_name_valid", "invite_contact", "leave_list", "list_text_valid"];
const INTERNAL = ["lock_usable_list"];

describe("rights on the replaced functions and the new table", () => {
  it("keep their signatures, security definer, empty search path and rights", async () => {
    const rows = await db.admin<{ name: string; args: string; result: string; definer: boolean; config: string[] | null; anon: boolean; user: boolean }>(
      `select p.proname as name, pg_get_function_identity_arguments(p.oid) as args, pg_get_function_result(p.oid) as result,
              p.prosecdef as definer, p.proconfig as config,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as user
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'app' and p.proname = any ($1::text[])
        order by 1`,
      [[...CALLABLE, ...INTERNAL]],
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
