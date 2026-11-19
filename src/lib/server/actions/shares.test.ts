// Tests for the actions of spec 53 (from spec 29): set_share, reading a shared calendar, the loader that
// lists who shares their calendar with the user, and that the coach never receives anything of another
// user (R22). Accepted and rejected case for each rule; a rejection changes nothing (R1). The answers'
// keys are checked against an allow-list, so a new key fails a test.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, OWN_ORIGIN, postJson, read, type TestApp } from "@test/support/app";
import { setPlan } from "@test/support/chat";
import { readPeople } from "@/lib/server/profiles/cards";
import { loadCalendarPageWithShares, loadPeoplePage } from "@/lib/server/pages/load";
import { SHARED_CALENDAR_KEYS, SHARED_EVENT_KEYS } from "@/lib/shares/types";
import { sendMessage } from "./send-message";
import { setShare, sharedCalendar } from "./shares";

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
const UNKNOWN = "00000000-0000-4000-8000-000000000000";

const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(`${OWN_ORIGIN}${path}`, { method: "GET", headers: { host: "localhost:3000", "sec-fetch-site": "same-origin", ...headers } });
const share = (contactId: string, body: unknown, headers?: Record<string, string>) =>
  setShare(postJson(`/api/contacts/${contactId}/share`, body, headers), app.deps, contactId);
const calendar = (owner: string, from = "2026-11-16T00:00:00.000Z", to = "2026-11-23T00:00:00.000Z", headers?: Record<string, string>) =>
  sharedCalendar(get(`/api/shares/${owner}/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, headers), app.deps, owner);

/** Ana and Ben become contacts (in the database, as the actions of spec 28 do); Ben is signed in at the end. */
async function contacts(): Promise<{ ana: string; ben: string; carl: string; contact: string }> {
  const carl = await app.signedInAs("carl@example.com");
  const ben = await app.signedInAs("ben@example.com");
  const ana = await app.signedInAs("ana@example.com");
  await app.db.withUser(ana, (q) => q("select app.invite_contact('ben@example.com')"));
  const received = (await app.db.withUser(ben, readPeople)).received[0];
  await app.db.withUser(ben, (q) => q("select app.answer_invitation($1::uuid, true)", [received.id]));
  const contact = (await app.db.withUser(ana, readPeople)).contacts[0].id;
  await app.signedInAs("ben@example.com");
  return { ana, ben, carl, contact };
}

async function seedAnasWeek(ana: string) {
  await app.db.admin(
    `insert into app.events (user_id, title, start_at, end_at, location, notes, guests) values
       ($1, 'Statistics exam', '2026-11-17T09:00:00Z', '2026-11-17T11:00:00Z', 'Nova SBE', 'Bring the calculator', '{lea@example.com}'),
       ($1, 'Study group', '2026-11-17T10:00:00Z', '2026-11-17T12:00:00Z', null, null, null)`,
    [ana],
  );
  await app.db.admin("insert into app.events (user_id, title, all_day, first_day, last_day) values ($1, 'Exam week', true, '2026-11-16', '2026-11-18')", [ana]);
  await app.db.admin("insert into app.events (user_id, title, start_at, end_at, demo) values ($1, 'Demo block', '2026-11-18T09:00:00Z', '2026-11-18T10:00:00Z', true)", [ana]);
}

/** Every key of an object (and of each object in its lists), so an unexpected key shows. */
function keysOf(value: unknown): Set<string> {
  const keys = new Set<string>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") for (const [k, inner] of Object.entries(v)) {
      keys.add(k);
      walk(inner);
    }
  };
  walk(value);
  return keys;
}

describe("set_share (R55)", () => {
  it("the owner saves what a contact sees; both directions are separate; the People page shows both", async () => {
    const { ana, ben, contact } = await contacts();
    await app.signedInAs("ana@example.com");
    expect(await read(await share(contact, { calendar: "busy", focus: false }))).toEqual({
      status: 200,
      body: { message: "Sharing saved.", calendar: "busy", focus: false },
    });
    const anaPage = await loadPeoplePage(app.deps, ana);
    expect(anaPage.shares).toEqual([{ contactId: contact, userId: ben, out: { calendar: "busy", focus: false }, in: { calendar: "none", focus: false } }]);
    const benPage = await loadPeoplePage(app.deps, ben);
    expect(benPage.shares).toEqual([{ contactId: contact, userId: ana, out: { calendar: "none", focus: false }, in: { calendar: "busy", focus: false } }]);
    // Off again: nothing is shared.
    expect((await share(contact, { calendar: "none", focus: false })).status).toBe(200);
    expect((await loadPeoplePage(app.deps, ben)).shares).toEqual([]);
  });

  it("refuses a third user, an unknown or malformed id, a wrong body, another site and no session; nothing changes", async () => {
    const { contact } = await contacts();
    await app.signedInAs("ana@example.com");
    await share(contact, { calendar: "details", focus: false });
    await app.signedInAs("carl@example.com");
    const before = await app.snapshot();
    expect(await read(await share(contact, { calendar: "details", focus: true }))).toEqual(NOT_FOUND);
    expect(await read(await share(UNKNOWN, { calendar: "details", focus: true }))).toEqual(NOT_FOUND);
    expect(await read(await share("not-an-id", { calendar: "details", focus: true }))).toEqual(NOT_FOUND);
    expect((await share(contact, { calendar: "everything", focus: true })).status).toBe(400);
    expect((await share(contact, { calendar: "busy", focus: "yes" })).status).toBe(400);
    expect((await share(contact, { calendar: "busy", focus: true }, CROSS_SITE)).status).toBe(403);
    expect(await app.snapshot()).toEqual(before);
    await app.auth.signOut();
    expect((await share(contact, { calendar: "busy", focus: true })).status).toBe(401);
  });
});

describe("the focus flag stays as stored (R55, security review I4)", () => {
  /** Ana's stored share towards Ben, straight from the table. */
  const stored = async (ana: string) =>
    app.db.admin<{ calendar: string; focus: boolean }>("select calendar, focus from app.shares where owner = $1", [ana]);

  it("a body with focus: true does not switch the flag on; a body without focus is accepted", async () => {
    const { ana, contact } = await contacts();
    await app.signedInAs("ana@example.com");
    expect(await read(await share(contact, { calendar: "busy", focus: true }))).toEqual({
      status: 200,
      body: { message: "Sharing saved.", calendar: "busy", focus: false },
    });
    expect(await stored(ana)).toEqual([{ calendar: "busy", focus: false }]);
    expect(await read(await share(contact, { calendar: "details" }))).toEqual({
      status: 200,
      body: { message: "Sharing saved.", calendar: "details", focus: false },
    });
    expect(await stored(ana)).toEqual([{ calendar: "details", focus: false }]);
    // Off with focus: true in the body: the row goes, the flag is not switched on.
    expect((await share(contact, { calendar: "none", focus: true })).status).toBe(200);
    expect(await stored(ana)).toEqual([]);
  });

  it("a stored flag that is true is kept when the level changes, also to none", async () => {
    const { ana, ben, contact } = await contacts();
    await app.db.admin("insert into app.shares (contact_id, owner, viewer, calendar, focus) values ($1, $2, $3, 'busy', true)", [contact, ana, ben]);
    await app.signedInAs("ana@example.com");
    expect(await read(await share(contact, { calendar: "details", focus: false }))).toEqual({
      status: 200,
      body: { message: "Sharing saved.", calendar: "details", focus: true },
    });
    expect(await stored(ana)).toEqual([{ calendar: "details", focus: true }]);
    expect((await share(contact, { calendar: "none", focus: false })).status).toBe(200);
    expect(await stored(ana)).toEqual([{ calendar: "none", focus: true }]);
    expect((await share(contact, { calendar: "busy" })).status).toBe(200);
    expect(await stored(ana)).toEqual([{ calendar: "busy", focus: true }]);
  });
});

describe("reading a shared calendar (R56)", () => {
  it("busy: blocks with times only, merged, no demo events; only the allowed keys", async () => {
    const { ana, contact } = await contacts();
    await seedAnasWeek(ana);
    await app.signedInAs("ana@example.com");
    await share(contact, { calendar: "busy", focus: false });
    await app.signedInAs("ben@example.com");
    const answer = await read(await calendar(ana));
    expect(answer).toEqual({
      status: 200,
      body: {
        level: "busy",
        events: [
          { allDay: false, startAt: "2026-11-17T09:00:00.000Z", endAt: "2026-11-17T12:00:00.000Z" },
          { allDay: true, firstDay: "2026-11-16", lastDay: "2026-11-18" },
        ],
      },
    });
    expect(Object.keys(answer.body).sort()).toEqual([...SHARED_CALENDAR_KEYS].sort());
    for (const key of keysOf(answer.body.events)) expect(SHARED_EVENT_KEYS).toContain(key);
    expect(keysOf(answer.body.events).has("title")).toBe(false);
  });

  it("details: title and place too; never notes, guests, ids or anything else", async () => {
    const { ana, contact } = await contacts();
    await seedAnasWeek(ana);
    await app.signedInAs("ana@example.com");
    await share(contact, { calendar: "details", focus: false });
    await app.signedInAs("ben@example.com");
    const answer = await read(await calendar(ana));
    expect(answer.body).toEqual({
      level: "details",
      events: [
        { allDay: false, startAt: "2026-11-17T09:00:00.000Z", endAt: "2026-11-17T11:00:00.000Z", title: "Statistics exam", location: "Nova SBE" },
        { allDay: false, startAt: "2026-11-17T10:00:00.000Z", endAt: "2026-11-17T12:00:00.000Z", title: "Study group", location: null },
        { allDay: true, firstDay: "2026-11-16", lastDay: "2026-11-18", title: "Exam week", location: null },
      ],
    });
    for (const key of keysOf(answer.body)) expect([...SHARED_CALENDAR_KEYS, ...SHARED_EVENT_KEYS]).toContain(key);
    const text = JSON.stringify(answer.body);
    for (const secret of ["Bring the calculator", "lea@example.com", "Demo block", ana]) expect(text).not.toContain(secret);
  });

  it("removes invisible and direction-changing characters from titles and places; ordinary text stays (security review L4)", async () => {
    const { ana, contact } = await contacts();
    await app.db.admin(
      `insert into app.events (user_id, title, start_at, end_at, location) values
         ($1, $2, '2026-11-17T09:00:00Z', '2026-11-17T10:00:00Z', $3),
         ($1, 'Café with Zoë 🎉', '2026-11-18T09:00:00Z', '2026-11-18T10:00:00Z', 'Nova SBE, Carcavelos')`,
      [ana, "Lunch\u202Etxet\u200B break", "Room\u2066 B\uFEFF1"],
    );
    await app.signedInAs("ana@example.com");
    await share(contact, { calendar: "details" });
    await app.signedInAs("ben@example.com");
    const answer = await read(await calendar(ana));
    expect(answer.body.events).toEqual([
      { allDay: false, startAt: "2026-11-17T09:00:00.000Z", endAt: "2026-11-17T10:00:00.000Z", title: "Lunchtxet break", location: "Room B1" },
      { allDay: false, startAt: "2026-11-18T09:00:00.000Z", endAt: "2026-11-18T10:00:00.000Z", title: "Café with Zoë 🎉", location: "Nova SBE, Carcavelos" },
    ]);
  });

  it("answers 'Not found' alike for no share, a third user, an unknown and a malformed id; refuses a long window", async () => {
    const { ana, contact } = await contacts();
    await seedAnasWeek(ana);
    expect(await read(await calendar(ana))).toEqual(NOT_FOUND);
    await app.signedInAs("ana@example.com");
    await share(contact, { calendar: "none", focus: true });
    await app.signedInAs("ben@example.com");
    expect(await read(await calendar(ana))).toEqual(NOT_FOUND);
    expect(await read(await calendar(UNKNOWN))).toEqual(NOT_FOUND);
    expect(await read(await calendar("../events"))).toEqual(NOT_FOUND);
    await app.signedInAs("ana@example.com");
    await share(contact, { calendar: "details", focus: false });
    await app.signedInAs("carl@example.com");
    expect(await read(await calendar(ana))).toEqual(NOT_FOUND);
    await app.signedInAs("ben@example.com");
    const tooLong = { status: 400, body: { error: "share_window", message: "Choose at most 62 days" } };
    expect(await read(await calendar(ana, "2026-11-01T00:00:00.000Z", "2027-01-02T00:00:01.000Z"))).toEqual(tooLong);
    expect(await read(await calendar(ana, "2026-11-20T00:00:00.000Z", "2026-11-19T00:00:00.000Z"))).toEqual(tooLong);
    expect(await read(await calendar(ana, "yesterday", "2026-11-19T00:00:00.000Z"))).toEqual(tooLong);
    expect((await calendar(ana, undefined, undefined, CROSS_SITE)).status).toBe(403);
    await app.auth.signOut();
    expect((await calendar(ana)).status).toBe(401);
  });

  it("withdrawing or removing the contact stops it from the next request on", async () => {
    const { ana, contact } = await contacts();
    await seedAnasWeek(ana);
    await app.signedInAs("ana@example.com");
    await share(contact, { calendar: "busy", focus: true });
    await app.signedInAs("ben@example.com");
    expect((await calendar(ana)).status).toBe(200);
    await app.db.withUser(ana, (q) => q("select app.remove_contact($1::uuid)", [contact]));
    expect(await read(await calendar(ana))).toEqual(NOT_FOUND);
  });
});

describe("pages and the coach", () => {
  it("the calendar page lists who shares their calendar with the user, with name and photo address only", async () => {
    const { ana, ben, contact } = await contacts();
    await app.signedInAs("ana@example.com");
    await share(contact, { calendar: "details", focus: false });
    const page = await loadCalendarPageWithShares(app.deps, ben);
    expect(page.sharing).toEqual([{ userId: ana, name: "ana", photoUrl: null, calendar: "details", focus: false }]);
    // Ben's own week has none of Ana's events.
    expect(page.week.days.flatMap((d) => d.events)).toEqual([]);
    expect((await loadCalendarPageWithShares(app.deps, ana)).sharing).toEqual([]);
    // Only the focus flag (stored in the database, not offered by the app): not listed.
    await share(contact, { calendar: "none", focus: true });
    expect((await loadCalendarPageWithShares(app.deps, ben)).sharing).toEqual([]);
  });

  it("R22: the coach is never sent anything of another user, also with a calendar shared in details", async () => {
    const { ana, ben, contact } = await contacts();
    await seedAnasWeek(ana);
    await app.signedInAs("ana@example.com");
    await share(contact, { calendar: "details", focus: true });
    await app.signedInAs("ben@example.com");
    await setPlan(app.db, ben, "pro");
    expect((await sendMessage(postJson("/api/chat/messages", { text: "What is on this week?" }), app.deps)).status).toBe(201);
    const sent = JSON.stringify(app.assistant.requests);
    for (const secret of ["Statistics exam", "Study group", "Exam week", "Nova SBE", "ana@example.com", ana]) expect(sent).not.toContain(secret);
  });
});
