// Tests for spec 32 on the server: switching the demo contacts on and off, the page loaders and read
// actions with them on and off, the refusals of every other route that takes a contact or user id, the
// "Remove the demo data" action, and that the coach never receives them (R22). Accepted and rejected
// case for each rule; a refusal changes nothing (R1). Answers are checked against allow-lists of keys.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, OWN_ORIGIN, postJson, read, type TestApp } from "@test/support/app";
import { setPlan } from "@test/support/chat";
import { countingWithUser } from "@test/support/counting";
import { DEMO_CARD_KEYS, DEMO_CONTACT_KEYS, DEMO_IDS, DEMO_PEOPLE, demoContacts } from "@/lib/demo/people";
import { readDemoContactsOn } from "@/lib/server/demo/people";
import { readPeople } from "@/lib/server/profiles/cards";
import {
  loadAnalyticsPageWithShares,
  loadAnyPersonPage,
  loadCalendarPageWithShares,
  loadDemoPersonPage,
  loadPeoplePage,
  loadSettingsPageAll,
} from "@/lib/server/pages/load";
import { FOCUS_DAY_KEYS, FOCUS_WEEK_KEYS, SHARED_CALENDAR_KEYS, SHARED_EVENT_KEYS, SHARED_FOCUS_KEYS } from "@/lib/shares/types";
import { answerInvitation, removeContact, withdrawInvitation } from "./contacts";
import { setDemoContacts } from "./demo-contacts";
import { deliverProfilePhoto } from "./deliver-photo";
import { inviteContact } from "./invite-contact";
import { removeDemo } from "./remove-demo";
import { sendMessage } from "./send-message";
import { setShare, sharedCalendar, sharedFocus } from "./shares";

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.reset(); // Monday 16 November 2026, 09:00 UTC
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const CROSS_SITE = { origin: "https://evil.example", "sec-fetch-site": "cross-site" };
const NOT_FOUND = { status: 404, body: { error: "not_found", message: "Not found" } };

const get = (path: string) =>
  new Request(`${OWN_ORIGIN}${path}`, { method: "GET", headers: { host: "localhost:3000", "sec-fetch-site": "same-origin" } });
const switchDemo = (on: unknown, headers?: Record<string, string>) => setDemoContacts(postJson("/api/demo/contacts", { on }, headers), app.deps);
const calendar = (owner: string, from = "2026-11-16T00:00:00.000Z", to = "2026-11-23T00:00:00.000Z") =>
  sharedCalendar(get(`/api/shares/${owner}/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`), app.deps, owner);
const focus = (owner: string) => sharedFocus(get(`/api/shares/${owner}/focus`), app.deps, owner);
const isOn = (user: string) => app.db.withUser(user, readDemoContactsOn);

const keys = (value: object) => Object.keys(value).sort();
const SHARING_KEYS = ["calendar", "demo", "focus", "name", "photoUrl", "userId"];
const REAL_SHARING_KEYS = ["calendar", "focus", "name", "photoUrl", "userId"];

/** A snapshot without the profiles table (where the choice itself is saved). */
function withoutProfiles(snapshot: Record<string, unknown>): Record<string, unknown> {
  const tables = { ...(snapshot.tables as Record<string, unknown>) };
  delete tables.profiles;
  return { ...snapshot, tables };
}

/** Ana shares her calendar (details) with Ben; Ben is signed in at the end. */
async function anaSharesWithBen(): Promise<{ ana: string; ben: string }> {
  const ben = await app.signedInAs("ben@example.com");
  const ana = await app.signedInAs("ana@example.com");
  await app.db.withUser(ana, (q) => q("select app.invite_contact('ben@example.com')"));
  const received = (await app.db.withUser(ben, readPeople)).received[0];
  await app.db.withUser(ben, (q) => q("select app.answer_invitation($1::uuid, true)", [received.id]));
  const contact = (await app.db.withUser(ana, readPeople)).contacts[0].id;
  await app.db.withUser(ana, (q) => q("select app.set_share($1::uuid, 'details', true)", [contact]));
  await app.signedInAs("ben@example.com");
  return { ana, ben };
}

describe("switching the demo contacts on and off", () => {
  it("on and off, saved for the user only, nothing else written", async () => {
    const other = await app.signedInAs("other@example.com");
    const ben = await app.signedInAs("ben@example.com");
    const before = await app.snapshot();
    expect(await read(await switchDemo(true))).toEqual({ status: 200, body: { message: "Demo contacts added.", on: true } });
    expect(await isOn(ben)).toBe(true);
    expect(await isOn(other)).toBe(false);
    // Only the user's own choice changed: no account, contact, share or anything else.
    expect(withoutProfiles(await app.snapshot())).toEqual(withoutProfiles(before));
    expect(await read(await switchDemo(false))).toEqual({ status: 200, body: { message: "Demo contacts removed.", on: false } });
    expect(await isOn(ben)).toBe(false);
  });

  it("refuses another site, a missing sign-in and a bad body, and changes nothing (R1)", async () => {
    await app.signedInAs("ben@example.com");
    const before = await app.snapshot();
    expect((await switchDemo(true, CROSS_SITE)).status).toBe(403);
    expect((await switchDemo("yes")).status).toBe(400);
    expect((await setDemoContacts(postJson("/api/demo/contacts", { on: true, extra: 1 }), app.deps)).status).toBe(400);
    app.auth.session = null;
    expect((await switchDemo(true)).status).toBe(401);
    expect(await app.snapshot()).toEqual({ ...before, session: null });
  });
});

describe("the loaders: demo contacts after the real people, only while on", () => {
  it("People page: off adds none, on adds the three with the allowed keys and no e-mail address, one transaction", async () => {
    const ben = await app.signedInAs("ben@example.com");
    expect((await loadPeoplePage(app.deps, ben)).demo).toEqual({ on: false, contacts: [] });
    await switchDemo(true);
    const { withUser, transactions } = countingWithUser(app.db);
    const page = await loadPeoplePage({ withUser }, ben);
    expect(transactions).toHaveLength(1);
    expect(page.demo).toEqual({ on: true, contacts: demoContacts() });
    expect(page.demo.contacts.map((c) => c.userId)).toEqual([...DEMO_IDS]);
    for (const contact of page.demo.contacts) expect(keys(contact)).toEqual([...DEMO_CONTACT_KEYS].sort());
    expect(JSON.stringify(page.demo)).not.toContain("@");
    // The real lists stay as they are: the demo contacts are not contacts.
    expect(page.people.contacts).toEqual([]);
    expect(page.shares).toEqual([]);
  });

  it("calendar and analytics: the real people first, then the demo people who share (calendar: Lea and Jonas; chart: Lea)", async () => {
    const { ana, ben } = await anaSharesWithBen();
    expect((await loadCalendarPageWithShares(app.deps, ben)).sharing.map((p) => p.userId)).toEqual([ana]);
    await switchDemo(true);
    const page = await loadCalendarPageWithShares(app.deps, ben);
    expect(page.sharing.map((p) => p.userId)).toEqual([ana, "demo-lea", "demo-jonas"]);
    expect(keys(page.sharing[0])).toEqual(REAL_SHARING_KEYS);
    for (const person of page.sharing.slice(1)) expect(keys(person)).toEqual(SHARING_KEYS);
    expect(page.week.days.flatMap((d) => d.events)).toEqual([]);
    const analytics = await loadAnalyticsPageWithShares(app.deps, ben);
    expect(analytics.sharing.map((p) => p.userId)).toEqual([ana, "demo-lea"]);
  });

  it("the demo profile page: the card without an e-mail address, only while on; null alike when off", async () => {
    const ben = await app.signedInAs("ben@example.com");
    for (const id of DEMO_IDS) {
      expect(await loadDemoPersonPage(app.deps, ben, id)).toBeNull();
      expect(await loadAnyPersonPage(app.deps, ben, id)).toBeNull();
    }
    await switchDemo(true);
    const { withUser, transactions } = countingWithUser(app.db);
    const page = await loadAnyPersonPage({ withUser, now: app.deps.now }, ben, "demo-lea");
    expect(transactions).toHaveLength(1);
    expect(page && keys(page)).toEqual(["display", "me", "now", "person", "shared"]);
    const person = page!.person;
    expect(keys(person)).toEqual([...DEMO_CARD_KEYS].sort());
    expect(person).toMatchObject({ demo: true, userId: "demo-lea", name: "Lea Sousa", timeZone: "Europe/Lisbon", linkedinUrl: "https://www.linkedin.com/in/lockedin-demo-lea" });
    expect(JSON.stringify(person)).not.toContain("@");
    // Only the exact ids; anything else still goes to the real loader and is "Not found".
    for (const id of ["DEMO-LEA", "demo-lea ", "demo-anna"]) expect(await loadAnyPersonPage(app.deps, ben, id)).toBeNull();
  });

  it("Remove the demo data also switches the demo contacts off, and Settings offers it while they are on", async () => {
    const ben = await app.signedInAs("ben@example.com");
    expect((await loadSettingsPageAll(app.deps, ben)).page.hasDemo).toBe(false);
    await switchDemo(true);
    expect((await loadSettingsPageAll(app.deps, ben)).page.hasDemo).toBe(true);
    expect((await removeDemo(postJson("/api/demo/remove", {}), app.deps)).status).toBe(200);
    expect(await isOn(ben)).toBe(false);
    expect((await loadSettingsPageAll(app.deps, ben)).page.hasDemo).toBe(false);
  });
});

describe("the read actions for the three demo ids", () => {
  it("off: every demo id is \"Not found\", exactly as an unknown id", async () => {
    await app.signedInAs("ben@example.com");
    for (const id of DEMO_IDS) {
      expect(await read(await calendar(id))).toEqual(NOT_FOUND);
      expect(await read(await focus(id))).toEqual(NOT_FOUND);
      // Also with a window that would be refused: the id is decided first.
      expect(await read(await calendar(id, "2026-11-16T00:00:00.000Z", "2027-02-16T00:00:00.000Z"))).toEqual(NOT_FOUND);
    }
  });

  it("on: Lea's calendar in details, Jonas's as free/busy, Maya's \"Not found\"; only allowed keys", async () => {
    await app.signedInAs("ben@example.com");
    await switchDemo(true);
    const lea = await read(await calendar("demo-lea"));
    expect(lea.status).toBe(200);
    expect(keys(lea.body)).toEqual([...SHARED_CALENDAR_KEYS].sort());
    expect(lea.body.level).toBe("details");
    const leaEvents = lea.body.events as Record<string, unknown>[];
    expect(leaEvents.length).toBe(DEMO_PEOPLE[0].week.length);
    for (const event of leaEvents) for (const key of Object.keys(event)) expect(SHARED_EVENT_KEYS).toContain(key);
    const jonas = await read(await calendar("demo-jonas"));
    expect(jonas.body.level).toBe("busy");
    for (const event of jonas.body.events as Record<string, unknown>[]) expect(keys(event)).toEqual(["allDay", "endAt", "startAt"]);
    expect(await read(await calendar("demo-maya"))).toEqual(NOT_FOUND);
    // The window rule of a real share holds (R48).
    expect(await read(await calendar("demo-lea", "2026-11-16T00:00:00.000Z", "2027-02-16T00:00:00.000Z"))).toEqual({
      status: 400,
      body: { error: "share_window", message: "Choose at most 62 days" },
    });
  });

  it("on: only Lea shares her focus chart (R49's shape); Jonas and Maya \"Not found\"", async () => {
    await app.signedInAs("ben@example.com");
    await switchDemo(true);
    const chart = await read(await focus("demo-lea"));
    expect(chart.status).toBe(200);
    expect(keys(chart.body)).toEqual([...SHARED_FOCUS_KEYS].sort());
    const weeks = chart.body.weeks as Record<string, unknown>[];
    expect(weeks).toHaveLength(8);
    expect(weeks[7].monday).toBe("2026-11-16");
    for (const week of weeks) expect(keys(week)).toEqual([...FOCUS_WEEK_KEYS].sort());
    for (const day of chart.body.days as Record<string, unknown>[]) expect(keys(day)).toEqual([...FOCUS_DAY_KEYS].sort());
    expect(await read(await focus("demo-jonas"))).toEqual(NOT_FOUND);
    expect(await read(await focus("demo-maya"))).toEqual(NOT_FOUND);
  });

  it("a demo contact has no photo: the same 404 on or off", async () => {
    await app.signedInAs("ben@example.com");
    const ben = app.auth.session!.userId;
    for (const on of [false, true]) {
      await switchDemo(on);
      for (const id of DEMO_IDS) {
        const answer = await deliverProfilePhoto(app.deps, id);
        expect(answer.status).toBe(404);
        expect(await answer.text()).toBe("Not found");
      }
    }
    expect(await isOn(ben)).toBe(true);
  });

  it("someone else's choice does not count: Carl without demo contacts gets \"Not found\"", async () => {
    await app.signedInAs("ben@example.com");
    await switchDemo(true);
    await app.signedInAs("carl@example.com");
    expect(await read(await calendar("demo-lea"))).toEqual(NOT_FOUND);
    expect(await read(await focus("demo-lea"))).toEqual(NOT_FOUND);
  });
});

describe("every other route that takes a contact or user id refuses the demo ids with its normal answer (R1)", () => {
  it("setting a share, removing a contact, answering and withdrawing an invitation, inviting", async () => {
    await app.signedInAs("ben@example.com");
    await switchDemo(true);
    const before = await app.snapshot();
    for (const id of DEMO_IDS) {
      expect(await read(await setShare(postJson(`/api/contacts/${id}/share`, { calendar: "details", focus: true }), app.deps, id))).toEqual(NOT_FOUND);
      expect(await read(await removeContact(postJson(`/api/contacts/${id}/remove`, {}), app.deps, id))).toEqual(NOT_FOUND);
      expect(await read(await answerInvitation(postJson(`/api/contacts/invitations/${id}/answer`, { accept: true }), app.deps, id))).toEqual(NOT_FOUND);
      expect(await read(await withdrawInvitation(postJson(`/api/contacts/invitations/${id}/withdraw`, {}), app.deps, id))).toEqual(NOT_FOUND);
    }
    // Inviting takes an address, and a demo id is none.
    expect(await read(await inviteContact(postJson("/api/contacts/invite", { email: "demo-lea" }, { "x-forwarded-for": "10.9.9.9" }), app.deps))).toEqual({
      status: 400,
      body: { error: "invalid_email", message: "Enter a valid email address" },
    });
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("the coach (R22)", () => {
  it("is never sent the demo contacts, their names or their events", async () => {
    const ben = await app.signedInAs("ben@example.com");
    await switchDemo(true);
    await setPlan(app.db, ben, "pro");
    expect((await sendMessage(postJson("/api/chat/messages", { text: "What is on this week, also for my contacts?" }), app.deps)).status).toBe(201);
    const sent = JSON.stringify(app.assistant.requests);
    for (const person of DEMO_PEOPLE) {
      for (const secret of [person.id, person.name, person.bio, person.linkedinUrl, ...person.week.map((s) => s.title)]) expect(sent).not.toContain(secret);
    }
  });
});
