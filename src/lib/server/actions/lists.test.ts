// Tests for the actions of spec 30 (shared lists, R52 to R57) with the temporary database: each action
// accepted and rejected, a rejection changes nothing (R1), foreign, missing and malformed ids all get
// the same "Not found" (R55), answers carry only the allowed fields and never another member's e-mail
// address, removing the contact ends the access at once, and the coach is never sent a list (R57).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { sendMessage } from "./send-message";
import {
  addListEntry,
  addListMember,
  createList,
  deleteList,
  deleteListEntry,
  leaveList,
  moveListEntry,
  removeListMember,
  renameList,
  renameListEntry,
  tickListEntry,
} from "./lists";

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.reset();
  vi.restoreAllMocks();
});

const CROSS_SITE = { origin: "https://evil.example", "sec-fetch-site": "cross-site" };
const NOT_FOUND = { status: 404, body: { error: "not_found", message: "Not found" } };
const OWNER_ONLY = { status: 403, body: { error: "owner_only", message: "Only the owner of this list can do this" } };
const CHANGED = { status: 409, body: { error: "changed_elsewhere", message: "Changed by someone else. Reload to see the latest version" } };
const MISSING = "00000000-0000-4000-8000-000000000000";
/** Every row of the app's tables (the session may change in between: tests sign in as other users). */
const rows = async () => (await app.snapshot()).tables;

type Body = Record<string, unknown>;
type List = { id: string; title: string; updatedAt: string; isOwner: boolean; people: Body[]; entries: { id: string; title: string; updatedAt: string; done: boolean }[] };

const create = (title: unknown, headers?: Record<string, string>) => createList(postJson("/api/lists", { title }, headers), app.deps);
const renameL = (id: string, body: unknown) => renameList(postJson(`/api/lists/${id}/rename`, body), app.deps, id);
const removeL = (id: string, headers?: Record<string, string>) => deleteList(postJson(`/api/lists/${id}/delete`, {}, headers), app.deps, id);
const addM = (id: string, contactId: unknown) => addListMember(postJson(`/api/lists/${id}/members/add`, { contactId }), app.deps, id);
const removeM = (id: string, userId: unknown) => removeListMember(postJson(`/api/lists/${id}/members/remove`, { userId }), app.deps, id);
const leave = (id: string) => leaveList(postJson(`/api/lists/${id}/leave`, {}), app.deps, id);
const addE = (id: string, title: unknown) => addListEntry(postJson(`/api/lists/${id}/entries`, { title }), app.deps, id);
const renameE = (id: string, body: unknown) => renameListEntry(postJson(`/api/list-entries/${id}/rename`, body), app.deps, id);
const tickE = (id: string, body: unknown) => tickListEntry(postJson(`/api/list-entries/${id}/done`, body), app.deps, id);
const moveE = (id: string, body: unknown) => moveListEntry(postJson(`/api/list-entries/${id}/move`, body), app.deps, id);
const deleteE = (id: string, body: unknown) => deleteListEntry(postJson(`/api/list-entries/${id}/delete`, body), app.deps, id);

/** The list of an accepted answer. */
async function listOf(response: Response): Promise<List> {
  const answer = await read(response);
  if (answer.status >= 300) throw new Error(`refused: ${JSON.stringify(answer)}`);
  return answer.body.list as List;
}

/** Makes two users contacts in the database; returns the contact row's id. */
async function connect(a: string, b: string, bEmail: string): Promise<string> {
  await app.db.withUser(a, (q) => q("select app.invite_contact($1)", [bEmail]));
  const [invitation] = await app.db.withUser(b, (q) => q<{ id: string }>("select id from app.contact_cards() where kind = 'received'"));
  await app.db.withUser(b, (q) => q("select app.answer_invitation($1::uuid, true)", [invitation.id]));
  const [row] = await app.db.admin<{ id: string }>(
    "select id from app.contacts where user_a = least($1::uuid, $2::uuid) and user_b = greatest($1::uuid, $2::uuid)",
    [a, b],
  );
  return row.id;
}

/** Alice owns "Flat shopping" with Bob (her contact) as a member; the session is Alice's. */
async function flat() {
  const carol = await app.signedInAs("carol@example.com");
  const bob = await app.signedInAs("bob@example.com");
  const alice = await app.signedInAs("alice@example.com");
  const aliceBob = await connect(alice, bob, "bob@example.com");
  const created = await read(await create("Flat shopping"));
  const id = created.body.id as string;
  await listOf(await addM(id, aliceBob));
  return { alice, bob, carol, aliceBob, id };
}

// The keys an answer may have, at every level (allow-list): nothing else, in particular no address.
const LIST_KEYS = ["entries", "id", "isOwner", "people", "title", "updatedAt"];
const PERSON_KEYS = ["isMe", "isOwner", "name", "photoUrl", "userId"];
const ENTRY_KEYS = ["addedBy", "done", "doneBy", "id", "position", "title", "updatedAt"];
function expectAllowedShape(body: Body) {
  expect(Object.keys(body).sort()).toEqual(["list", "message"]);
  const list = body.list as List;
  expect(Object.keys(list).sort()).toEqual(LIST_KEYS);
  for (const person of list.people) expect(Object.keys(person).sort()).toEqual(PERSON_KEYS);
  for (const entry of list.entries) expect(Object.keys(entry).sort()).toEqual(ENTRY_KEYS);
  expect(JSON.stringify(body)).not.toContain("@");
}

describe("create_list (R52)", () => {
  it("creates a list of the user's own and says where it is", async () => {
    await app.signedInAs("alice@example.com");
    const answer = await read(await create("  Flat shopping "));
    expect(answer).toEqual({ status: 201, body: { message: "List created.", id: expect.any(String), next: `/lists/${answer.body.id}` } });
    const [row] = await app.db.admin<{ title: string }>("select title from app.lists");
    expect(row.title).toBe("Flat shopping");
  });

  it("refuses a bad title, the 21st list, another site, no session and a wrong body; nothing changes", async () => {
    expect((await create("Groceries")).status).toBe(401);
    await app.signedInAs("alice@example.com");
    for (let i = 1; i <= 20; i += 1) expect((await create(`List ${i}`)).status).toBe(201);
    const before = await app.snapshot();
    for (const bad of ["", "   ", "a".repeat(61), "Gro\u0007ceries"]) {
      expect(await read(await create(bad))).toEqual({ status: 400, body: { error: "list_title", message: "A list needs a title of 1 to 60 characters" } });
    }
    expect(await read(await create("List 21"))).toEqual({ status: 409, body: { error: "too_many_lists", message: "You can have at most 20 lists" } });
    expect((await create("X", CROSS_SITE)).status).toBe(403);
    expect((await create(42)).status).toBe(400);
    expect((await createList(postJson("/api/lists", { title: "x".repeat(5000) }), app.deps)).status).toBe(413);
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("members (R53)", () => {
  it("the owner adds a contact; the answer names people without any address", async () => {
    const { alice, bob, id } = await flat();
    await app.signedInAs("alice@example.com");
    const answer = await read(await addE(id, "Milk"));
    expect(answer.status).toBe(201);
    expectAllowedShape(answer.body);
    expect((answer.body.list as List).people).toEqual([
      { userId: alice, name: "alice", photoUrl: null, isOwner: true, isMe: true },
      { userId: bob, name: "bob", photoUrl: null, isOwner: false, isMe: false },
    ]);
  });

  it("refuses a non-contact, someone else's contact row, a malformed id and a member managing members", async () => {
    const { bob, carol, id } = await flat();
    const bobCarol = await connect(bob, carol, "carol@example.com");
    await app.signedInAs("alice@example.com");
    const before = await rows();
    expect(await read(await addM(id, bobCarol))).toEqual(NOT_FOUND);
    expect(await read(await addM(id, carol))).toEqual(NOT_FOUND);
    expect(await read(await addM(id, "not-a-uuid"))).toEqual(NOT_FOUND);
    expect(await read(await addM("not-a-uuid", bobCarol))).toEqual(NOT_FOUND);
    expect(await read(await removeM(id, carol))).toEqual(NOT_FOUND);
    expect(await read(await removeM(id, "nope"))).toEqual(NOT_FOUND);
    expect((await addM(id, 7)).status).toBe(400);
    await app.signedInAs("bob@example.com");
    expect(await read(await addM(id, bobCarol))).toEqual(OWNER_ONLY);
    expect(await read(await removeM(id, bob))).toEqual(OWNER_ONLY);
    expect(await rows()).toEqual(before);
  });

  it("the owner removes a member, who then gets Not found for the list and its entries", async () => {
    const { bob, id } = await flat();
    const milk = (await listOf(await addE(id, "Milk"))).entries[0];
    const answer = await read(await removeM(id, bob));
    expect(answer.status).toBe(200);
    expect((answer.body.list as List).people.map((p) => p.userId)).not.toContain(bob);
    await app.signedInAs("bob@example.com");
    expect(await read(await addE(id, "Eggs"))).toEqual(NOT_FOUND);
    expect(await read(await tickE(milk.id, { done: true, updatedAt: milk.updatedAt }))).toEqual(NOT_FOUND);
  });

  it("a member leaves and is sent to the overview; the owner cannot leave", async () => {
    const { id } = await flat();
    expect(await read(await leave(id))).toEqual({
      status: 409,
      body: { error: "owner_cannot_leave", message: "The owner cannot leave a list. Delete it instead" },
    });
    await app.signedInAs("bob@example.com");
    expect(await read(await leave(id))).toEqual({ status: 200, body: { message: "You left the list.", next: "/lists" } });
    expect(await read(await leave(id))).toEqual(NOT_FOUND);
    expect(await read(await addE(id, "Eggs"))).toEqual(NOT_FOUND);
  });

  it("removing the contact ends the membership and the access in the same moment", async () => {
    const { aliceBob, id } = await flat();
    await app.signedInAs("bob@example.com");
    expect((await addE(id, "Milk")).status).toBe(201);
    await app.db.withUser((await app.db.admin<{ id: string }>("select id from auth.users where email = 'bob@example.com'"))[0].id, (q) =>
      q("select app.remove_contact($1::uuid)", [aliceBob]),
    );
    expect(await read(await addE(id, "Eggs"))).toEqual(NOT_FOUND);
  });
});

describe("rename_list and delete_list: the owner only", () => {
  it("the owner renames with the list's version; an old version, a member and a stranger are refused", async () => {
    const { id } = await flat();
    const list = await listOf(await addE(id, "Milk"));
    const renamed = await listOf(await renameL(id, { title: "Flat 2B", updatedAt: list.updatedAt }));
    expect(renamed.title).toBe("Flat 2B");
    const before = await rows();
    expect(await read(await renameL(id, { title: "Again", updatedAt: list.updatedAt }))).toEqual(CHANGED);
    expect(await read(await renameL(id, { title: "", updatedAt: renamed.updatedAt }))).toEqual({
      status: 400,
      body: { error: "list_title", message: "A list needs a title of 1 to 60 characters" },
    });
    expect((await renameL(id, { title: "X", updatedAt: "yesterday" })).status).toBe(400);
    await app.signedInAs("bob@example.com");
    expect(await read(await renameL(id, { title: "Ours", updatedAt: renamed.updatedAt }))).toEqual(OWNER_ONLY);
    expect(await read(await removeL(id))).toEqual(OWNER_ONLY);
    await app.signedInAs("carol@example.com");
    for (const other of [id, MISSING, "not-a-uuid"]) {
      expect(await read(await renameL(other, { title: "Mine", updatedAt: renamed.updatedAt }))).toEqual(NOT_FOUND);
      expect(await read(await removeL(other))).toEqual(NOT_FOUND);
    }
    expect(await rows()).toEqual(before);
  });

  it("the owner deletes the list with everything in it and is sent to the overview", async () => {
    const { id } = await flat();
    await addE(id, "Milk");
    expect((await removeL(id, CROSS_SITE)).status).toBe(403);
    expect(await read(await removeL(id))).toEqual({ status: 200, body: { message: "List deleted.", next: "/lists" } });
    expect(await app.db.admin("select id from app.list_items")).toEqual([]);
    expect(await app.db.admin("select id from app.list_members")).toEqual([]);
  });
});

describe("entries (R54)", () => {
  it("a member adds, renames, ticks, moves and deletes; each answer is the list as it is now", async () => {
    const { alice, bob, id } = await flat();
    await addE(id, "Milk");
    await app.signedInAs("bob@example.com");
    await addE(id, "Eggs");
    let list = await listOf(await addE(id, "Bread"));
    const [milk, eggs, bread] = list.entries;
    list = await listOf(await tickE(milk.id, { done: true, updatedAt: milk.updatedAt }));
    expect(list.entries[0]).toMatchObject({ title: "Milk", done: true, addedBy: alice, doneBy: bob });
    const ticked = list.entries[0];
    list = await listOf(await renameE(ticked.id, { title: " Oat milk ", updatedAt: ticked.updatedAt }));
    expect(list.entries[0].title).toBe("Oat milk");
    list = await listOf(await moveE(bread.id, { toIndex: 0, updatedAt: bread.updatedAt }));
    expect(list.entries.map((e) => e.title)).toEqual(["Bread", "Oat milk", "Eggs"]);
    const answer = await read(await deleteE(eggs.id, { updatedAt: eggs.updatedAt }));
    expectAllowedShape(answer.body);
    expect((answer.body.list as List).entries.map((e) => e.title)).toEqual(["Bread", "Oat milk"]);
    expect(answer.body.message).toBe("Entry deleted.");
  });

  it("refuses a bad title and an old version (R4) with nothing changed", async () => {
    const { id } = await flat();
    const milk = (await listOf(await addE(id, "Milk"))).entries[0];
    await app.signedInAs("bob@example.com");
    await tickE(milk.id, { done: true, updatedAt: milk.updatedAt });
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    const badTitle = { status: 400, body: { error: "entry_title", message: "An entry needs a title of 1 to 200 characters" } };
    expect(await read(await addE(id, ""))).toEqual(badTitle);
    expect(await read(await addE(id, "x".repeat(201)))).toEqual(badTitle);
    expect(await read(await tickE(milk.id, { done: false, updatedAt: milk.updatedAt }))).toEqual(CHANGED);
    expect(await read(await renameE(milk.id, { title: "Oat milk", updatedAt: milk.updatedAt }))).toEqual(CHANGED);
    expect(await read(await moveE(milk.id, { toIndex: 0, updatedAt: milk.updatedAt }))).toEqual(CHANGED);
    expect(await read(await deleteE(milk.id, { updatedAt: milk.updatedAt }))).toEqual(CHANGED);
    expect((await moveE(milk.id, { toIndex: 200, updatedAt: milk.updatedAt })).status).toBe(400);
    expect((await tickE(milk.id, { done: "yes", updatedAt: milk.updatedAt })).status).toBe(400);
    expect(await app.snapshot()).toEqual(before);
  });

  it("a third user gets Not found for every entry action, also for missing and malformed ids", async () => {
    const { id } = await flat();
    const milk = (await listOf(await addE(id, "Milk"))).entries[0];
    await app.signedInAs("carol@example.com");
    const before = await app.snapshot();
    const v = { updatedAt: milk.updatedAt };
    for (const entry of [milk.id, MISSING, "not-a-uuid"]) {
      expect(await read(await renameE(entry, { title: "Mine", ...v }))).toEqual(NOT_FOUND);
      expect(await read(await tickE(entry, { done: true, ...v }))).toEqual(NOT_FOUND);
      expect(await read(await moveE(entry, { toIndex: 0, ...v }))).toEqual(NOT_FOUND);
      expect(await read(await deleteE(entry, v))).toEqual(NOT_FOUND);
    }
    for (const list of [id, MISSING, "not-a-uuid"]) expect(await read(await addE(list, "Mine"))).toEqual(NOT_FOUND);
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("what other members see (R55)", () => {
  it("a member who is not the other member's contact sees their name and photo address, never their address", async () => {
    const { alice, carol, id } = await flat();
    const aliceCarol = await connect(alice, carol, "carol@example.com");
    await app.db.withUser(carol, (q) => q("select app.set_display_name('Carol Dias')"));
    await addM(id, aliceCarol);
    await app.signedInAs("bob@example.com");
    const answer = await read(await addE(id, "Milk"));
    expectAllowedShape(answer.body);
    expect((answer.body.list as List).people.map((p) => p.name)).toEqual(["alice", "bob", "Carol Dias"]);
    // Dave has no display name and is no contact of Bob's: just "Member".
    const dave = await app.signedInAs("dave@example.com");
    await app.signedInAs("alice@example.com");
    await addM(id, await connect(alice, dave, "dave@example.com"));
    await app.signedInAs("bob@example.com");
    const people = (await listOf(await addE(id, "Eggs"))).people;
    expect(people.find((p) => p.userId === dave)?.name).toBe("Member");
  });
});

describe("the coach is never sent lists (R57, R22 unchanged)", () => {
  it("a message to the coach carries no list title and no entry", async () => {
    await flat();
    await addE((await app.db.admin<{ id: string }>("select id from app.lists"))[0].id, "Secret entry 4711");
    await renameL((await app.db.admin<{ id: string }>("select id from app.lists"))[0].id, {
      title: "Hidden list 0815",
      updatedAt: (await listOf(await addE((await app.db.admin<{ id: string }>("select id from app.lists"))[0].id, "Another"))).updatedAt,
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const answer = await sendMessage(postJson("/api/chat/messages", { text: "What should I buy?" }), app.deps);
    expect(answer.status).toBe(201);
    expect(app.assistant.requests).toHaveLength(1);
    const sent = JSON.stringify(app.assistant.requests[0]);
    for (const secret of ["Secret entry 4711", "Hidden list 0815", "Another", "Flat shopping", "bob"]) expect(sent).not.toContain(secret);
  });
});
