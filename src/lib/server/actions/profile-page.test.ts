// Tests for spec 31 on the server: the action save_profile, the sidebar's own card, and the page loaders
// of /profile and /people/[id]. Accepted and rejected case for each rule; a rejection changes nothing
// (R1); every answer has exactly the keys it should (an allow-list), so nothing else of a profile or the
// settings can slip out.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { countingWithUser } from "@test/support/counting";
import { readPeople } from "@/lib/server/profiles/cards";
import { loadPersonPage, loadProfilePage } from "@/lib/server/pages/load";
import { answerInvitation, removeContact } from "./contacts";
import { inviteContact } from "./invite-contact";
import { ownSidebarCard, saveProfile } from "./save-profile";

let app: TestApp;
let client = 0;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.reset();
  client += 1;
});

const CROSS_SITE = { origin: "https://evil.example", "sec-fetch-site": "cross-site" };
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  postJson(path, body, { "x-forwarded-for": `10.1.0.${client}`, ...headers });

const save = (body: unknown, headers?: Record<string, string>) => saveProfile(post("/api/profile", body, headers), app.deps);
const invite = (email: string) => inviteContact(post("/api/contacts/invite", { email }), app.deps);
const people = (user: string) => app.db.withUser(user, readPeople);

const LINK = "https://www.linkedin.com/in/alice-martins";
const FULL = { displayName: "Alice Martins", bio: "Statistics at Nova", linkedin: "linkedin.com/in/alice-martins/" };

const keys = (value: object) => Object.keys(value).sort();
const CARD_KEYS = ["bio", "displayName", "email", "linkedinUrl", "name", "photoUrl", "timeZone", "userId"];

/** Alice and Bob become contacts; the session ends with Bob. */
async function contacts(): Promise<{ alice: string; bob: string }> {
  const bob = await app.signedInAs("bob@example.com");
  const alice = await app.signedInAs("alice@example.com", { timeZone: "America/New_York" });
  await invite("bob@example.com");
  await app.signedInAs("bob@example.com");
  const id = (await people(bob)).received[0].id;
  await answerInvitation(post(`/api/contacts/invitations/${id}/answer`, { accept: true }), app.deps, id);
  return { alice, bob };
}

describe("save_profile", () => {
  it("saves the trimmed name, the bio and the link in its one stored form, and answers with exactly those", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const answer = await read(await save({ displayName: "  Alice Martins ", bio: " Statistics at Nova 📊 ", linkedin: "http://de.linkedin.com/in/alice-martins/" }));
    expect(answer).toEqual({
      status: 200,
      body: { message: "Profile saved.", profile: { displayName: "Alice Martins", bio: "Statistics at Nova 📊", linkedinUrl: LINK } },
    });
    const [row] = await app.db.admin("select display_name, bio, linkedin_url from app.profiles where id = $1", [alice]);
    expect(row).toEqual({ display_name: "Alice Martins", bio: "Statistics at Nova 📊", linkedin_url: LINK });
  });

  it("empty bio and link clear them; an empty name is fine only while none was ever set", async () => {
    const bob = await app.signedInAs("bob@example.com");
    expect(await read(await save({ displayName: "", bio: "Hi", linkedin: "" }))).toEqual({
      status: 200,
      body: { message: "Profile saved.", profile: { displayName: null, bio: "Hi", linkedinUrl: null } },
    });
    await save(FULL);
    expect((await read(await save({ displayName: "Bob", bio: "  ", linkedin: " " }))).body.profile).toEqual({ displayName: "Bob", bio: null, linkedinUrl: null });
    const before = await app.snapshot();
    expect(await read(await save({ displayName: "", bio: "", linkedin: "" }))).toEqual({
      status: 400,
      body: { error: "invalid_name", message: "Name must be 1 to 40 characters, without control characters" },
    });
    expect(await app.snapshot()).toEqual(before);
    expect((await people(bob)).me.name).toBe("Bob");
  });

  it("refuses each wrong field with its own code and message; nothing changes", async () => {
    await app.signedInAs("alice@example.com");
    await save(FULL);
    const before = await app.snapshot();
    const NAME = { error: "invalid_name", message: "Name must be 1 to 40 characters, without control characters" };
    const BIO = { error: "invalid_bio", message: "A bio must be 1 to 160 characters on one line, without control characters" };
    const LINK_ERR = { error: "invalid_linkedin", message: "Enter a LinkedIn profile link, like https://www.linkedin.com/in/your-name" };
    const cases: Array<[Record<string, string>, object]> = [
      [{ ...FULL, displayName: "a".repeat(41) }, NAME],
      [{ ...FULL, displayName: "Ali‮ce" }, NAME],
      [{ ...FULL, bio: "a".repeat(161) }, BIO],
      [{ ...FULL, bio: "Line one\nline two" }, BIO],
      [{ ...FULL, bio: "Hi​there" }, BIO],
      [{ ...FULL, linkedin: "javascript:alert(1)" }, LINK_ERR],
      [{ ...FULL, linkedin: "data:text/html,<script>alert(1)</script>" }, LINK_ERR],
      [{ ...FULL, linkedin: "https://evil.example/in/alice-martins" }, LINK_ERR],
      [{ ...FULL, linkedin: "https://www.linkedin.com/company/lockedin" }, LINK_ERR],
      // The first wrong field in the order of the form wins.
      [{ displayName: "", bio: "\n", linkedin: "javascript:alert(1)" }, NAME],
    ];
    for (const [body, error] of cases) expect(await read(await save(body))).toEqual({ status: 400, body: error });
    expect(await app.snapshot()).toEqual(before);
  });

  it("refuses another site, no session, a wrong body and a body that is too large; nothing changes", async () => {
    expect((await save(FULL)).status).toBe(401);
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    expect((await save(FULL, CROSS_SITE)).status).toBe(403);
    expect((await save({ displayName: "Alice", bio: 42, linkedin: "" })).status).toBe(400);
    expect((await save({ displayName: "Alice" })).status).toBe(400);
    expect((await save({ ...FULL, bio: "a".repeat(17 * 1024) })).status).toBe(413);
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("the sidebar's own card", () => {
  it("gives the shown name and the photo address only", async () => {
    expect((await ownSidebarCard(app.deps)).status).toBe(401);
    await app.signedInAs("alice@example.com");
    expect(await read(await ownSidebarCard(app.deps))).toEqual({ status: 200, body: { name: "alice", photoUrl: null } });
    await save({ ...FULL, displayName: "Alice Martins" });
    const answer = await read(await ownSidebarCard(app.deps));
    expect(keys(answer.body)).toEqual(["name", "photoUrl"]);
    expect(answer.body.name).toBe("Alice Martins");
  });
});

describe("the page loaders of spec 31", () => {
  it("/profile: one transaction, the user's own card with the time zone from the settings, nothing else", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "America/New_York" });
    await save(FULL);
    const { withUser, transactions } = countingWithUser(app.db);
    const page = await loadProfilePage({ withUser, now: app.deps.now }, alice);
    expect(transactions).toHaveLength(1);
    expect(keys(page)).toEqual(["display", "now", "profile"]);
    expect(keys(page.profile)).toEqual(CARD_KEYS);
    expect(page.profile).toEqual({
      userId: alice,
      displayName: "Alice Martins",
      name: "Alice Martins",
      email: "alice@example.com",
      photoUrl: null,
      bio: "Statistics at Nova",
      linkedinUrl: LINK,
      timeZone: "America/New_York",
    });
    expect(page.now).toBe(app.now().toISOString());
  });

  it("/people/[id]: a contact's whole card with their time zone and address, in one transaction", async () => {
    const { alice, bob } = await contacts();
    await app.signedInAs("alice@example.com");
    await save(FULL);
    const { withUser, transactions } = countingWithUser(app.db);
    const page = await loadPersonPage({ withUser, now: app.deps.now }, bob, alice);
    expect(transactions).toHaveLength(1);
    expect(page).not.toBeNull();
    expect(keys(page!)).toEqual(["display", "me", "now", "person"]);
    expect(keys(page!.person)).toEqual(CARD_KEYS);
    expect(page!.person).toMatchObject({ userId: alice, name: "Alice Martins", email: "alice@example.com", bio: "Statistics at Nova", linkedinUrl: LINK, timeZone: "America/New_York" });
    expect(page!.me).toEqual({ name: "bob", photoUrl: null });
  });

  it("/people/[id]: the same null for a stranger, a removed contact, an unknown id and a malformed one", async () => {
    const { alice, bob } = await contacts();
    const carol = await app.signedInAs("carol@example.com");
    expect(await loadPersonPage(app.deps, carol, alice)).toBeNull();
    expect(await loadPersonPage(app.deps, carol, "00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(await loadPersonPage(app.deps, carol, "not-a-uuid")).toBeNull();
    expect(await loadPersonPage(app.deps, carol, "' or 1=1 --")).toBeNull();
    await app.signedInAs("bob@example.com");
    const contactId = (await people(bob)).contacts[0].id;
    await removeContact(post(`/api/contacts/${contactId}/remove`, {}), app.deps, contactId);
    expect(await loadPersonPage(app.deps, bob, alice)).toBeNull();
  });

  it("/people/[id]: someone invited sees the inviter, the inviter sees nothing of them until they accept", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const alice = await app.signedInAs("alice@example.com");
    await invite("bob@example.com");
    expect((await loadPersonPage(app.deps, bob, alice))?.person.email).toBe("alice@example.com");
    expect(await loadPersonPage(app.deps, alice, bob)).toBeNull();
  });

  it("a link that somehow broke the rule would not be shown (checked again when read)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    // Only the table's owner could store this, and only by taking the check away first.
    await app.db.admin("alter table app.profiles drop constraint profiles_linkedin_url_form");
    try {
      await app.db.admin("update app.profiles set linkedin_url = 'javascript:alert(1)' where id = $1", [alice]);
      expect((await loadProfilePage(app.deps, alice)).profile.linkedinUrl).toBeNull();
    } finally {
      await app.db.admin("update app.profiles set linkedin_url = null where id = $1", [alice]);
      await app.db.admin(
        "alter table app.profiles add constraint profiles_linkedin_url_form check (linkedin_url is null or app.linkedin_url_valid(linkedin_url))",
      );
    }
  });
});
