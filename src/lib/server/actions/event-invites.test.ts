// Tests for the actions of spec 54 (ported from spec 36; event invitations, R59 to R64): setting the
// invited people, answering, the people of an event or an invitation, the invited events of a window, the
// badge count, the calendar page's loader, and that the coach is sent nothing of it (R22, R63).
// Accepted and rejected case for each rule; a rejection changes nothing (R1). The answers' keys are
// checked against allow-lists, so a new key fails a test (S2). The security points S1 to S5 of the
// spec are named where they are tested.
// The database decides "not ended" by its own clock, so the events here lie in 2030 (never ended),
// except where the coach's 14 days (from the fake clock's Monday 16 November 2026) are needed.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, OWN_ORIGIN, postJson, read, type TestApp } from "@test/support/app";
import { setPlan } from "@test/support/chat";
import { countingWithUser } from "@test/support/counting";
import { readPeople } from "@/lib/server/profiles/cards";
import { loadCalendarPage, loadCalendarPageWithInvites, loadCalendarPageWithShares, loadPeoplePage, loadPeoplePageWithInvites } from "@/lib/server/pages/load";
import { INVITE_CONTACT_KEYS, INVITE_PERSON_CARD_KEYS, INVITE_PERSON_KEYS, INVITED_EVENT_KEYS } from "@/lib/invites/types";
import { deliverProfilePhoto } from "./deliver-photo";
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
const people = (inviteId: string) => invitePeople(get(`/api/invites/${inviteId}/people`), app.deps, inviteId);
const owned = (eventId: string) => eventInvitees(get(`/api/events/${eventId}/invites`), app.deps, eventId);
const windowRead = (from = "2030-01-06T00:00:00.000Z", to = "2030-01-13T00:00:00.000Z") =>
  invitedEvents(get(`/api/invites?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`), app.deps);

/** Ana is contacts with Ben and Dora; Carl is Ben's contact only. Ben and Dora are not contacts. Ana is signed in at the end. */
async function cast() {
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

async function seedEvent(
  user: string,
  title: string,
  extra: { start?: string; end?: string; series?: boolean; source?: string; outlookId?: string } = {},
): Promise<string> {
  const [row] = await app.db.admin<{ id: string }>(
    `insert into app.events (user_id, title, start_at, end_at, location, notes, guests, series_id, source, outlook_id, travel_mode)
     values ($1, $2, $3::timestamptz, $4::timestamptz, 'Library, room 4', case when $6 = 'app' then 'Secret notes' end,
             case when $5::uuid is null and $6 = 'app' then '{lea@example.com}'::text[] end, $5::uuid, $6, $7, case when $6 = 'app' then 'walking' end) returning id`,
    [
      user,
      title,
      extra.start ?? "2030-01-08T10:00:00Z",
      extra.end ?? "2030-01-08T11:00:00Z",
      extra.series ? "00000000-0000-4000-8000-000000000001" : null,
      extra.source ?? "app",
      extra.outlookId ?? null,
    ],
  );
  if ((extra.source ?? "app") === "app") await app.db.admin("insert into app.event_todos (event_id, user_id, title, position) values ($1, $2, 'Secret to-do', 0)", [row.id, user]);
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

describe("set_event_invites (R59, S3)", () => {
  it("the owner invites contacts; the answer lists the people with name, photo address and answer only", async () => {
    const { ana, ben, dora, anaBen, anaDora } = await cast();
    const event = await seedEvent(ana, "Group project meeting");
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
    expect((await read(await owned(event))).body.people).toEqual(answered.body.people);
    // Taking one off keeps the other.
    expect((await read(await setInvites(event, [anaDora]))).body.people).toEqual([{ userId: dora, name: "Dora Dias", photoUrl: null, answer: "pending" }]);
  });

  it("refuses a stranger's or someone else's contact row, a pending contact invitation, oneself, foreign, unknown and malformed ids, a bad body, another site and no session; nothing changes", async () => {
    const { ana, ben, anaBen, benCarl } = await cast();
    // Ana has invited Eve to be a contact; Eve has not answered yet.
    await app.signedInAs("eve@example.com");
    await app.signedInAs("ana@example.com");
    await app.db.withUser(ana, (q) => q("select app.invite_contact('eve@example.com')"));
    const pendingContact = (await app.db.withUser(ana, readPeople)).sent[0].id;
    const event = await seedEvent(ana, "Meeting");
    const bens = await seedEvent(ben, "Ben's");
    const before = await app.snapshot();
    for (const contacts of [[benCarl], [UNKNOWN], [pendingContact], [ana], [anaBen, benCarl], ["not-an-id"]]) {
      expect(await read(await setInvites(event, contacts))).toEqual(NOT_FOUND);
    }
    expect(await read(await setInvites(bens, [anaBen]))).toEqual(NOT_FOUND);
    expect(await read(await setInvites(UNKNOWN, [anaBen]))).toEqual(NOT_FOUND);
    expect(await read(await setInvites("not-an-id", [anaBen]))).toEqual(NOT_FOUND);
    expect((await setInvites(event, "everyone")).status).toBe(400);
    expect((await setInvites(event, [anaBen], CROSS_SITE)).status).toBe(403);
    expect(await read(await owned(bens))).toEqual(NOT_FOUND);
    expect(await app.snapshot()).toEqual(before);
    await app.auth.signOut();
    expect((await setInvites(event, [anaBen])).status).toBe(401);
    expect(await app.db.admin("select * from app.event_invites")).toEqual([]);
  });

  it("refuses a removed contact with the same Not found; nothing changes", async () => {
    const { ana, anaBen } = await cast();
    const event = await seedEvent(ana, "Meeting");
    await app.db.withUser(ana, (q) => q("select app.remove_contact($1::uuid)", [anaBen]));
    const before = await app.snapshot();
    expect(await read(await setInvites(event, [anaBen]))).toEqual(NOT_FOUND);
    expect(await app.snapshot()).toEqual(before);
  });

  it("refuses an event of a series, an Outlook event and an ended event with the ontology's sentence; nothing changes", async () => {
    const { ana, anaBen } = await cast();
    const series = await seedEvent(ana, "Lecture", { series: true });
    const outlook = await seedEvent(ana, "From Outlook", { source: "outlook", outlookId: "AAMk-test-1" });
    const ended = await seedEvent(ana, "Long ago", { start: "2020-01-08T10:00:00Z", end: "2020-01-08T11:00:00Z" });
    const before = await app.snapshot();
    expect(await read(await setInvites(series, [anaBen]))).toEqual({
      status: 409,
      body: { error: "invites_series", message: "Events of a series cannot invite people" },
    });
    expect(await read(await setInvites(outlook, [anaBen]))).toEqual({
      status: 409,
      body: { error: "invites_outlook", message: "Outlook events cannot invite people" },
    });
    expect(await read(await setInvites(ended, [anaBen]))).toEqual({
      status: 409,
      body: { error: "invites_ended", message: "People can only be invited to events that have not ended" },
    });
    expect(await app.snapshot()).toEqual(before);
  });

  it("at most 20 people: the 20th is accepted, the 21st refused and nothing changes", async () => {
    const { ana } = await cast();
    const event = await seedEvent(ana, "Big meeting");
    const rows: string[] = [];
    for (let i = 0; i < 21; i++) {
      const other = await app.db.createUser(`many${i}@example.com`, { confirmed: true });
      const [row] = await app.db.admin<{ id: string }>(
        "insert into app.contacts (user_a, user_b) values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid)) returning id",
        [ana, other],
      );
      rows.push(row.id);
    }
    expect((await setInvites(event, rows.slice(0, 20))).status).toBe(200);
    const before = await app.snapshot();
    expect(await read(await setInvites(event, rows))).toEqual({
      status: 409,
      body: { error: "too_many_invitees", message: "An event can invite at most 20 people" },
    });
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("what the invited person reads and answers (R60, R61, S1, S2)", () => {
  it("the window, the people of the invitation and the badge, each in its allowed shape", async () => {
    const { ana, ben, dora, anaBen, anaDora } = await cast();
    const event = await seedEvent(ana, "Group project meeting");
    await setInvites(event, [anaBen, anaDora]);
    await app.signedInAs("ben@example.com");

    const window = await read(await windowRead());
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
    const [contactRow] = await app.db.admin<{ id: string }>("select contact_id as id from app.event_invites where invitee = $1", [ben]);
    for (const hidden of ["Secret notes", "Secret to-do", "lea@example.com", "walking", event, contactRow.id, "@"]) expect(JSON.stringify(window.body)).not.toContain(hidden);
    expect(await read(await windowRead("2030-01-06T00:00:00.000Z", "2030-03-09T00:00:01.000Z"))).toEqual({
      status: 400,
      body: { error: "invite_window", message: "Choose at most 62 days" },
    });

    const inviteId = await inviteOf(ben);
    // Dora is not Ben's contact: her name, but a stand-in key instead of her user id.
    const others = await read(await people(inviteId));
    expect(others).toEqual({ status: 200, body: { people: [{ userId: "invited-1", name: "Dora Dias", photoUrl: null, answer: "pending" }] } });
    expect(JSON.stringify(others.body)).not.toContain(dora);
    expect(await read(await pendingInviteCount(app.deps))).toEqual({ status: 200, body: { count: 1 } });

    expect(await read(await answer(inviteId, "tentative"))).toEqual({ status: 200, body: { message: "You answered maybe.", answer: "tentative" } });
    expect(await read(await answer(inviteId, "accepted"))).toEqual({ status: 200, body: { message: "You accepted.", answer: "accepted" } });
    expect(await read(await pendingInviteCount(app.deps))).toEqual({ status: 200, body: { count: 0 } });
    await app.signedInAs("ana@example.com");
    expect((await read(await owned(event))).body.people).toContainEqual({ userId: ben, name: "Ben Brown", photoUrl: null, answer: "accepted" });
  });

  it("refuses another person's invitation, a bad answer, unknown and malformed ids, another site; nothing changes", async () => {
    const { ana, ben, anaBen, anaDora } = await cast();
    const event = await seedEvent(ana, "Meeting");
    await setInvites(event, [anaBen, anaDora]);
    const bensInvite = await inviteOf(ben);
    await app.signedInAs("dora@example.com");
    const before = await app.snapshot();
    expect(await read(await answer(bensInvite, "declined"))).toEqual(NOT_FOUND);
    expect(await read(await answer(UNKNOWN, "declined"))).toEqual(NOT_FOUND);
    expect(await read(await answer("not-an-id", "declined"))).toEqual(NOT_FOUND);
    expect((await answer(bensInvite, "pending")).status).toBe(400);
    expect((await answer(bensInvite, "maybe")).status).toBe(400);
    expect((await answer(bensInvite, "accepted", CROSS_SITE)).status).toBe(403);
    expect(await read(await people(bensInvite))).toEqual(NOT_FOUND);
    expect(await read(await people("not-an-id"))).toEqual(NOT_FOUND);
    expect(await app.snapshot()).toEqual(before);
    // A third user (Carl, Ben's contact only) sees nothing at all.
    await app.signedInAs("carl@example.com");
    expect(await read(await windowRead())).toEqual({ status: 200, body: { events: [] } });
    expect(await read(await owned(event))).toEqual(NOT_FOUND);
    expect(await read(await people(bensInvite))).toEqual(NOT_FOUND);
    expect(await read(await answer(bensInvite, "accepted"))).toEqual(NOT_FOUND);
  });

  it("S1: an invitation taken back and one whose contact was removed answer the same Not found, and leave the window", async () => {
    const { ana, ben, dora, anaBen, anaDora } = await cast();
    const event = await seedEvent(ana, "Meeting");
    await setInvites(event, [anaBen, anaDora]);
    const bensInvite = await inviteOf(ben);
    const dorasInvite = await inviteOf(dora);
    // Ana takes Ben off.
    await setInvites(event, [anaDora]);
    await app.signedInAs("ben@example.com");
    expect(await read(await answer(bensInvite, "accepted"))).toEqual(NOT_FOUND);
    expect(await read(await people(bensInvite))).toEqual(NOT_FOUND);
    expect(await read(await windowRead())).toEqual({ status: 200, body: { events: [] } });
    // Dora removes Ana as a contact.
    await app.db.withUser(dora, (q) => q("select app.remove_contact($1::uuid)", [anaDora]));
    await app.signedInAs("dora@example.com");
    expect(await read(await answer(dorasInvite, "accepted"))).toEqual(NOT_FOUND);
    expect(await read(await people(dorasInvite))).toEqual(NOT_FOUND);
    expect(await read(await windowRead())).toEqual({ status: 200, body: { events: [] } });
    expect(await read(await pendingInviteCount(app.deps))).toEqual({ status: 200, body: { count: 0 } });
  });

  it("refuses an answer to an ended event; nothing changes", async () => {
    const { ana, ben, anaBen } = await cast();
    const event = await seedEvent(ana, "Meeting");
    await setInvites(event, [anaBen]);
    // The event is over now (the database's own clock decides).
    await app.db.admin("update app.events set start_at = '2020-01-08T10:00:00Z', end_at = '2020-01-08T11:00:00Z' where id = $1", [event]);
    const invite = await inviteOf(ben);
    await app.signedInAs("ben@example.com");
    const before = await app.snapshot();
    expect(await read(await answer(invite, "accepted"))).toEqual({ status: 409, body: { error: "invite_ended", message: "This event has ended" } });
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("S4: people invited together who are not contacts", () => {
  it("see each other's display name or 'Invited person', never a photo address, never an address; the photo route answers 404", async () => {
    const { ana, ben, dora, anaBen, anaDora } = await cast();
    // Dora has a photo and no display name; Ben has a photo too.
    await app.db.admin("update app.profiles set display_name = null where id = $1", [dora]);
    for (const user of [ben, dora]) await app.db.admin("insert into app.profile_photos (user_id, mime, bytes) values ($1, 'image/png', '\\x89504e470d0a1a0a00'::bytea)", [user]);
    const event = await seedEvent(ana, "Meeting");
    await setInvites(event, [anaBen, anaDora]);

    await app.signedInAs("ben@example.com");
    const bens = await read(await people(await inviteOf(ben)));
    expect(bens.body).toEqual({ people: [{ userId: "invited-1", name: "Invited person", photoUrl: null, answer: "pending" }] });
    expect(JSON.stringify(bens.body)).not.toContain("dora");
    // Not her user id either (security review, 19 Nov 2026): nothing Ben could use anywhere else.
    expect(JSON.stringify(bens.body)).not.toContain(dora);
    // The photo route keeps R43: the same 404 as for a made-up id.
    const photo = await deliverProfilePhoto(app.deps, dora);
    const madeUp = await deliverProfilePhoto(app.deps, UNKNOWN);
    expect(photo.status).toBe(404);
    expect(await photo.text()).toBe(await madeUp.text());

    await app.signedInAs("dora@example.com");
    const doras = await read(await people(await inviteOf(dora)));
    expect(doras.body).toEqual({ people: [{ userId: "invited-1", name: "Ben Brown", photoUrl: null, answer: "pending" }] });
    expect(JSON.stringify(doras.body)).not.toContain("@");
    expect(JSON.stringify(doras.body)).not.toContain(ben);
    expect((await deliverProfilePhoto(app.deps, ben)).status).toBe(404);
    // Ana, their contact, gets both photos' addresses (R43).
    await app.signedInAs("ana@example.com");
    const anas = (await read(await owned(event))).body.people as { photoUrl: string | null }[];
    expect(anas.every((p) => p.photoUrl?.startsWith("/api/profiles/"))).toBe(true);
  });
});

describe("the calendar page (S5)", () => {
  it("one transaction more than none: the owner's people per event, the invited events, the open list and the badge", async () => {
    const { ana, ben, anaBen } = await cast();
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
    // It is never one of Ben's own events (R63): not in his days, his all-day rows or the lead.
    expect(invited.week.days.flatMap((d) => [...d.events, ...d.allDay])).toEqual([]);
    expect(invited.week.lead).toEqual([]);
    const text = JSON.stringify(invited.invites);
    for (const hidden of ["Secret notes", "Secret to-do", "lea@example.com", event]) expect(text).not.toContain(hidden);
    // The month view's 42 days are read too (within the database's 62).
    expect((await loadCalendarPageWithInvites(app.deps, ben, "2030-01-08", "month")).invites.invited).toHaveLength(1);
  });

  it("the other loaders return exactly what they did: no invitations in them", async () => {
    const { ana, ben, anaBen } = await cast();
    const event = await seedEvent(ana, "Group project meeting");
    await setInvites(event, [anaBen]);
    const plain = await loadCalendarPage(app.deps, ben, "2030-01-08", "week");
    const withShares = await loadCalendarPageWithShares(app.deps, ben, "2030-01-08", "week");
    expect(Object.keys(plain).sort()).toEqual(["display", "goals", "home", "places", "showWelcome", "tasks", "travelMode", "week"]);
    expect(Object.keys(withShares).sort()).toEqual(["display", "goals", "home", "places", "sharing", "showWelcome", "tasks", "travelMode", "week"]);
    expect(JSON.stringify([plain, withShares])).not.toContain("Group project meeting");
  });
});

describe("the coach (R22, R63, S5)", () => {
  it("the owner's coach may not move an event with invited people and is not sent who they are; the invited person's coach gets nothing of it", async () => {
    const { ana, ben, anaBen } = await cast();
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
    for (const hidden of ["Group project meeting", ana, "ana@example.com"]) expect(bensRequest).not.toContain(hidden);
  });
});

describe("the People page (spec 54, changed 19 Nov 2026)", () => {
  it("one transaction: everything of the People page, the invitations still to look at and how many are not answered", async () => {
    const { ana, ben, anaBen } = await cast();
    const event = await seedEvent(ana, "Group project meeting");
    await setInvites(event, [anaBen]);

    const { withUser, transactions } = countingWithUser(app.db);
    const page = await loadPeoplePageWithInvites({ withUser, now: app.deps.now }, ben);
    expect(transactions).toHaveLength(1);
    const { eventInvites, ...rest } = page;
    expect(rest).toEqual(await loadPeoplePage(app.deps, ben));
    expect(eventInvites.pending).toBe(1);
    expect(eventInvites.open).toHaveLength(1);
    expect(eventInvites.open[0]).toMatchObject({ title: "Group project meeting", location: "Library, room 4", answer: "pending", allDay: false, inviter: { userId: ana } });
    for (const key of keysOf(eventInvites.open)) expect([...INVITED_EVENT_KEYS, ...INVITE_PERSON_CARD_KEYS] as readonly string[]).toContain(key);
    const text = JSON.stringify(eventInvites);
    for (const hidden of ["Secret notes", "Secret to-do", "lea@example.com", "@", event]) expect(text).not.toContain(hidden);

    // Declined: still in the list, no longer counted. Accepted: neither.
    await app.signedInAs("ben@example.com");
    const inviteId = await inviteOf(ben);
    expect((await answer(inviteId, "declined")).status).toBe(200);
    const declined = (await loadPeoplePageWithInvites(app.deps, ben)).eventInvites;
    expect([declined.open.map((e) => e.answer), declined.pending]).toEqual([["declined"], 0]);
    expect((await answer(inviteId, "accepted")).status).toBe(200);
    expect((await loadPeoplePageWithInvites(app.deps, ben)).eventInvites).toEqual({ open: [], pending: 0 });

    // The owner has no invitations of her own to answer.
    expect((await loadPeoplePageWithInvites(app.deps, ana)).eventInvites).toEqual({ open: [], pending: 0 });
  });

  it("loadPeoplePage returns exactly what it did: no invitations in it", async () => {
    const { ana, ben, anaBen } = await cast();
    await setInvites(await seedEvent(ana, "Group project meeting"), [anaBen]);
    const plain = await loadPeoplePage(app.deps, ben);
    expect(Object.keys(plain).sort()).toEqual(["display", "facts", "now", "people", "shares", "timeZone"]);
    expect(JSON.stringify(plain)).not.toContain("Group project meeting");
  });
});
