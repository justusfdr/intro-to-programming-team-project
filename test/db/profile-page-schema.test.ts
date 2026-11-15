// Tests for supabase/migrations/*_profile_page.sql (spec 31): the bio and the LinkedIn link are written
// only through app.set_profile, with the same checks as the browser and the server; the check
// constraints hold even for the table's owner; app.profile_card gives a person's whole card (with the
// time zone from their settings) only to themselves, their contacts and someone they invited while the
// invitation is open, and no row to anyone else (R43). A refusal changes nothing (R1).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { STORED_EXAMPLES } from "@test/support/linkedin-examples";
import { TEXT_EXAMPLES } from "@test/support/text-examples";
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
  alice = await db.createUser("alice@example.com", { confirmed: true, timeZone: "America/New_York" });
  bob = await db.createUser("bob@example.com", { confirmed: true });
  carol = await db.createUser("carol@example.com", { confirmed: true });
});

const as = <T extends Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) =>
  db.withUser(user, (q) => q<T>(sql, params));

const setProfile = (user: string, name: string | null, bio: string | null, link: string | null) =>
  as(user, "select app.set_profile($1::text, $2::text, $3::text)", [name, bio, link]);

type Card = {
  user_id: string;
  display_name: string | null;
  bio: string | null;
  linkedin_url: string | null;
  time_zone: string;
  photo_at: Date | null;
  email: string | null;
};
const card = (viewer: string, owner: string) =>
  as<Card>(viewer, "select user_id, display_name, bio, linkedin_url, time_zone, photo_at, email from app.profile_card($1::uuid)", [owner]);

const invite = (user: string, email: string) => as(user, "select app.invite_contact($1::text)", [email]);
const receivedId = async (user: string) =>
  (await as<{ id: string }>(user, "select id from app.contact_cards() where kind = 'received'"))[0]?.id;
const answer = (user: string, id: string, accept: boolean) => as(user, "select app.answer_invitation($1::uuid, $2::boolean)", [id, accept]);

async function connect(a: string, b: string, bEmail: string) {
  await invite(a, bEmail);
  await answer(b, await receivedId(b), true);
}

const profiles = () => db.admin("select id, display_name, bio, linkedin_url from app.profiles order by id");

const LINK = "https://www.linkedin.com/in/alice-martins";
const BIO_ERROR = "A bio must be 1 to 160 characters on one line, without control characters";
const LINK_ERROR = "Enter a LinkedIn profile link, like https://www.linkedin.com/in/your-name";
const NAME_ERROR = "Name must be 1 to 40 characters, without control characters";

describe("app.set_profile", () => {
  it("saves name, bio and link on the user's own row only; null clears bio and link", async () => {
    await setProfile(alice, "Alice Martins", "Statistics at Nova 📊", LINK);
    const [own] = await as<{ display_name: string; bio: string; linkedin_url: string }>(alice, "select display_name, bio, linkedin_url from app.profiles");
    expect(own).toEqual({ display_name: "Alice Martins", bio: "Statistics at Nova 📊", linkedin_url: LINK });
    const [bobs] = await db.admin<{ bio: string | null; linkedin_url: string | null }>("select bio, linkedin_url from app.profiles where id = $1", [bob]);
    expect(bobs).toEqual({ bio: null, linkedin_url: null });

    await setProfile(alice, "Alice Martins", null, null);
    const [cleared] = await as<{ bio: string | null; linkedin_url: string | null }>(alice, "select bio, linkedin_url from app.profiles");
    expect(cleared).toEqual({ bio: null, linkedin_url: null });
  });

  it("keeps a name that was never set unset (null), but a set name cannot be emptied", async () => {
    await setProfile(bob, null, "Hi", null);
    const [before] = await as<{ display_name: string | null; bio: string }>(bob, "select display_name, bio from app.profiles");
    expect(before).toEqual({ display_name: null, bio: "Hi" });
    await setProfile(bob, "Bob", "Hi", null);
    const saved = await profiles();
    await expect(setProfile(bob, null, "Hi", null)).rejects.toThrow(NAME_ERROR);
    await expect(setProfile(bob, "", "Hi", null)).rejects.toThrow(NAME_ERROR);
    expect(await profiles()).toEqual(saved);
  });

  it("bio: 160 characters are fine, 161 are not; line breaks, invisible characters and spaces at the ends are refused", async () => {
    await setProfile(alice, "Alice", "a".repeat(160), null);
    await setProfile(alice, "Alice", "😀".repeat(160), null);
    const before = await profiles();
    for (const bad of ["a".repeat(161), "", " Hi", "Hi ", "Line one\nline two", "Line one\r\nline two", "Line two", "Hi\u0085there", "Hi​there", "‮ereht", "Hiㅤ"]) {
      await expect(setProfile(alice, "Alice", bad, null)).rejects.toThrow(BIO_ERROR);
    }
    expect(await profiles()).toEqual(before);
  });

  it("bio: follows the shared table of examples for titles (the same rule as in the browser)", async () => {
    for (const example of TEXT_EXAMPLES) {
      const saving = setProfile(alice, "Alice", example.text, null);
      if (example.title) await expect(saving, example.what).resolves.toBeDefined();
      else await expect(saving, example.what).rejects.toThrow(BIO_ERROR);
    }
  });

  it("LinkedIn: only the exact form is stored, every other form is refused with nothing changed", async () => {
    for (const example of STORED_EXAMPLES) {
      const before = await profiles();
      const saving = setProfile(alice, "Alice", null, example.url);
      if (example.ok) {
        await expect(saving, example.what).resolves.toBeDefined();
      } else {
        await expect(saving, example.what).rejects.toThrow(LINK_ERROR);
        expect(await profiles(), example.what).toEqual(before);
      }
    }
  });

  it("checks the fields in the order of the form, and refuses all three together", async () => {
    const before = await profiles();
    await expect(setProfile(alice, " x", "\n", "javascript:alert(1)")).rejects.toThrow(NAME_ERROR);
    await expect(setProfile(alice, "Alice", "\n", "javascript:alert(1)")).rejects.toThrow(BIO_ERROR);
    await expect(setProfile(alice, "Alice", "Hi", "javascript:alert(1)")).rejects.toThrow(LINK_ERROR);
    expect(await profiles()).toEqual(before);
  });

  it("needs a signed-in user; the columns cannot be written directly, and the checks hold for the table's owner", async () => {
    await expect(db.admin("select app.set_profile('A', null, null)")).rejects.toThrow("not signed in");
    await expect(as(alice, "update app.profiles set bio = 'x'")).rejects.toThrow(/permission denied/);
    await expect(as(alice, "update app.profiles set linkedin_url = $1", [LINK])).rejects.toThrow(/permission denied/);
    await expect(db.admin("update app.profiles set bio = 'a\nb' where id = $1", [alice])).rejects.toThrow(/profiles_bio_form/);
    await expect(db.admin("update app.profiles set bio = '' where id = $1", [alice])).rejects.toThrow(/profiles_bio_form/);
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "https://evil.example/in/alice", "https://www.linkedin.com/company/x"]) {
      await expect(db.admin("update app.profiles set linkedin_url = $1 where id = $2", [bad, alice])).rejects.toThrow(/profiles_linkedin_url_form/);
    }
  });

  it("only signed-in users may call it, never anonymous visitors", async () => {
    const [rights] = await db.admin<{ anon: boolean; authenticated: boolean }>(
      `select has_function_privilege('anon', 'app.set_profile(text, text, text)', 'execute') as anon,
              has_function_privilege('authenticated', 'app.set_profile(text, text, text)', 'execute') as authenticated`,
    );
    expect(rights).toEqual({ anon: false, authenticated: true });
    const [card] = await db.admin<{ anon: boolean }>("select has_function_privilege('anon', 'app.profile_card(uuid)', 'execute') as anon");
    expect(card.anon).toBe(false);
  });
});

describe("app.profile_card", () => {
  beforeEach(async () => {
    await setProfile(alice, "Alice Martins", "Statistics at Nova", LINK);
  });

  const ALICE = () => ({
    user_id: alice,
    display_name: "Alice Martins",
    bio: "Statistics at Nova",
    linkedin_url: LINK,
    time_zone: "America/New_York",
    photo_at: null,
    email: "alice@example.com",
  });

  it("gives the user their own card, with the time zone from their settings", async () => {
    expect(await card(alice, alice)).toEqual([ALICE()]);
    const [bobs] = await card(bob, bob);
    expect(bobs).toMatchObject({ display_name: null, bio: null, linkedin_url: null, time_zone: "Europe/Lisbon", email: "bob@example.com" });
  });

  it("gives a contact the whole card with the e-mail address, and follows the time zone when it changes", async () => {
    await connect(alice, bob, "bob@example.com");
    expect(await card(bob, alice)).toEqual([ALICE()]);
    await as(alice, "update app.settings set time_zone = 'Asia/Tokyo'");
    expect((await card(bob, alice))[0].time_zone).toBe("Asia/Tokyo");
  });

  it("gives someone invited the inviter's card while the invitation is open, and the inviter nothing of them", async () => {
    await setProfile(bob, "Bob", "Bob's bio", null);
    await invite(alice, "bob@example.com");
    expect(await card(bob, alice)).toEqual([ALICE()]);
    expect(await card(alice, bob)).toEqual([]);
    await answer(bob, await receivedId(bob), false);
    expect(await card(bob, alice)).toEqual([]);
  });

  it("gives a third user, a removed contact, an unknown id and nobody signed in no row", async () => {
    expect(await card(carol, alice)).toEqual([]);
    expect(await card(carol, "00000000-0000-4000-8000-000000000000")).toEqual([]);
    await connect(alice, bob, "bob@example.com");
    const [contact] = await as<{ id: string }>(bob, "select id from app.contacts");
    await as(bob, "select app.remove_contact($1::uuid)", [contact.id]);
    expect(await card(bob, alice)).toEqual([]);
    expect(await db.admin("select * from app.profile_card($1::uuid)", [alice])).toEqual([]);
  });

  it("gives people who only share a list nothing of the card (they keep the name and photo inside the list)", async () => {
    await connect(alice, bob, "bob@example.com");
    await connect(alice, carol, "carol@example.com");
    const [{ id: list }] = await as<{ id: string }>(alice, "select app.create_list('Flat') as id");
    for (const user of [bob, carol]) {
      const [contact] = await as<{ id: string }>(alice, "select id from app.contacts where $1 in (user_a, user_b)", [user]);
      await as(alice, "select app.add_list_member($1::uuid, $2::uuid)", [list, contact.id]);
    }
    // Bob and Carol share the list but are not contacts of each other.
    expect((await as(bob, "select user_id from app.list_people($1::uuid)", [list])).length).toBe(3);
    expect(await card(bob, carol)).toEqual([]);
    expect(await card(carol, bob)).toEqual([]);
  });
});
