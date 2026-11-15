// The page loaders of spec 30: the overview and one list read in one transaction each; a list the user
// may not use, a missing one and a malformed id all give nothing (the page answers "Not found", R55);
// the owner gets their contacts for "Share", a member gets none, and nobody gets another member's address.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "@test/support/app";
import { countingWithUser } from "@test/support/counting";
import { loadListPage, loadListsPage } from "./load";

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.reset();
});

const as = <T extends Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) =>
  app.db.withUser(user, (q) => q<T>(sql, params));

async function connect(a: string, b: string, bEmail: string): Promise<string> {
  await as(a, "select app.invite_contact($1)", [bEmail]);
  const [invitation] = await as<{ id: string }>(b, "select id from app.contact_cards() where kind = 'received'");
  await as(b, "select app.answer_invitation($1::uuid, true)", [invitation.id]);
  const [row] = await app.db.admin<{ id: string }>(
    "select id from app.contacts where user_a = least($1::uuid, $2::uuid) and user_b = greatest($1::uuid, $2::uuid)",
    [a, b],
  );
  return row.id;
}

describe("page loaders of spec 30", () => {
  it("the overview: one transaction, own and shared lists with the open count, the owner's name and the people", async () => {
    const carol = await app.signedInAs("carol@example.com");
    const bob = await app.signedInAs("bob@example.com");
    const alice = await app.signedInAs("alice@example.com");
    const aliceBob = await connect(alice, bob, "bob@example.com");
    const [{ id: flat }] = await as<{ id: string }>(alice, "select app.create_list('Flat shopping') as id");
    await as(alice, "select app.add_list_member($1::uuid, $2::uuid)", [flat, aliceBob]);
    await as(alice, "select app.add_list_item($1::uuid, 'Milk'), app.add_list_item($1::uuid, 'Eggs')", [flat]);
    await as(bob, "select app.create_list('Bob alone')");
    await as(carol, "select app.create_list('Carol alone')");

    const { withUser, transactions } = countingWithUser(app.db);
    const page = await loadListsPage({ withUser }, bob);
    expect(transactions).toHaveLength(1);
    expect(page.lists.map((l) => [l.title, l.isOwner, l.ownerName, l.openCount])).toEqual([
      ["Flat shopping", false, "alice", 2],
      ["Bob alone", true, "bob", 0],
    ]);
    expect(page.lists[0].people.map((p) => [p.userId, p.isOwner, p.isMe])).toEqual([
      [alice, true, false],
      [bob, false, true],
    ]);
    expect(JSON.stringify(page)).not.toContain("@");
  });

  it("one list: the owner gets the entries, the people and their contacts; a member no contacts; others nothing", async () => {
    await app.signedInAs("carol@example.com");
    const bob = await app.signedInAs("bob@example.com");
    const alice = await app.signedInAs("alice@example.com");
    const aliceBob = await connect(alice, bob, "bob@example.com");
    const [{ id }] = await as<{ id: string }>(alice, "select app.create_list('Flat shopping') as id");
    await as(alice, "select app.add_list_member($1::uuid, $2::uuid)", [id, aliceBob]);
    await as(bob, "select app.add_list_item($1::uuid, 'Milk')", [id]);

    const counted = countingWithUser(app.db);
    const own = await loadListPage({ withUser: counted.withUser }, alice, id);
    expect(counted.transactions).toHaveLength(1);
    expect(own?.page.list).toMatchObject({ id, title: "Flat shopping", isOwner: true });
    expect(own?.page.list.entries).toEqual([
      { id: expect.any(String), title: "Milk", done: false, position: 0, updatedAt: expect.any(String), addedBy: bob, doneBy: null },
    ]);
    expect(own?.page.contacts).toEqual([{ contactId: aliceBob, userId: bob, name: "bob", email: "bob@example.com", photoUrl: null }]);

    const member = await loadListPage(app.deps, bob, id);
    expect(member?.page.list.isOwner).toBe(false);
    expect(member?.page.contacts).toEqual([]);
    expect(JSON.stringify(member)).not.toContain("@");

    const carol = (await app.db.admin<{ id: string }>("select id from auth.users where email = 'carol@example.com'"))[0].id;
    const none = countingWithUser(app.db);
    expect(await loadListPage({ withUser: none.withUser }, carol, id)).toBeNull();
    expect(await loadListPage({ withUser: none.withUser }, carol, "00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(await loadListPage({ withUser: none.withUser }, carol, "not-a-uuid")).toBeNull();
    // The malformed id is answered without asking the database.
    expect(none.transactions).toHaveLength(2);
  });
});
