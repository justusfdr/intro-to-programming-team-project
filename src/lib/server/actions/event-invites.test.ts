// Tests for the actions of spec 36 (event invitations, R59 to R64): set_event_invites, answering, the
// people of an event or an invitation, the invited events of a window, the badge count, the calendar
// page's loader, and that the coach is sent nothing of it (R22). Accepted and rejected case for each
// rule; a rejection changes nothing (R1). The answers' keys are checked against allow-lists, so a new key
// fails a test.
// The database decides "not ended" by its own clock, so the events here lie in 2030 (never ended),
// except where the coach's 14 days (from the fake clock's Monday 16 November 2026) are needed.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, OWN_ORIGIN, postJson, read, type TestApp } from "@test/support/app";
import { setPlan } from "@test/support/chat";
import { countingWithUser } from "@test/support/counting";
import { readPeople } from "@/lib/server/profiles/cards";
import { loadCalendarPageWithInvites } from "@/lib/server/pages/load";
import { INVITE_CONTACT_KEYS, INVITE_PERSON_CARD_KEYS, INVITE_PERSON_KEYS, INVITED_EVENT_KEYS } from "@/lib/invites/types";
import { answerEventInvite, eventInvitees, invitedEvents, invitePeople, pendingInviteCount, setEventInvites } from "./event-invites";
import { sendMessage } from "./send-message";

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
const setInvites = (eventId: string, contacts: unknown, headers?: Record<string, string>) =>
  setEventInvites(postJson(`/api/events/${eventId}/invites`, { contacts }, headers), app.deps, eventId);
const answer = (inviteId: string, value: unknown, headers?: Record<string, string>) =>
  answerEventInvite(postJson(`/api/invites/${inviteId}/answer`, { answer: value }, headers), app.deps, inviteId);
const windowRead = (from: string, to: string) =>
  invitedEvents(get(`/api/invites?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`), app.deps);

/** Ana is contacts with Ben and Dora; Carl is Ben's contact only. Ana is signed in at the end. */
async function people() {
  const carl = await app.signedInAs("carl@example.com");
  const dora = await app.signedInAs("dora@example.com");
  const ben = await app.signedInAs("ben@example.com");
  const ana = await app.signedInAs("ana@example.com");
  const befriend = async (a: string, b: string, bEmail: string) => {
    await app.db.withUser(a, (q) => q("select app.invite_contact($1)", [bEmail]));
    const received = (await app.db.withUser(b, readPeople)).received[0];
    await app.db.withUser(b, (q) => q("select app.answer_invitation($1::uuid, true)", [received.id]));
  };
  await befriend(ana, ben, "ben@example.com");
  await befriend(ana, dora, "dora@example.com");
  await befriend(ben, carl, "carl@example.com");
  await app.db.admin("update app.profiles set display_name = 'Ben Brown' where id = $1", [ben]);
  await app.db.admin("update app.profiles set display_name = 'Dora Dias' where id = $1", [dora]);
  const anas = (await app.db.withUser(ana, readPeople)).contacts;
  const bens = (await app.db.withUser(ben, readPeople)).contacts;
  return {
    ana,
    ben,
    carl,
    dora,
    anaBen: anas.find((c) => c.userId === ben)!.id,
    anaDora: anas.find((c) => c.userId === dora)!.id,
    benCarl: bens.find((c) => c.userId === carl)!.id,
  };
}

async function seedEvent(user: string, title: string, start = "2030-01-08T10:00:00Z", end = "2030-01-08T11:00:00Z", extra = ""): Promise<string> {
  const [row] = await app.db.admin<{ id: string }>(
    `insert into app.events (user_id, title, start_at, end_at, location, notes, guests ${extra ? ", series_id" : ""})
     values ($1, $2, $3::timestamptz, $4::timestamptz, 'Library, room 4', 'Secret notes', ${extra ? "null, gen_random_uuid()" : "'{lea@example.com}'"}) returning id`,
    [user, title, start, end],
  );
  return row.id;
}

const inviteOf = async (invitee: string) => (await app.db.admin<{ id: string }>("select id from app.event_invites where invitee = $1", [invitee]))[0].id;

function keysOf(value: unknown): Set<string> {
  const keys = new Set<string>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object")
      for (const [k, inner] of Object.entries(v)) {
        keys.add(k);
        walk(inner);
      }
  };
  walk(value);
  return keys;
}

describe("set_event_invites (R59)", () => {
  it("the owner invites contacts; the answer lists the people with name, photo address and answer only", async () => {
    const { ben, dora, anaBen, anaDora } = await people();
    const event = await seedEvent((await app.db.admin<{ id: string }>("select id from auth.users where email = 'ana@example.com'"))[0].id, "Group project meeting");
    const answered = await read(await setInvites(event, [anaBen, anaDora]));
    expect(answered.status).toBe(200);
    expect(answered.body.message).toBe("Invitations saved.");
    expect(answered.body.people).toEqual(
      expect.arrayContaining([
        { userId: ben, name: "Ben Brown", photoUrl: null, answer: "pending" },
        { userId: dora, name: "Dora Dias", photoUrl: null, answer: "pending" },
      ]),
    );
    for (const key of keysOf(answered.body.people)) expect(INVITE_PERSON_KEYS as readonly string[]).toContain(key);
    expect(JSON.stringify(answered.body)).not.toContain("@");
    // GET the same people.
    expect((await read(await eventInvitees(get(`/api/events/${event}/invites`), app.deps, event))).body.people).toEqual(answered.body.people);
  });

  it("refuses a non-contact's row, a foreign, unknown or malformed id, a bad body, another site and no session; nothing changes", async () => {
    const { ana, ben, anaBen, benCarl } = await people();
    const event = await seedEvent(ana, "Meeting");
    const bens = await seedEvent(ben, "Ben's");
    const before = await app.snapshot();
    expect(await read(await setInvites(event, [benCarl]))).toEqual(NOT_FOUND);
    expect(await read(await setInvites(event, [UNKNOWN]))).toEqual(NOT_FOUND);
    expect(await read(await setInvites(event, ["demo-lea"]))).toEqual(NOT_FOUND);
    expect(await read(await setInvites(bens, [anaBen]))).toEqual(NOT_FOUND);
    expect(await read(await setInvites(UNKNOWN, [anaBen]))).toEqual(NOT_FOUND);
    expect(await read(await setInvites("not-an-id", [anaBen]))).toEqual(NOT_FOUND);
    expect((await setInvites(event, "everyone")).status).toBe(400);
    expect((await setInvites(event, [anaBen], CROSS_SITE)).status).toBe(403);
    expect(await read(await eventInvitees(get(`/api/events/${bens}/invites`), app.deps, bens))).toEqual(NOT_FOUND);
    expect(await app.snapshot()).toEqual(before);
    await app.auth.signOut();
    expect((await setInvites(event, [anaBen])).status).toBe(401);
    expect(await app.db.admin("select * from app.event_invites")).toEqual([]);
  });

  it("refuses an event of a series and an ended event with the ontology's sentence", async () => {
    const { ana, anaBen } = await people();
    const series = await seedEvent(ana, "Lecture", "2030-01-08T10:00:00Z", "2030-01-08T11:00:00Z", "series");
    const ended = await seedEvent(ana, "Long ago", "2020-01-08T10:00:00Z", "2020-01-08T11:00:00Z");
    expect(await read(await setInvites(series, [anaBen]))).toEqual({
      status: 409,
      body: { error: "invites_series", message: "Events of a series cannot invite people" },
    });
    expect(await read(await setInvites(ended, [anaBen]))).toEqual({
      status: 409,
      body: { error: "invites_ended", message: "People can only be invited to events that have not ended" },
    });
  });
});

describe("what the invited person reads and answers (R60, R61)", () => {
  it("the window, the people of the invitation and the badge, each in its allowed shape", async () => {
    const { ana, ben, dora, anaBen, anaDora } = await people();
    const event = await seedEvent(ana, "Group project meeting");
    await setInvites(event, [anaBen, anaDora]);
    await app.signedInAs("ben@example.com");

    const window = await read(await windowRead("2030-01-06T00:00:00.000Z", "2030-01-13T00:00:00.000Z"));
    expect(window.status).toBe(200);
    const [invited] = window.body.events as Record<string, unknown>[];
    expect(invited).toEqual({
      inviteId: await inviteOf(ben),
      answer: "pending",
      inviter: { userId: ana, name: "ana", photoUrl: null },
      title: "Group project meeting",
      location: "Library, room 4",
      allDay: false,
      startAt: "2030-01-08T10:00:00.000Z",
      endAt: "2030-01-08T11:00:00.000Z",
    });
    for (const key of keysOf(window.body)) expect(["events", ...INVITED_EVENT_KEYS, ...INVITE_PERSON_CARD_KEYS] as string[]).toContain(key);
    for (const hidden of ["Secret notes", "lea@example.com", event, anaBen]) expect(JSON.stringify(window.body)).not.toContain(hidden);
    expect(await read(await windowRead("2030-01-06T00:00:00.000Z", "2030-03-09T00:00:01.000Z"))).toEqual({
      status: 400,
      body: { error: "invite_window", message: "Choose at most 62 days" },
    });

    const inviteId = await inviteOf(ben);
    const others = await read(await invitePeople(get(`/api/invites/${inviteId}/people`), app.deps, inviteId));
    expect(others).toEqual({ status: 200, body: { people: [{ userId: dora, name: "Dora Dias", photoUrl: null, answer: "pending" }] } });
    expect(await read(await pendingInviteCount(app.deps))).toEqual({ status: 200, body: { count: 1 } });

    expect(await read(await answer(inviteId, "accepted"))).toEqual({ status: 200, body: { message: "You accepted.", answer: "accepted" } });
    expect(await read(await pendingInviteCount(app.deps))).toEqual({ status: 200, body: { count: 0 } });
    await app.signedInAs("ana@example.com");
    expect((await read(await eventInvitees(get(`/api/events/${event}/invites`), app.deps, event))).body.people).toContainEqual({
      userId: ben,
      name: "Ben Brown",
      photoUrl: null,
      answer: "accepted",
    });
  });

  it("refuses another person's invitation, a bad answer, unknown and malformed ids, another site; nothing changes", async () => {
    const { ana, ben, anaBen, anaDora } = await people();
    const event = await seedEvent(ana, "Meeting");
    await setInvites(event, [anaBen, anaDora]);
    const bensInvite = await inviteOf(ben);
    await app.signedInAs("dora@example.com");
    const before = await app.snapshot();
    expect(await read(await answer(bensInvite, "declined"))).toEqual(NOT_FOUND);
    expect(await read(await answer(UNKNOWN, "declined"))).toEqual(NOT_FOUND);
    expect(await read(await answer("demo-lea-invite", "declined"))).toEqual(NOT_FOUND);
    expect((await answer(bensInvite, "pending")).status).toBe(400);
    expect((await answer(bensInvite, "maybe")).status).toBe(400);
    expect((await answer(bensInvite, "accepted", CROSS_SITE)).status).toBe(403);
    expect(await read(await invitePeople(get(`/api/invites/${bensInvite}/people`), app.deps, bensInvite))).toEqual(NOT_FOUND);
    expect(await app.snapshot()).toEqual(before);
    await app.signedInAs("carl@example.com");
    expect(await read(await windowRead("2030-01-06T00:00:00.000Z", "2030-01-13T00:00:00.000Z"))).toEqual({ status: 200, body: { events: [] } });
    expect(await read(await eventInvitees(get(`/api/events/${event}/invites`), app.deps, event))).toEqual(NOT_FOUND);
  });
});

describe("the calendar page (spec 36)", () => {
  it("one transaction more than none: the owner's people per event, the invited events, the open list and the badge", async () => {
    const { ana, ben, anaBen } = await people();
    const event = await seedEvent(ana, "Group project meeting");
    await setInvites(event, [anaBen]);

    const { withUser, transactions } = countingWithUser(app.db);
    const owner = await loadCalendarPageWithInvites({ ...app.deps, withUser }, ana, "2030-01-08", "week");
    expect(transactions).toHaveLength(2);
    expect(owner.invites.own).toEqual({ [event]: [{ userId: ben, name: "Ben Brown", photoUrl: null, answer: "pending" }] });
    expect(owner.invites.invited).toEqual([]);
    expect(owner.invites.contacts.map((c) => c.name).sort()).toEqual(["Ben Brown", "Dora Dias"]);
    for (const key of keysOf(owner.invites.contacts)) expect(INVITE_CONTACT_KEYS as readonly string[]).toContain(key);
    expect(JSON.stringify(owner.invites)).not.toContain("@");

    const invited = await loadCalendarPageWithInvites(app.deps, ben, "2030-01-08", "week");
    expect(invited.invites.invited.map((e) => e.title)).toEqual(["Group project meeting"]);
    expect(invited.invites.open.map((e) => e.title)).toEqual(["Group project meeting"]);
    expect(invited.invites.pending).toBe(1);
    expect(invited.invites.own).toEqual({});
    // It is not one of Ben's own events (R63).
    expect(invited.week.days.flatMap((d) => d.events)).toEqual([]);
    const text = JSON.stringify(invited.invites);
    for (const hidden of ["Secret notes", "lea@example.com", event]) expect(text).not.toContain(hidden);
  });

  it("with the demo contacts on, Lea's one made-up invitation this week; off, none", async () => {
    const { ben } = await people();
    const off = await loadCalendarPageWithInvites(app.deps, ben, "2026-11-16", "week");
    expect(off.invites.invited).toEqual([]);
    await app.db.withUser(ben, (q) => q("select app.set_demo_contacts(true)"));
    const on = await loadCalendarPageWithInvites(app.deps, ben, "2026-11-16", "week");
    expect(on.invites.invited).toEqual([
      expect.objectContaining({ inviteId: "demo-lea-invite", title: "Group project meeting", demo: true, inviter: expect.objectContaining({ userId: "demo-lea" }) }),
    ]);
    expect(on.invites.open.map((e) => e.inviteId)).toEqual(["demo-lea-invite"]);
    // Its answer lives in the browser only, so the server's badge does not count it.
    expect(on.invites.pending).toBe(0);
    // Never a row.
    expect(await app.db.admin("select * from app.event_invites")).toEqual([]);
  });
});

describe("the coach (R22, R63)", () => {
  it("the owner's coach may not move an event with invited people and is not sent who they are; the invited person's coach gets nothing of it", async () => {
    const { ana, ben, anaBen } = await people();
    const [row] = await app.db.admin<{ id: string }>(
      "insert into app.events (user_id, title, start_at, end_at) values ($1, 'Group project meeting', '2026-11-18T10:00:00Z', '2026-11-18T11:00:00Z') returning id",
      [ana],
    );
    await app.db.admin("insert into app.events (user_id, title, start_at, end_at) values ($1, 'Gym', '2026-11-19T10:00:00Z', '2026-11-19T11:00:00Z')", [ana]);
    // Written directly: the database's own clock decides "not ended", and this event lies in the coach's 14 days of the fake clock.
    await app.db.admin("insert into app.event_invites (event_id, contact_id, owner, invitee) values ($1, $2, $3, $4)", [row.id, anaBen, ana, ben]);
    await setPlan(app.db, ana, "pro");
    await setPlan(app.db, ben, "pro");

    expect((await sendMessage(postJson("/api/chat/messages", { text: "What is on this week?" }), app.deps)).status).toBe(201);
    const anasRequest = JSON.stringify(app.assistant.requests.at(-1));
    const anasEvents = (JSON.parse((app.assistant.requests.at(-1) as { data: string }).data) as { events: { title: string; changeable: boolean }[] }).events;
    // The same kind of event without invited people may be changed; with them it may not (and nothing says why).
    expect(anasEvents.map((e) => [e.title, e.changeable])).toEqual([
      ["Group project meeting", false],
      ["Gym", true],
    ]);
    for (const hidden of [ben, "Ben Brown", "ben@example.com", anaBen]) expect(anasRequest).not.toContain(hidden);

    await app.signedInAs("ben@example.com");
    expect((await sendMessage(postJson("/api/chat/messages", { text: "What is on this week?" }), app.deps)).status).toBe(201);
    const bensRequest = JSON.stringify(app.assistant.requests.at(-1));
    for (const hidden of ["Group project meeting", ana]) expect(bensRequest).not.toContain(hidden);
  });
});
