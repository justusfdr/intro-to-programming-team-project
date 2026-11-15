// Tests for supabase/migrations/*_shared_lists.sql (spec 30, R52 to R57): a list belongs to its owner,
// who shares it with contacts only, through the contact row (removing the contact ends the membership at
// once); members and the owner write entries only through the functions; only the owner renames or
// deletes the list and manages members; nobody else sees anything ("Not found"); inside a list people
// see each other's name and photo but no address; limits; R4's updated_at; deleting an account.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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
  alice = await db.createUser("alice@example.com", { confirmed: true });
  bob = await db.createUser("bob@example.com", { confirmed: true });
  carol = await db.createUser("carol@example.com", { confirmed: true });
  dave = await db.createUser("dave@example.com", { confirmed: true });
});

const as = <T extends Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) =>
  db.withUser(user, (q) => q<T>(sql, params));

const NOT_FOUND = "Not found";
const OWNER_ONLY = "Only the owner of this list can do this";
const CHANGED = "Changed by someone else. Reload to see the latest version";

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
const addItem = async (user: string, list: string, title: string) =>
  (await as<{ id: string }>(user, "select app.add_list_item($1::uuid, $2) as id", [list, title]))[0].id;
const versionOf = async (item: string) =>
  ((await db.admin<{ v: string }>("select to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') as v from app.list_items where id = $1", [item]))[0]).v;
const listVersion = async (list: string) =>
  ((await db.admin<{ v: string }>("select to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') as v from app.lists where id = $1", [list]))[0]).v;
const tick = async (user: string, item: string, done: boolean, version?: string) =>
  as(user, "select app.tick_list_item($1::uuid, $2::boolean, $3::timestamptz)", [item, done, version ?? (await versionOf(item))]);
const rename = async (user: string, item: string, title: string, version?: string) =>
  as(user, "select app.rename_list_item($1::uuid, $2, $3::timestamptz)", [item, title, version ?? (await versionOf(item))]);
const move = async (user: string, item: string, to: number) =>
  as(user, "select app.move_list_item($1::uuid, $2::integer, $3::timestamptz)", [item, to, await versionOf(item)]);
const remove = async (user: string, item: string, version?: string) =>
  as(user, "select app.delete_list_item($1::uuid, $2::timestamptz)", [item, version ?? (await versionOf(item))]);
const titles = (user: string, list: string) =>
  as<{ title: string; position: number }>(user, "select title, position from app.list_items where list_id = $1 order by position", [list]);
const people = (user: string, list: string) =>
  as<{ user_id: string; is_owner: boolean; display_name: string | null; fallback_name: string | null }>(
    user,
    "select user_id, is_owner, display_name, fallback_name from app.list_people($1::uuid)",
    [list],
  );
const everything = () =>
  Promise.all(["lists", "list_members", "list_items"].map((t) => db.admin(`select * from app.${t} order by 1`)));

/** Alice owns "Flat shopping" with Bob as a member (Bob is Alice's contact). */
async function flat(): Promise<{ list: string; aliceBob: string }> {
  const aliceBob = await connect(alice, bob, "bob@example.com");
  const list = await createList(alice, "Flat shopping");
  await addMember(alice, list, aliceBob);
  return { list, aliceBob };
}

describe("R52 a list: owner, title, at most 20", () => {
  it("creates a list of the user's own that works alone, as a personal checklist", async () => {
    const list = await createList(alice, "Flat shopping");
    expect(await as(alice, "select title, owner from app.lists")).toEqual([{ title: "Flat shopping", owner: alice }]);
    const item = await addItem(alice, list, "Milk");
    await tick(alice, item, true);
    expect(await as(alice, "select title, done, added_by, done_by from app.list_items")).toEqual([
      { title: "Milk", done: true, added_by: alice, done_by: alice },
    ]);
  });

  it("refuses an empty title, 61 characters, spaces at the ends and control characters; nothing changes", async () => {
    await createList(alice, "A");
    const before = await everything();
    for (const bad of ["", " Groceries", "Groceries ", "a".repeat(61), "Gro\u0007ceries", "‮ecilA"]) {
      await expect(createList(alice, bad)).rejects.toThrow("A list needs a title of 1 to 60 characters");
    }
    expect(await everything()).toEqual(before);
    await createList(alice, "é".repeat(60));
  });

  it("allows 20 lists per owner and refuses the 21st", async () => {
    for (let i = 1; i <= 20; i += 1) await createList(alice, `List ${i}`);
    const before = await everything();
    await expect(createList(alice, "List 21")).rejects.toThrow("You can have at most 20 lists");
    expect(await everything()).toEqual(before);
    // Another user's limit is their own.
    await createList(bob, "Bob's list");
  });

  it("cannot be written directly by anyone: no insert, update or delete right on the three tables", async () => {
    const { list } = await flat();
    const item = await addItem(bob, list, "Milk");
    for (const user of [alice, bob]) {
      await expect(as(user, "insert into app.lists (owner, title) values ($1, 'X')", [user])).rejects.toThrow(/permission denied/);
      await expect(as(user, "update app.lists set title = 'X'")).rejects.toThrow(/permission denied/);
      await expect(as(user, "delete from app.lists")).rejects.toThrow(/permission denied/);
      await expect(as(user, "insert into app.list_members (list_id, user_id, contact_id) select $1, $2, id from app.contacts", [list, carol])).rejects.toThrow(/permission denied/);
      await expect(as(user, "delete from app.list_members")).rejects.toThrow(/permission denied/);
      await expect(as(user, "insert into app.list_items (list_id, title, position) values ($1, 'X', 5)", [list])).rejects.toThrow(/permission denied/);
      await expect(as(user, "update app.list_items set added_by = $1, done_by = $1, list_id = $2", [carol, list])).rejects.toThrow(/permission denied/);
      await expect(as(user, "delete from app.list_items where id = $1", [item])).rejects.toThrow(/permission denied/);
    }
    // The contact row behind a membership is not readable through the table.
    await expect(as(alice, "select contact_id from app.list_members")).rejects.toThrow(/permission denied/);
  });

  it("refuses everything without a signed-in user", async () => {
    const list = await createList(alice, "Flat shopping");
    await expect(db.withUser("00000000-0000-4000-8000-000000000000", (q) => q("select app.add_list_item($1::uuid, 'X')", [list]))).rejects.toThrow(NOT_FOUND);
    // Without auth.uid() at all.
    await expect(db.admin("select app.create_list('X')")).rejects.toThrow("not signed in");
    await expect(db.admin("select app.add_list_item($1::uuid, 'X')", [list])).rejects.toThrow("not signed in");
  });

  it("keeps the checks in the table itself, also for the database owner", async () => {
    const list = await createList(alice, "Flat shopping");
    await expect(db.admin("update app.lists set title = '' where id = $1", [list])).rejects.toThrow(/lists_title/);
    await expect(db.admin("insert into app.list_items (list_id, title, position) values ($1, $2, 0)", [list, "x".repeat(201)])).rejects.toThrow(/list_items_title/);
    await expect(db.admin("insert into app.list_items (list_id, title, position) values ($1, 'x', 200)", [list])).rejects.toThrow(/list_items_position/);
    await expect(db.admin("insert into app.list_items (list_id, title, position, done_by) values ($1, 'x', 0, $2)", [list, alice])).rejects.toThrow(/list_items_done_by/);
  });
});

describe("R53 members: contacts of the owner, through their contact row", () => {
  it("the owner adds a contact; the list appears for them at once, with its entries and members", async () => {
    const { list } = await flat();
    await addItem(alice, list, "Milk");
    expect(await as(bob, "select id, title, owner from app.lists")).toEqual([{ id: list, title: "Flat shopping", owner: alice }]);
    expect(await titles(bob, list)).toEqual([{ title: "Milk", position: 0 }]);
    expect(await as(bob, "select user_id from app.list_members")).toEqual([{ user_id: bob }]);
    // Adding someone twice changes nothing.
    const before = await everything();
    await addMember(alice, list, (await db.admin<{ id: string }>("select contact_id as id from app.list_members"))[0].id);
    expect(await everything()).toEqual(before);
  });

  it("refuses someone who is not the owner's contact, and any contact row the owner is not part of", async () => {
    const aliceBob = await connect(alice, bob, "bob@example.com");
    const bobCarol = await connect(bob, carol, "carol@example.com");
    const list = await createList(alice, "Flat shopping");
    const before = await everything();
    // Bob's contact row with Carol: Alice is not part of it.
    await expect(addMember(alice, list, bobCarol)).rejects.toThrow(NOT_FOUND);
    // A made-up row id, and a user id instead of a contact row.
    await expect(addMember(alice, list, "00000000-0000-4000-8000-000000000000")).rejects.toThrow(NOT_FOUND);
    await expect(addMember(alice, list, carol)).rejects.toThrow(NOT_FOUND);
    expect(await everything()).toEqual(before);
    // Bob cannot add Carol to Alice's list through his own contact row either (he is not even a member).
    await expect(addMember(bob, list, bobCarol)).rejects.toThrow(NOT_FOUND);
    await addMember(alice, list, aliceBob);
    // As a member he still cannot manage members.
    await expect(addMember(bob, list, bobCarol)).rejects.toThrow(OWNER_ONLY);
    expect(await as(alice, "select user_id from app.list_members")).toEqual([{ user_id: bob }]);
  });

  it("allows 20 members besides the owner and refuses the 21st", async () => {
    const list = await createList(alice, "Party");
    const contactRows: string[] = [];
    for (let i = 1; i <= 21; i += 1) {
      const user = await db.createUser(`friend${i}@example.com`, { confirmed: true });
      // Written directly (the invitation limit of 10 per hour is not what this test is about).
      const [row] = await db.admin<{ id: string }>(
        "insert into app.contacts (user_a, user_b) values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid)) returning id",
        [alice, user],
      );
      contactRows.push(row.id);
    }
    for (const row of contactRows.slice(0, 20)) await addMember(alice, list, row);
    const before = await everything();
    await expect(addMember(alice, list, contactRows[20])).rejects.toThrow("A list can have at most 20 members");
    expect(await everything()).toEqual(before);
  });

  it("removing the contact (either side) removes the membership and every access at once", async () => {
    const { list, aliceBob } = await flat();
    const item = await addItem(bob, list, "Milk");
    const version = await versionOf(item);
    await as(bob, "select app.remove_contact($1::uuid)", [aliceBob]);
    expect(await db.admin("select * from app.list_members")).toEqual([]);
    expect(await as(bob, "select id from app.lists")).toEqual([]);
    expect(await titles(bob, list)).toEqual([]);
    expect(await people(bob, list)).toEqual([]);
    await expect(as(bob, "select app.add_list_item($1::uuid, 'Eggs')", [list])).rejects.toThrow(NOT_FOUND);
    await expect(tick(bob, item, true, version)).rejects.toThrow(NOT_FOUND);
    // The entry he added stays, still marked as his (he is just no longer in the list).
    expect(await titles(alice, list)).toEqual([{ title: "Milk", position: 0 }]);
  });

  it("the owner removes a member; only the owner may, and only a member can be removed", async () => {
    const { list } = await flat();
    const carolRow = await connect(alice, carol, "carol@example.com");
    await addMember(alice, list, carolRow);
    await expect(as(bob, "select app.remove_list_member($1::uuid, $2::uuid)", [list, carol])).rejects.toThrow(OWNER_ONLY);
    await expect(as(alice, "select app.remove_list_member($1::uuid, $2::uuid)", [list, dave])).rejects.toThrow(NOT_FOUND);
    await as(alice, "select app.remove_list_member($1::uuid, $2::uuid)", [list, carol]);
    expect(await as(carol, "select id from app.lists")).toEqual([]);
    expect(await as(alice, "select user_id from app.list_members")).toEqual([{ user_id: bob }]);
  });

  it("a member leaves by themselves and then reads and writes nothing; the owner cannot leave", async () => {
    const { list } = await flat();
    const item = await addItem(alice, list, "Milk");
    await expect(as(alice, "select app.leave_list($1::uuid)", [list])).rejects.toThrow("The owner cannot leave a list. Delete it instead");
    await expect(as(carol, "select app.leave_list($1::uuid)", [list])).rejects.toThrow(NOT_FOUND);
    await as(bob, "select app.leave_list($1::uuid)", [list]);
    expect(await as(bob, "select id from app.lists")).toEqual([]);
    expect(await as(bob, "select id from app.list_items")).toEqual([]);
    expect(await as(bob, "select id from app.list_members")).toEqual([]);
    await expect(tick(bob, item, true)).rejects.toThrow(NOT_FOUND);
    await expect(as(bob, "select app.leave_list($1::uuid)", [list])).rejects.toThrow(NOT_FOUND);
    // Still Alice's contact: she sees him as before; the list is hers alone again.
    expect(await as(alice, "select user_id from app.list_members")).toEqual([]);
  });
});

describe("R54 entries: everyone of the list adds, renames, ticks, moves and deletes", () => {
  it("a member does all of it; the entry remembers who added and who ticked it", async () => {
    const { list } = await flat();
    const milk = await addItem(alice, list, "Milk");
    const eggs = await addItem(bob, list, "Eggs");
    const bread = await addItem(bob, list, "Bread");
    await tick(bob, milk, true);
    expect(await as(alice, "select title, added_by, done, done_by from app.list_items order by position")).toEqual([
      { title: "Milk", added_by: alice, done: true, done_by: bob },
      { title: "Eggs", added_by: bob, done: false, done_by: null },
      { title: "Bread", added_by: bob, done: false, done_by: null },
    ]);
    await tick(alice, milk, false);
    expect((await as<{ done_by: string | null }>(bob, "select done_by from app.list_items where id = $1", [milk]))[0].done_by).toBeNull();
    await rename(bob, milk, "Oat milk");
    await move(bob, bread, 0);
    expect(await titles(alice, list)).toEqual([
      { title: "Bread", position: 0 },
      { title: "Oat milk", position: 1 },
      { title: "Eggs", position: 2 },
    ]);
    await move(alice, bread, 99);
    expect((await titles(alice, list)).map((t) => t.title)).toEqual(["Oat milk", "Eggs", "Bread"]);
    await remove(bob, milk);
    expect(await titles(alice, list)).toEqual([
      { title: "Eggs", position: 0 },
      { title: "Bread", position: 1 },
    ]);
    void eggs;
  });

  it("refuses a bad title and the 201st entry; nothing changes", async () => {
    const list = await createList(alice, "Big");
    const item = await addItem(alice, list, "x".repeat(200));
    const before = await everything();
    for (const bad of ["", " x", "x ", "x".repeat(201), "a\u0001b"]) {
      await expect(addItem(alice, list, bad)).rejects.toThrow("An entry needs a title of 1 to 200 characters");
      await expect(rename(alice, item, bad)).rejects.toThrow("An entry needs a title of 1 to 200 characters");
    }
    expect(await everything()).toEqual(before);
    await db.admin(
      "insert into app.list_items (list_id, title, position, added_by) select $1, 'n' || g, g, $2 from generate_series(1, 199) g",
      [list, alice],
    );
    const full = await everything();
    await expect(addItem(alice, list, "One too many")).rejects.toThrow("A list can have at most 200 entries");
    expect(await everything()).toEqual(full);
  });

  it("R4: a change carrying an older updated_at is refused with nothing changed", async () => {
    const { list } = await flat();
    const milk = await addItem(alice, list, "Milk");
    const seen = await versionOf(milk);
    await tick(bob, milk, true, seen);
    const before = await everything();
    await expect(rename(alice, milk, "Oat milk", seen)).rejects.toThrow(CHANGED);
    await expect(tick(alice, milk, false, seen)).rejects.toThrow(CHANGED);
    await expect(remove(alice, milk, seen)).rejects.toThrow(CHANGED);
    await expect(as(alice, "select app.move_list_item($1::uuid, 0, $2::timestamptz)", [milk, seen])).rejects.toThrow(CHANGED);
    await expect(as(alice, "select app.tick_list_item($1::uuid, true, null)", [milk])).rejects.toThrow(CHANGED);
    expect(await everything()).toEqual(before);
    // With the new version it goes through.
    await rename(alice, milk, "Oat milk");
    // Entries closing up around a deleted one keep their version (nobody changed them).
    const eggs = await addItem(alice, list, "Eggs");
    const eggsSeen = await versionOf(eggs);
    await remove(alice, milk);
    expect(await versionOf(eggs)).toBe(eggsSeen);
  });

  it("a third user changes nothing: every entry function answers Not found", async () => {
    const { list } = await flat();
    const milk = await addItem(alice, list, "Milk");
    const version = await versionOf(milk);
    const before = await everything();
    await expect(addItem(carol, list, "Eggs")).rejects.toThrow(NOT_FOUND);
    await expect(rename(carol, milk, "Oat milk", version)).rejects.toThrow(NOT_FOUND);
    await expect(tick(carol, milk, true, version)).rejects.toThrow(NOT_FOUND);
    await expect(as(carol, "select app.move_list_item($1::uuid, 0, $2::timestamptz)", [milk, version])).rejects.toThrow(NOT_FOUND);
    await expect(remove(carol, milk, version)).rejects.toThrow(NOT_FOUND);
    expect(await everything()).toEqual(before);
  });
});

describe("R55 who sees what", () => {
  it("a third user sees no list, no entry, no member and no people; a foreign, missing or malformed id is the same Not found", async () => {
    const { list } = await flat();
    await addItem(alice, list, "Milk");
    expect(await as(carol, "select id from app.lists")).toEqual([]);
    expect(await as(carol, "select id from app.list_items")).toEqual([]);
    expect(await as(carol, "select id from app.list_members")).toEqual([]);
    expect(await people(carol, list)).toEqual([]);
    expect(await as(carol, "select app.can_use_list($1::uuid) as ok", [list])).toEqual([{ ok: false }]);
    for (const id of [list, "00000000-0000-4000-8000-000000000000"]) {
      await expect(as(carol, "select app.rename_list($1::uuid, 'X', now())", [id])).rejects.toThrow(NOT_FOUND);
      await expect(as(carol, "select app.delete_list($1::uuid)", [id])).rejects.toThrow(NOT_FOUND);
      await expect(as(carol, "select app.leave_list($1::uuid)", [id])).rejects.toThrow(NOT_FOUND);
    }
    await expect(as(carol, "select app.delete_list($1::uuid)", ["not-a-uuid"])).rejects.toThrow(/invalid input syntax for type uuid/);
  });

  it("inside a list everyone sees the others' display name and photo, never an address of a non-contact", async () => {
    const { list } = await flat();
    const carolRow = await connect(alice, carol, "carol@example.com");
    await addMember(alice, list, carolRow);
    await as(carol, "select app.set_display_name('Carol Dias')");
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 7)]).toString("base64");
    await as(carol, "select app.set_profile_photo($1)", [jpeg]);
    await as(bob, "select app.set_profile_photo($1)", [jpeg]);
    // Bob and Carol are not contacts: each sees the other's name and photo, no address.
    expect(await people(bob, list)).toEqual([
      { user_id: alice, is_owner: true, display_name: null, fallback_name: "alice" },
      { user_id: bob, is_owner: false, display_name: null, fallback_name: "bob" },
      { user_id: carol, is_owner: false, display_name: "Carol Dias", fallback_name: null },
    ]);
    expect((await people(carol, list))[1]).toEqual({ user_id: bob, is_owner: false, display_name: null, fallback_name: null });
    expect(await as(bob, "select mime from app.profile_photo($1::uuid)", [carol])).toEqual([{ mime: "image/jpeg" }]);
    expect(await as(carol, "select mime from app.profile_photo($1::uuid)", [bob])).toEqual([{ mime: "image/jpeg" }]);
    // Not a column anywhere: the function's columns have no address.
    const columns = await db.admin<{ name: string }>(
      "select unnest(proargnames) as name from pg_proc where proname = 'list_people'",
    );
    expect(columns.map((c) => c.name)).not.toContain("email");
    // Dave shares nothing with them: no photo.
    expect(await as(dave, "select mime from app.profile_photo($1::uuid)", [carol])).toEqual([]);
    // After Carol leaves, Bob no longer sees her photo (they are not contacts).
    await as(carol, "select app.leave_list($1::uuid)", [list]);
    expect(await as(bob, "select mime from app.profile_photo($1::uuid)", [carol])).toEqual([]);
    expect(await as(carol, "select mime from app.profile_photo($1::uuid)", [bob])).toEqual([]);
  });

  it("may_see_profile keeps its old answers: contacts and open invitations still see, strangers still not", async () => {
    await connect(alice, bob, "bob@example.com");
    await as(carol, "select app.invite_contact('dave@example.com')");
    const see = async (viewer: string, owner: string) =>
      (await db.admin<{ ok: boolean }>("select app.may_see_profile($1::uuid, $2::uuid) as ok", [viewer, owner]))[0].ok;
    expect(await see(alice, alice)).toBe(true);
    expect(await see(alice, bob)).toBe(true);
    expect(await see(dave, carol)).toBe(true);
    expect(await see(carol, dave)).toBe(false);
    expect(await see(alice, carol)).toBe(false);
    // The users themselves still cannot call it.
    await expect(as(alice, "select app.may_see_profile($1::uuid, $2::uuid)", [alice, bob])).rejects.toThrow(/permission denied/);
  });
});

describe("only the owner renames and deletes the list", () => {
  it("the owner renames with the version the screen saw; a member, a stranger and an old version are refused", async () => {
    const { list } = await flat();
    const seen = await listVersion(list);
    await expect(as(bob, "select app.rename_list($1::uuid, 'Ours', $2::timestamptz)", [list, seen])).rejects.toThrow(OWNER_ONLY);
    await expect(as(alice, "select app.rename_list($1::uuid, '', $2::timestamptz)", [list, seen])).rejects.toThrow("A list needs a title of 1 to 60 characters");
    await as(alice, "select app.rename_list($1::uuid, 'Flat 2B', $2::timestamptz)", [list, seen]);
    expect(await as(bob, "select title from app.lists")).toEqual([{ title: "Flat 2B" }]);
    await expect(as(alice, "select app.rename_list($1::uuid, 'Again', $2::timestamptz)", [list, seen])).rejects.toThrow(CHANGED);
  });

  it("the owner deletes the list with its members and entries; a member cannot", async () => {
    const { list } = await flat();
    await addItem(bob, list, "Milk");
    await expect(as(bob, "select app.delete_list($1::uuid)", [list])).rejects.toThrow(OWNER_ONLY);
    await as(alice, "select app.delete_list($1::uuid)", [list]);
    const [lists, members, items] = await everything();
    expect([lists, members, items]).toEqual([[], [], []]);
  });
});

describe("R56 deleting an account", () => {
  it("deletes the lists the account owns and takes it out of the others; its entries there stay, without a name", async () => {
    const { list } = await flat();
    const bobsOwn = await createList(bob, "Bob's own");
    await addMember(bob, bobsOwn, (await db.admin<{ id: string }>("select contact_id as id from app.list_members"))[0].id);
    const milk = await addItem(bob, list, "Milk");
    await tick(bob, milk, true);
    await as(bob, "select app.delete_account()");
    expect(await as(alice, "select id from app.lists")).toEqual([{ id: list }]);
    expect(await as(alice, "select user_id from app.list_members")).toEqual([]);
    expect(await as(alice, "select title, added_by, done, done_by from app.list_items")).toEqual([
      { title: "Milk", added_by: null, done: true, done_by: null },
    ]);
    expect(await db.admin("select id from app.lists where id = $1", [bobsOwn])).toEqual([]);
  });
});

const CALLABLE = [
  "add_list_item", "add_list_member", "can_use_list", "create_list", "delete_list", "delete_list_item", "leave_list",
  "list_people", "list_text_valid", "move_list_item", "remove_list_member", "rename_list", "rename_list_item", "tick_list_item",
];
const INTERNAL = ["lock_list_item", "lock_own_list", "lock_usable_list", "may_see_profile", "next_list_version", "renumber_list_items"];

describe("rights on the functions", () => {
  it("every function is security definer with an empty search path; users may call only the actions", async () => {
    const rows = await db.admin<{ name: string; definer: boolean; config: string[] | null; anon: boolean; user: boolean }>(
      `select p.proname as name, p.prosecdef as definer, p.proconfig as config,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as user
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'app' and p.proname = any ($1::text[])
        order by 1`,
      [[...CALLABLE, ...INTERNAL]],
    );
    const callable = CALLABLE;
    for (const row of rows) {
      expect(row.config, row.name).toContain("search_path=\"\"");
      expect(row.anon, row.name).toBe(false);
      expect(row.user, row.name).toBe(callable.includes(row.name));
      if (!["list_text_valid", "next_list_version"].includes(row.name)) expect(row.definer, row.name).toBe(true);
    }
    expect(rows.map((r) => r.name).sort()).toEqual([...CALLABLE, ...INTERNAL].sort());
  });
});
