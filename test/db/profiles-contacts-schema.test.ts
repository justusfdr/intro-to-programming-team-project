// Tests for supabase/migrations/*_profiles_contacts.sql (spec 28): the display name and the photo are
// written only through their functions; another user's name and photo are seen only by contacts and by
// someone with an open invitation from that user (R43); inviting never tells whether an address has an
// account (R44); limits; declines block for 30 days without telling the sender (R45); contacts are one
// row per pair that only functions write (R46); removing a contact or deleting an account ends it all.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./harness";

let db: TestDb;
let alice: string;
let bob: string;
let carol: string;

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
});

const as = <T extends Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) =>
  db.withUser(user, (q) => q<T>(sql, params));

type Card = { kind: string; id: string | null; user_id: string | null; display_name: string | null; email: string; photo_at: Date | null };
const cards = (user: string) =>
  as<Card>(user, "select kind, id, user_id, display_name, email, photo_at from app.contact_cards() order by kind, email");
const kinds = async (user: string, kind: string) => (await cards(user)).filter((c) => c.kind === kind);

const invite = (user: string, email: string) => as(user, "select app.invite_contact($1)", [email]);
const answer = (user: string, id: string, accept: boolean) => as(user, "select app.answer_invitation($1::uuid, $2::boolean)", [id, accept]);
const receivedId = async (user: string) => (await kinds(user, "received"))[0]?.id as string;

/** Makes two users contacts the way the app does: one invites, the other accepts. */
async function connect(a: string, b: string, bEmail: string) {
  await invite(a, bEmail);
  await answer(b, await receivedId(b), true);
}

const b64 = (bytes: number[], fill = 0) => Buffer.concat([Buffer.from(bytes), Buffer.alloc(fill, 7)]).toString("base64");
const JPEG = b64([0xff, 0xd8, 0xff, 0xe0], 60);
const PNG = b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 60);
const WEBP = b64([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50], 60);
const GIF = b64([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 60);

const setPhoto = (user: string, data: string) => as(user, "select app.set_profile_photo($1)", [data]);
const photoOf = (viewer: string, owner: string) =>
  as<{ mime: string; data: string }>(viewer, "select mime, data from app.profile_photo($1::uuid)", [owner]);

const everything = () =>
  Promise.all(
    ["profiles", "profile_photos", "contact_invitations", "contact_declines", "contacts"].map((t) =>
      db.admin(`select * from app.${t} order by 1`),
    ),
  );

describe("display name", () => {
  it("is empty at first and is set through app.set_display_name, on the user's own row only", async () => {
    expect((await kinds(alice, "self"))[0]).toMatchObject({ display_name: null, email: "alice@example.com" });
    await as(alice, "select app.set_display_name($1)", ["Alice Martins"]);
    expect((await kinds(alice, "self"))[0].display_name).toBe("Alice Martins");
    const [own] = await as<{ display_name: string }>(alice, "select display_name from app.profiles");
    expect(own.display_name).toBe("Alice Martins");
    const [bobs] = await db.admin<{ display_name: string | null }>("select display_name from app.profiles where id = $1", [bob]);
    expect(bobs.display_name).toBeNull();
  });

  it("refuses empty, too long, spaces at the ends, control and direction characters; nothing changes", async () => {
    await as(alice, "select app.set_display_name($1)", ["Alice"]);
    const before = await everything();
    for (const bad of ["", " Alice", "Alice ", "a".repeat(41), "Ali\u0007ce", "Ali\nce", "\u202eecilA", "Al\u200bice", "\u00a0Alice"]) {
      await expect(as(alice, "select app.set_display_name($1)", [bad])).rejects.toThrow("Name must be 1 to 40 characters");
    }
    expect(await everything()).toEqual(before);
    // 40 characters, accents and emoji are fine.
    await as(alice, "select app.set_display_name($1)", ["É".repeat(39) + "😀"]);
  });

  it("cannot be written directly: no update right on app.profiles, and the plan stays the server's (R6)", async () => {
    await expect(as(alice, "update app.profiles set display_name = 'X'")).rejects.toThrow(/permission denied/);
    await expect(as(alice, "update app.profiles set plan = 'pro'")).rejects.toThrow(/permission denied/);
    // Even the owner of the table cannot store a bad name.
    await expect(db.admin("update app.profiles set display_name = ' x' where id = $1", [alice])).rejects.toThrow(/profiles_display_name_form/);
  });

  it("another user's profile row stays unreadable (the select policy is unchanged)", async () => {
    await connect(alice, bob, "bob@example.com");
    expect(await as(bob, "select id from app.profiles where id = $1", [alice])).toEqual([]);
  });
});

describe("profile photo", () => {
  it("stores JPEG, PNG and WebP with the type taken from the bytes, and removes it", async () => {
    for (const [data, mime] of [[JPEG, "image/jpeg"], [PNG, "image/png"], [WEBP, "image/webp"]]) {
      await setPhoto(alice, data);
      expect(await photoOf(alice, alice)).toEqual([{ mime, data }]);
    }
    expect((await kinds(alice, "self"))[0].photo_at).not.toBeNull();
    await as(alice, "select app.remove_profile_photo()");
    expect(await photoOf(alice, alice)).toEqual([]);
    expect((await kinds(alice, "self"))[0].photo_at).toBeNull();
  });

  it("refuses another type, more than 200,000 bytes and text that is not base64; nothing changes", async () => {
    await setPhoto(alice, PNG);
    const before = await everything();
    await expect(setPhoto(alice, GIF)).rejects.toThrow("A photo must be a JPEG, PNG or WebP image");
    await expect(setPhoto(alice, "not base64 !!")).rejects.toThrow("A photo must be a JPEG, PNG or WebP image");
    await expect(setPhoto(alice, b64([0xff, 0xd8, 0xff], 200_000 - 2))).rejects.toThrow("A photo can be at most 200 KB");
    expect(await everything()).toEqual(before);
    // Exactly 200,000 bytes is fine.
    await setPhoto(alice, b64([0xff, 0xd8, 0xff], 200_000 - 3));
  });

  it("cannot be written directly, and the table refuses bytes that do not match the type", async () => {
    await expect(
      as(alice, "insert into app.profile_photos (user_id, mime, bytes) values ($1, 'image/png', decode($2, 'base64'))", [alice, PNG]),
    ).rejects.toThrow(/permission denied/);
    await setPhoto(alice, PNG);
    await expect(as(alice, "update app.profile_photos set mime = 'image/jpeg'")).rejects.toThrow(/permission denied/);
    await expect(as(alice, "delete from app.profile_photos")).rejects.toThrow(/permission denied/);
    await expect(db.admin("update app.profile_photos set mime = 'image/jpeg' where user_id = $1", [alice])).rejects.toThrow(/profile_photos_type_matches/);
  });

  it("is seen by the user, a contact, and someone with an open invitation from them; by nobody else (R43)", async () => {
    await setPhoto(alice, JPEG);
    await setPhoto(bob, PNG);
    await setPhoto(carol, WEBP);
    // Alice invites Bob: Bob sees Alice's photo; Alice does not see Bob's.
    await invite(alice, "bob@example.com");
    expect(await photoOf(bob, alice)).toHaveLength(1);
    expect(await photoOf(alice, bob)).toEqual([]);
    // Carol sees neither; an unknown id answers the same as "not allowed".
    expect(await photoOf(carol, alice)).toEqual([]);
    expect(await photoOf(carol, bob)).toEqual([]);
    expect(await photoOf(carol, "00000000-0000-4000-8000-000000000000")).toEqual([]);
    // After accepting both see each other's.
    await answer(bob, await receivedId(bob), true);
    expect(await photoOf(alice, bob)).toHaveLength(1);
    expect(await photoOf(bob, alice)).toHaveLength(1);
    expect(await photoOf(carol, alice)).toEqual([]);
    // Reading the table directly shows only one's own photo.
    expect(await as(bob, "select user_id from app.profile_photos")).toEqual([{ user_id: bob }]);
  });
});

describe("invite_contact (R44)", () => {
  it("an address with an account: the invited user sees the inviter's card; the inviter sees only the address and date", async () => {
    await as(alice, "select app.set_display_name('Alice M.')");
    await invite(alice, "  Bob@Example.com ");
    expect(await kinds(bob, "received")).toEqual([
      { kind: "received", id: expect.any(String), user_id: alice, display_name: "Alice M.", email: "alice@example.com", photo_at: null },
    ]);
    expect(await kinds(alice, "sent")).toEqual([
      { kind: "sent", id: expect.any(String), user_id: null, display_name: null, email: "bob@example.com", photo_at: null },
    ]);
    // Alice sees nothing of Bob.
    expect(await kinds(alice, "received")).toEqual([]);
    expect(await kinds(alice, "contact")).toEqual([]);
  });

  it("an address without an account: nothing anyone else sees, and the sender's list looks the same", async () => {
    await invite(alice, "bob@example.com");
    await invite(alice, "nobody@example.com");
    const sent = await kinds(alice, "sent");
    expect(sent.map((c) => c.email)).toEqual(["bob@example.com", "nobody@example.com"]);
    expect(sent.map(({ id: _id, email: _email, ...rest }) => rest)).toEqual([sent[0], sent[0]].map(({ id: _id, email: _email, ...rest }) => rest));
    // Not even the table tells them apart: to_user is not readable for the sender.
    await expect(as(alice, "select to_user from app.contact_invitations")).rejects.toThrow(/permission denied/);
    expect((await as(alice, "select id, from_user, to_email, created_at from app.contact_invitations")).length).toBe(2);
    expect(await kinds(carol, "received")).toEqual([]);
  });

  it("answers the same (nothing) for a new, unknown, pending, contact and declined address", async () => {
    await connect(alice, carol, "carol@example.com");
    for (const email of ["bob@example.com", "bob@example.com", "nobody@example.com", "carol@example.com"]) {
      expect(await invite(alice, email)).toEqual([{ invite_contact: "" }]);
    }
    await answer(bob, await receivedId(bob), false);
    expect(await invite(alice, "bob@example.com")).toEqual([{ invite_contact: "" }]);
  });

  it("refuses the user's own address and a malformed one with their messages; nothing changes", async () => {
    const before = await everything();
    await expect(invite(alice, "ALICE@example.com")).rejects.toThrow("You cannot invite yourself");
    await expect(invite(alice, "not an address")).rejects.toThrow("Enter a valid email address");
    await expect(invite(alice, "")).rejects.toThrow("Enter a valid email address");
    expect(await everything()).toEqual(before);
    expect(await db.admin("select * from app.contact_invite_attempts")).toEqual([]);
  });

  it("allows 20 open invitations and refuses the 21st, whether or not the address has an account", async () => {
    for (let i = 1; i <= 10; i++) await invite(alice, `p${i}@example.com`);
    await db.admin("delete from app.contact_invite_attempts");
    for (let i = 11; i <= 20; i++) await invite(alice, `p${i}@example.com`);
    await db.admin("delete from app.contact_invite_attempts");
    const before = await everything();
    await expect(invite(alice, "bob@example.com")).rejects.toThrow("You can have at most 20 open invitations");
    await expect(invite(alice, "nobody@example.com")).rejects.toThrow("You can have at most 20 open invitations");
    expect(await everything()).toEqual(before);
  });

  it("allows 10 invitations per hour, counted in the database per sender, and frees them after an hour", async () => {
    for (let i = 1; i <= 10; i++) await invite(alice, i % 2 ? `p${i}@example.com` : "bob@example.com");
    const before = await everything();
    await expect(invite(alice, "carol@example.com")).rejects.toThrow("You can send at most 10 invitations per hour");
    await expect(invite(alice, "nobody@example.com")).rejects.toThrow("You can send at most 10 invitations per hour");
    expect(await everything()).toEqual(before);
    // Bob's own count is separate.
    await invite(bob, "carol@example.com");
    // An hour later.
    await db.admin("update app.contact_invite_attempts set at = at - interval '61 minutes' where user_id = $1", [alice]);
    await invite(alice, "carol@example.com");
    expect(await kinds(carol, "received")).toHaveLength(2);
  });

  it("refuses inviting with 100 contacts, accepting a 101st, and taking the inviter past 100", async () => {
    // 100 contacts each, written as the owner for speed.
    const fill = async (user: string, prefix: string) => {
      for (let i = 0; i < 100; i++) {
        const other = await db.createUser(`${prefix}${i}@example.com`);
        await db.admin("insert into app.contacts (user_a, user_b) values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid))", [user, other]);
      }
    };
    await invite(carol, "bob@example.com");
    await fill(alice, "a");
    await expect(invite(alice, "bob@example.com")).rejects.toThrow("You can have at most 100 contacts");
    await invite(bob, "alice@example.com");
    await expect(answer(alice, await receivedId(alice), true)).rejects.toThrow("You can have at most 100 contacts");
    expect(await kinds(alice, "received")).toHaveLength(1);
    await fill(carol, "c");
    await expect(answer(bob, await receivedId(bob), true)).rejects.toThrow("This person cannot add more contacts");
    expect(await kinds(bob, "received")).toHaveLength(1);
  });

  it("accepts the other person's open invitation instead of sending one back", async () => {
    await invite(bob, "alice@example.com");
    await invite(alice, "bob@example.com");
    expect((await kinds(alice, "contact")).map((c) => c.email)).toEqual(["bob@example.com"]);
    expect((await kinds(bob, "contact")).map((c) => c.email)).toEqual(["alice@example.com"]);
    expect(await db.admin("select * from app.contact_invitations")).toEqual([]);
  });

  it("links a row only the sender sees once the address has an account", async () => {
    await invite(alice, "dave@example.com");
    expect(await kinds(alice, "sent")).toHaveLength(1);
    const dave = await db.createUser("dave@example.com", { confirmed: true });
    expect(await kinds(dave, "received")).toEqual([]);
    await invite(alice, "dave@example.com");
    expect(await kinds(dave, "received")).toHaveLength(1);
    expect(await kinds(alice, "sent")).toHaveLength(1);
  });
});

describe("answer_invitation and withdraw_invitation (R45)", () => {
  it("accept: both are contacts, one row per pair, and see each other's card with the address", async () => {
    await connect(alice, bob, "bob@example.com");
    const rows = await db.admin<{ user_a: string; user_b: string }>("select user_a, user_b from app.contacts");
    expect(rows).toEqual([{ user_a: [alice, bob].sort()[0], user_b: [alice, bob].sort()[1] }]);
    expect((await kinds(alice, "contact"))[0]).toMatchObject({ user_id: bob, email: "bob@example.com", display_name: null });
    expect((await kinds(bob, "contact"))[0]).toMatchObject({ user_id: alice, email: "alice@example.com" });
    expect(await kinds(alice, "sent")).toEqual([]);
    expect(await kinds(bob, "received")).toEqual([]);
    expect(await as(alice, "select app.is_contact($1::uuid, $2::uuid) as yes", [alice, bob])).toEqual([{ yes: true }]);
  });

  it("decline: gone for the invited user; the sender's list does not change; no new invitation for 30 days", async () => {
    await invite(alice, "bob@example.com");
    const sentBefore = await kinds(alice, "sent");
    await answer(bob, await receivedId(bob), false);
    expect(await kinds(bob, "received")).toEqual([]);
    expect(await kinds(alice, "sent")).toEqual(sentBefore);
    expect(await photoOf(bob, alice)).toEqual([]);
    // Withdrawn and sent again within 30 days: still nothing for Bob, and the sender's list looks as always.
    await as(alice, "select app.withdraw_invitation($1::uuid)", [sentBefore[0].id]);
    await invite(alice, "bob@example.com");
    expect(await kinds(bob, "received")).toEqual([]);
    expect((await kinds(alice, "sent")).map((c) => c.email)).toEqual(["bob@example.com"]);
    // After 30 days the same row reaches Bob again.
    await db.admin("update app.contact_declines set until = now() - interval '1 second'");
    await invite(alice, "bob@example.com");
    expect(await kinds(bob, "received")).toHaveLength(1);
  });

  it("only the invited user may answer, once; others get 'Not found' and nothing changes", async () => {
    await invite(alice, "bob@example.com");
    const id = await receivedId(bob);
    const before = await everything();
    for (const [user, accept] of [[alice, true], [carol, true], [carol, false]] as const) {
      await expect(answer(user, id, accept)).rejects.toThrow("Not found");
    }
    await expect(answer(bob, "00000000-0000-4000-8000-000000000000", true)).rejects.toThrow("Not found");
    expect(await everything()).toEqual(before);
    await answer(bob, id, true);
    await expect(answer(bob, id, true)).rejects.toThrow("Not found");
  });

  it("only the sender may withdraw; then the invited user sees nothing more", async () => {
    await invite(alice, "bob@example.com");
    const id = (await kinds(alice, "sent"))[0].id!;
    await expect(as(bob, "select app.withdraw_invitation($1::uuid)", [id])).rejects.toThrow("Not found");
    await expect(as(carol, "select app.withdraw_invitation($1::uuid)", [id])).rejects.toThrow("Not found");
    await as(alice, "select app.withdraw_invitation($1::uuid)", [id]);
    expect(await kinds(bob, "received")).toEqual([]);
    expect(await photoOf(bob, alice)).toEqual([]);
  });
});

describe("what other people can read", () => {
  it("a third user reads nothing: no cards, no rows, is_contact false", async () => {
    await setPhoto(alice, JPEG);
    await connect(alice, bob, "bob@example.com");
    await invite(alice, "carol@example.com");
    await answer(carol, await receivedId(carol), false);
    expect((await cards(carol)).map((c) => c.kind)).toEqual(["self"]);
    expect(await as(carol, "select * from app.contacts")).toEqual([]);
    expect(await as(carol, "select id from app.contact_invitations")).toEqual([]);
    expect(await as(carol, "select app.is_contact($1::uuid, $2::uuid) as yes", [alice, bob])).toEqual([{ yes: false }]);
  });

  it("an invited user cannot read the inviter's contacts", async () => {
    const dave = await db.createUser("dave@example.com", { confirmed: true });
    await connect(alice, dave, "dave@example.com");
    await invite(alice, "bob@example.com");
    expect((await cards(bob)).map((c) => c.kind)).toEqual(["received", "self"]);
    expect(await as(bob, "select * from app.contacts")).toEqual([]);
    expect(await as(bob, "select app.is_contact($1::uuid, $2::uuid) as yes", [alice, dave])).toEqual([{ yes: false }]);
    expect(await photoOf(bob, dave)).toEqual([]);
  });

  it("nobody reads declines or the count of attempts", async () => {
    await invite(alice, "bob@example.com");
    await answer(bob, await receivedId(bob), false);
    for (const user of [alice, bob]) {
      await expect(as(user, "select * from app.contact_declines")).rejects.toThrow(/permission denied/);
      await expect(as(user, "select * from app.contact_invite_attempts")).rejects.toThrow(/permission denied/);
    }
  });

  it("the role authenticated cannot insert, change or delete contacts and invitations directly", async () => {
    const [a, b] = [alice, bob].sort();
    await expect(as(alice, "insert into app.contacts (user_a, user_b) values ($1, $2)", [a, b])).rejects.toThrow(/permission denied/);
    await expect(
      as(alice, "insert into app.contact_invitations (from_user, to_user, to_email) values ($1, $2, 'bob@example.com')", [alice, bob]),
    ).rejects.toThrow(/permission denied/);
    await connect(alice, bob, "bob@example.com");
    await expect(as(alice, "delete from app.contacts")).rejects.toThrow(/permission denied/);
    await expect(as(alice, "update app.contacts set created_at = now()")).rejects.toThrow(/permission denied/);
    await invite(alice, "carol@example.com");
    await expect(as(carol, "update app.contact_invitations set to_email = 'x@example.com'")).rejects.toThrow(/permission denied/);
    await expect(as(alice, "delete from app.contact_invitations")).rejects.toThrow(/permission denied/);
  });

  it("anon and public get nothing: no table and no function", async () => {
    for (const table of ["profile_photos", "contact_invitations", "contact_declines", "contact_invite_attempts", "contacts"]) {
      const [row] = await db.admin<{ yes: boolean }>("select has_table_privilege('anon', $1, 'select') as yes", [`app.${table}`]);
      expect(row.yes).toBe(false);
    }
    const functions = [
      "app.set_display_name(text)", "app.set_profile_photo(text)", "app.remove_profile_photo()", "app.profile_photo(uuid)",
      "app.invite_contact(text)", "app.answer_invitation(uuid, boolean)", "app.withdraw_invitation(uuid)", "app.remove_contact(uuid)",
      "app.contact_cards()", "app.is_contact(uuid, uuid)", "app.received_invitation_count()",
    ];
    for (const fn of functions) {
      const [row] = await db.admin<{ anon: boolean; user: boolean }>(
        "select has_function_privilege('anon', $1, 'execute') as anon, has_function_privilege('authenticated', $1, 'execute') as user",
        [fn],
      );
      expect(row).toEqual({ anon: false, user: true });
    }
    for (const fn of ["app.may_see_profile(uuid, uuid)", "app.make_contacts(uuid, uuid)", "app.photo_mime(bytea)"]) {
      const [row] = await db.admin<{ yes: boolean }>("select has_function_privilege('authenticated', $1, 'execute') as yes", [fn]);
      expect(row.yes).toBe(false);
    }
  });

  it("every function refuses a missing user", async () => {
    await expect(db.admin("select app.invite_contact('bob@example.com')")).rejects.toThrow("not signed in");
    await expect(db.admin("select app.set_display_name('X')")).rejects.toThrow("not signed in");
    await expect(db.admin("select app.set_profile_photo($1)", [JPEG])).rejects.toThrow("not signed in");
    await expect(db.admin("select app.remove_contact(gen_random_uuid())")).rejects.toThrow("not signed in");
    expect(await db.admin("select * from app.contact_cards()")).toEqual([]);
  });

  it("counts open invitations to the user for the badge", async () => {
    await invite(alice, "carol@example.com");
    await invite(bob, "carol@example.com");
    expect(await as(carol, "select app.received_invitation_count() as n")).toEqual([{ n: 2 }]);
    expect(await as(alice, "select app.received_invitation_count() as n")).toEqual([{ n: 0 }]);
  });
});

describe("remove_contact and deleting an account (R46)", () => {
  it("either side removes the contact; then neither sees the other", async () => {
    await setPhoto(alice, JPEG);
    await connect(alice, bob, "bob@example.com");
    const id = (await kinds(bob, "contact"))[0].id!;
    await expect(as(carol, "select app.remove_contact($1::uuid)", [id])).rejects.toThrow("Not found");
    await as(bob, "select app.remove_contact($1::uuid)", [id]);
    expect(await kinds(alice, "contact")).toEqual([]);
    expect(await kinds(bob, "contact")).toEqual([]);
    expect(await photoOf(bob, alice)).toEqual([]);
    expect(await as(alice, "select app.is_contact($1::uuid, $2::uuid) as yes", [alice, bob])).toEqual([{ yes: false }]);
    await expect(as(alice, "select app.remove_contact($1::uuid)", [id])).rejects.toThrow("Not found");
  });

  it("deleting an account removes its photo, invitations and contacts", async () => {
    await setPhoto(alice, JPEG);
    await connect(alice, bob, "bob@example.com");
    await invite(alice, "nobody@example.com");
    await invite(carol, "alice@example.com");
    await db.admin("delete from auth.users where id = $1", [alice]);
    expect(await db.admin("select * from app.profile_photos")).toEqual([]);
    expect(await db.admin("select * from app.contacts")).toEqual([]);
    expect(await db.admin("select * from app.contact_invitations where from_user = $1", [alice])).toEqual([]);
    // Carol's own list keeps the address she typed, no longer linked to any account.
    expect(await db.admin("select to_user, to_email from app.contact_invitations")).toEqual([{ to_user: null, to_email: "alice@example.com" }]);
    expect((await cards(bob)).map((c) => c.kind)).toEqual(["self"]);
  });
});
