// The loaders of spec 53 (from spec 33): the People page's cards get bio and time zone only of contacts
// and inviters (through app.profile_card, so R43 is checked for each), still in one transaction; a
// person's profile page gets their card, the viewer's time zone and the relation (contact row, what each
// shares), for a contact and an inviter, and the same null for everyone else (a stranger, a removed
// contact, an unknown or a malformed id). Allow-lists of keys.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "@test/support/app";
import { countingWithUser } from "@test/support/counting";
import { readPeople } from "@/lib/server/profiles/cards";
import { readProfileCards } from "@/lib/server/profiles/profile-card";
import { loadPeoplePage, loadPersonProfile } from "./load";

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

const keys = (value: object) => Object.keys(value).sort();

/** Ana (Berlin) and Ben are contacts, Ana shares her calendar as free/busy; Dora invited Ben; Carl is a stranger. */
async function setUp() {
  const carl = await app.signedInAs("carl@example.com", { timeZone: "America/New_York" });
  const dora = await app.signedInAs("dora@example.com");
  const ben = await app.signedInAs("ben@example.com");
  const ana = await app.signedInAs("ana@example.com", { timeZone: "Europe/Berlin" });
  await app.db.withUser(ana, (q) => q("select app.set_profile('Ana Silva', 'Statistics at Nova', null)"));
  await app.db.withUser(carl, (q) => q("select app.set_profile('Carl', 'A stranger', null)"));
  await app.db.withUser(ana, (q) => q("select app.invite_contact('ben@example.com')"));
  const received = (await app.db.withUser(ben, readPeople)).received[0];
  await app.db.withUser(ben, (q) => q("select app.answer_invitation($1::uuid, true)", [received.id]));
  const contact = (await app.db.withUser(ana, readPeople)).contacts[0].id;
  await app.db.withUser(ana, (q) => q("select app.set_share($1::uuid, 'busy', false)", [contact]));
  await app.db.withUser(dora, (q) => q("select app.invite_contact('ben@example.com')"));
  return { ana, ben, carl, dora, contact };
}

describe("the People page's cards", () => {
  it("bio and time zone of contacts and inviters only, in one transaction, with the allowed keys", async () => {
    const { ana, ben, dora } = await setUp();
    const { withUser, transactions } = countingWithUser(app.db);
    const page = await loadPeoplePage({ withUser, now: app.deps.now }, ben);
    expect(transactions).toHaveLength(1);
    expect(page.now).toBe(app.now().toISOString());
    expect(page.facts.map((f) => f.userId).sort()).toEqual([ana, dora].sort());
    for (const fact of page.facts) expect(keys(fact)).toEqual(["bio", "timeZone", "userId"]);
    expect(page.facts.find((f) => f.userId === ana)).toEqual({ userId: ana, bio: "Statistics at Nova", timeZone: "Europe/Berlin" });
    // Nothing of the stranger, and no address in the facts.
    expect(JSON.stringify(page.facts)).not.toContain("A stranger");
    expect(JSON.stringify(page.facts)).not.toContain("@");
  });

  it("the batch read gives nothing for a stranger, an unknown or a malformed id", async () => {
    const { ana, ben, carl } = await setUp();
    const cards = await app.db.withUser(ben, (q) => readProfileCards(q, [ana, carl, "00000000-0000-4000-8000-000000000000", "not-a-uuid", ana]));
    expect(cards.map((c) => c.userId)).toEqual([ana]);
    expect(await app.db.withUser(ben, (q) => readProfileCards(q, []))).toEqual([]);
  });
});

describe("a person's profile page with its sections", () => {
  it("a contact: the card, the viewer's time zone and what each shares, in one transaction", async () => {
    const { ana, ben, contact } = await setUp();
    const { withUser, transactions } = countingWithUser(app.db);
    const page = await loadPersonProfile({ withUser, now: app.deps.now }, ben, ana);
    expect(transactions).toHaveLength(1);
    expect(page && keys(page)).toEqual(["display", "me", "now", "person", "relation", "timeZone"]);
    expect(keys(page!.relation!)).toEqual(["contactId", "out", "shared"]);
    expect(page!.relation).toEqual({ contactId: contact, out: { calendar: "none", focus: false }, shared: { calendar: "busy", focus: false } });
    expect(page!.person).toMatchObject({ userId: ana, name: "Ana Silva", email: "ana@example.com", timeZone: "Europe/Berlin" });
    expect(page!.me).toEqual({ name: "ben", photoUrl: null });
    // And the other way round: Ana sees what she shares with Ben.
    const hers = await loadPersonProfile(app.deps, ana, ben);
    expect(hers!.relation).toEqual({ contactId: contact, out: { calendar: "busy", focus: false }, shared: { calendar: "none", focus: false } });
  });

  it("someone whose invitation is open: the card, no relation", async () => {
    const { ben, dora } = await setUp();
    const page = await loadPersonProfile(app.deps, ben, dora);
    expect(page!.person).toMatchObject({ userId: dora, email: "dora@example.com" });
    expect(page!.relation).toBeNull();
  });

  it("the same null for a stranger, a removed contact, an unknown id and a malformed one", async () => {
    const { ana, ben, carl, contact } = await setUp();
    expect(await loadPersonProfile(app.deps, ben, ana)).not.toBeNull();
    await app.db.withUser(ana, (q) => q("select app.remove_contact($1::uuid)", [contact]));
    for (const id of [carl, ana, "00000000-0000-4000-8000-000000000000", "not-a-uuid", "' or 1=1 --", "demo-lea"]) {
      expect(await loadPersonProfile(app.deps, ben, id)).toBeNull();
    }
    // And the other way round: Carl, a stranger, sees neither of them.
    for (const id of [ana, ben]) expect(await loadPersonProfile(app.deps, carl, id)).toBeNull();
  });
});
