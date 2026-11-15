// The calendar page's guests as people (spec 35): the loader matches the shown events' guest addresses
// against the signed-in user's own contacts only, and sends address → id, name, photo for those. A
// stranger's address, a contact who is no guest, someone who only invited the user, the demo contacts
// and another user's contacts are never part of it. No extra transaction.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "@test/support/app";
import { countingWithUser } from "@test/support/counting";
import { readPeople } from "@/lib/server/profiles/cards";
import { loadCalendarPageWithShares } from "./load";

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

/** Ana and Ben become contacts; Carl only invites Ana; Dora is nobody to Ana. */
async function people() {
  const dora = await app.signedInAs("dora@example.com");
  const carl = await app.signedInAs("carl@example.com");
  const ben = await app.signedInAs("ben@example.com");
  const ana = await app.signedInAs("ana@example.com");
  await app.db.withUser(ana, (q) => q("select app.invite_contact('ben@example.com')"));
  const received = (await app.db.withUser(ben, readPeople)).received[0];
  await app.db.withUser(ben, (q) => q("select app.answer_invitation($1::uuid, true)", [received.id]));
  await app.db.withUser(carl, (q) => q("select app.invite_contact('ana@example.com')"));
  await app.db.admin("update app.profiles set display_name = 'Ben Brown' where id = $1", [ben]);
  return { ana, ben, carl, dora };
}

async function anasEvent(ana: string, guests: string[], organizer: string | null = null) {
  await app.db.admin(
    `insert into app.events (user_id, title, start_at, end_at, guests, organizer, source, outlook_id)
     values ($1, 'Group work', '2026-11-17T09:00:00Z', '2026-11-17T10:00:00Z', $2, $3, $4, $5)`,
    [ana, guests, organizer, organizer ? "outlook" : "app", organizer ? `outlook-${guests.length}` : null],
  );
}

describe("loadCalendarPageWithShares: guests as people", () => {
  it("gives a contact who is a guest, by address, with id, name and photo only; one transaction", async () => {
    const { ana, ben } = await people();
    await anasEvent(ana, ["ben@example.com", "stranger@example.com", "carl@example.com", "dora@example.com"]);
    const { withUser, transactions } = countingWithUser(app.db);
    const page = await loadCalendarPageWithShares({ ...app.deps, withUser }, ana, "2026-11-17", "week");
    // As before spec 35: one transaction to settle old tasks (R33), one for every read of the page.
    expect(transactions).toHaveLength(2);
    expect(page.guestPeople).toEqual({ "ben@example.com": { userId: ben, name: "Ben Brown", photoUrl: null } });
    expect(Object.keys(page.guestPeople["ben@example.com"]).sort()).toEqual(["name", "photoUrl", "userId"]);
  });

  it("also an Outlook event's organizer who is a contact", async () => {
    const { ana, ben } = await people();
    await anasEvent(ana, ["ana@example.com"], "ben@example.com");
    expect((await loadCalendarPageWithShares(app.deps, ana, "2026-11-17", "week")).guestPeople).toEqual({
      "ben@example.com": { userId: ben, name: "Ben Brown", photoUrl: null },
    });
  });

  it("nothing for a contact who is no guest of a shown event, nor for events outside the shown days", async () => {
    const { ana } = await people();
    await anasEvent(ana, ["stranger@example.com"]);
    expect((await loadCalendarPageWithShares(app.deps, ana, "2026-11-17", "week")).guestPeople).toEqual({});
    await anasEvent(ana, ["ben@example.com"]);
    expect((await loadCalendarPageWithShares(app.deps, ana, "2026-12-15", "week")).guestPeople).toEqual({});
  });

  it("nothing of another user's contacts, also with the same guest address on their own event", async () => {
    const { ana, dora } = await people();
    await anasEvent(dora, ["ben@example.com"]);
    expect((await loadCalendarPageWithShares(app.deps, dora, "2026-11-17", "week")).guestPeople).toEqual({});
    expect((await loadCalendarPageWithShares(app.deps, ana, "2026-11-17", "week")).guestPeople).toEqual({});
  });

  it("the demo contacts never match (they have no address)", async () => {
    const { ana } = await people();
    await app.db.withUser(ana, (q) => q("select app.set_demo_contacts(true)"));
    await anasEvent(ana, ["demo-lea@example.com", "lea@example.com"]);
    expect((await loadCalendarPageWithShares(app.deps, ana, "2026-11-17", "week")).guestPeople).toEqual({});
  });
});
