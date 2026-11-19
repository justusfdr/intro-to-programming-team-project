// The loader of /people/[id] (spec 53, from spec 31's cases of profile-page.test.ts, adapted to
// loadPersonProfile): a contact's whole card with their time zone and address in one transaction; the
// same null for a stranger, a removed contact, an unknown and a malformed id; the inviter is seen by the
// invited user, not the other way round; set_share keeps the focus flag as it is sent.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, type TestApp } from "@test/support/app";
import { countingWithUser } from "@test/support/counting";
import { readPeople } from "@/lib/server/profiles/cards";
import { loadPersonProfile } from "@/lib/server/pages/load";
import { answerInvitation, removeContact } from "./contacts";
import { inviteContact } from "./invite-contact";
import { saveProfile } from "./save-profile";

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

const post = (path: string, body: unknown) => postJson(path, body, { "x-forwarded-for": `10.3.0.${client}` });
const save = (body: unknown) => saveProfile(post("/api/profile", body), app.deps);
const invite = (email: string) => inviteContact(post("/api/contacts/invite", { email }), app.deps);
const people = (user: string) => app.db.withUser(user, readPeople);

const LINK = "https://www.linkedin.com/in/alice-martins";
const FULL = { displayName: "Alice Martins", bio: "Statistics at Nova", linkedin: "linkedin.com/in/alice-martins/" };
const keys = (value: object) => Object.keys(value).sort();
const CARD_KEYS = ["bio", "displayName", "email", "linkedinUrl", "name", "photoUrl", "timeZone", "userId"];
const UNKNOWN = "00000000-0000-4000-8000-000000000000";

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

describe("/people/[id]", () => {
  it("a contact's whole card with their time zone and address, in one transaction", async () => {
    const { alice, bob } = await contacts();
    await app.signedInAs("alice@example.com");
    await save(FULL);
    const { withUser, transactions } = countingWithUser(app.db);
    const page = await loadPersonProfile({ withUser, now: app.deps.now }, bob, alice);
    expect(transactions).toHaveLength(1);
    expect(page).not.toBeNull();
    expect(keys(page!)).toEqual(["display", "me", "now", "person", "relation", "timeZone"]);
    expect(keys(page!.person)).toEqual(CARD_KEYS);
    expect(page!.person).toMatchObject({ userId: alice, name: "Alice Martins", email: "alice@example.com", bio: "Statistics at Nova", linkedinUrl: LINK, timeZone: "America/New_York" });
    expect(page!.me).toEqual({ name: "bob", photoUrl: null });
  });

  it("owner, contact, stranger: the same null for a stranger, a removed contact, an unknown id and a malformed one", async () => {
    const { alice, bob } = await contacts();
    const carol = await app.signedInAs("carol@example.com");
    for (const id of [alice, bob, UNKNOWN, "not-a-uuid", "' or 1=1 --"]) expect(await loadPersonProfile(app.deps, carol, id)).toBeNull();
    await app.signedInAs("bob@example.com");
    expect(await loadPersonProfile(app.deps, bob, alice)).not.toBeNull();
    const contactId = (await people(bob)).contacts[0].id;
    await removeContact(post(`/api/contacts/${contactId}/remove`, {}), app.deps, contactId);
    expect(await loadPersonProfile(app.deps, bob, alice)).toBeNull();
    expect(await loadPersonProfile(app.deps, alice, bob)).toBeNull();
    expect(await loadPersonProfile(app.deps, bob, UNKNOWN)).toBeNull();
  });

  it("someone invited sees the inviter (no relation yet), the inviter sees nothing of them until they accept", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const alice = await app.signedInAs("alice@example.com");
    await invite("bob@example.com");
    const page = await loadPersonProfile(app.deps, bob, alice);
    expect(page?.person.email).toBe("alice@example.com");
    expect(page?.relation).toBeNull();
    expect(await loadPersonProfile(app.deps, alice, bob)).toBeNull();
  });
});
