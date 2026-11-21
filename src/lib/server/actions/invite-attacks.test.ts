// Attack tests against event invitations (spec 54; R59 to R64): can anyone get at an event's data, or
// change who is invited or what they answered, without being allowed to? Five roles, each a real user:
// Ana (the owner) owns the events and invites; Ben (invitee) is her contact and invited; Cleo
// (co-invitee) is her contact and invited to the same event but is not Ben's contact; Fay (former) was her
// contact and invited and is removed; Sam (stranger) has no relation to anyone.
// Ana's event carries unique marker strings in every field (notes, to-do, guest, goal, travel mode,
// place). Every answer is checked as a whole (JSON.stringify of the body or of the loader's result)
// for markers that must not be there, and every refused request must leave the whole database and the
// fake services as they were (snapshot(), R1). Nothing here fixes anything; a failing test marks a hole.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, OWN_ORIGIN, postJson, read, type TestApp } from "@test/support/app";
import { setPlan } from "@test/support/chat";
import { seedGoal } from "@test/support/goals";
import { readPeople } from "@/lib/server/profiles/cards";
import { readCalendar } from "@/lib/server/chat/rows";
import { cardsOfContacts, openInvitesOf, readInvitedEvents, readInvitePeople, readOpenInviteRows, readPendingInviteCount } from "@/lib/server/invites/read";
import { loadCalendarPage, loadCalendarPageWithInvites, loadCalendarPageWithShares, loadPeoplePage, loadPersonProfile } from "@/lib/server/pages/load";
import { INVITE_CONTACT_KEYS, INVITE_PERSON_CARD_KEYS, INVITE_PERSON_KEYS, INVITED_EVENT_KEYS } from "@/lib/invites/types";
import { deliverProfilePhoto } from "./deliver-photo";
import { answerEventInvite, eventInvitees, invitedEvents, invitePeople, pendingInviteCount, setEventInvites } from "./event-invites";
import { inviteContact } from "./invite-contact";
import { sendMessage } from "./send-message";
import { sharedCalendar } from "./shares";

let app: TestApp;
let client = 0;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.reset(); // Monday 16 November 2026, 09:00 UTC
  client += 1; // the in-memory brake of invite_contact counts per client address
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------------------------------
// Tools

const CROSS_SITE = { origin: "https://evil.example", "sec-fetch-site": "cross-site" };
const NOT_FOUND = { status: 404, body: { error: "not_found", message: "Not found" } };
const UNKNOWN = "00000000-0000-4000-8000-000000000000";
const FROM = "2030-01-06T00:00:00.000Z";
const TO = "2030-01-13T00:00:00.000Z";

const M = {
  titleA: "TITLE-MARK-A",
  titleB: "TITLE-MARK-B",
  place: "PLACE-MARK",
  notes: "SECRET-NOTE",
  todo: "SECRET-TODO",
  guest: "secret-guest@example.com",
  goal: "GOAL-MARK",
  travel: "walking",
  cleoEvent: "CLEO-OWN-EVENT-MARK",
  samEvent: "SAM-OWN-EVENT-MARK",
  cleoBio: "CLEO-BIO-MARK",
  benName: "Ben BEN-NAME",
  cleoName: "Cleo CLEO-NAME",
  fayName: "Fay FAY-NAME",
  anaName: "Ana ANA-NAME",
};
/** What an invited person must never get (the title, the place and the people are meant to reach them). */
const NEVER_FOR_INVITEE = [M.notes, M.todo, M.guest, M.goal, M.travel, M.titleB, M.cleoEvent, M.samEvent, M.cleoBio, "updated_at", "updatedAt"];
/** Everything of the event that a stranger or a former contact must never get anywhere. */
const ALL_OF_EVENT = [M.titleA, M.place, ...NEVER_FOR_INVITEE, "TITLE-MARK", M.anaName, M.benName, M.cleoName, M.fayName, "@"];

const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(`${OWN_ORIGIN}${path}`, { method: "GET", headers: { host: "localhost:3000", "sec-fetch-site": "same-origin", ...headers } });
const post = (path: string, body: unknown, headers: Record<string, string> = {}) => postJson(path, body, { "x-forwarded-for": `10.8.0.${client}`, ...headers });

const setInvites = (eventId: string, contacts: unknown, headers?: Record<string, string>) =>
  setEventInvites(post(`/api/events/${eventId}/invites`, { contacts }, headers), app.deps, eventId);
const answer = (inviteId: string, value: unknown, headers?: Record<string, string>) =>
  answerEventInvite(post(`/api/invites/${inviteId}/answer`, { answer: value }, headers), app.deps, inviteId);
const people = (inviteId: string, headers?: Record<string, string>) => invitePeople(get(`/api/invites/${inviteId}/people`, headers), app.deps, inviteId);
const owned = (eventId: string, headers?: Record<string, string>) => eventInvitees(get(`/api/events/${eventId}/invites`, headers), app.deps, eventId);
const windowRead = (from = FROM, to = TO, headers?: Record<string, string>) =>
  invitedEvents(get(`/api/invites?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, headers), app.deps);
const count = () => pendingInviteCount(app.deps);
const photo = (id: string, ifNoneMatch: string | null = null) => deliverProfilePhoto(app.deps, id, ifNoneMatch);
const as = (email: string) => app.signedInAs(email);
const peopleOf = (user: string) => app.db.withUser(user, readPeople);

const headersOf = (response: Response) => Object.fromEntries(response.headers.entries());
/** Status, headers and body of a photo answer, to compare one 404 with another, byte for byte. */
async function photoAnswer(response: Response) {
  return { status: response.status, headers: headersOf(response), body: await response.text() };
}

const text = (value: unknown) => JSON.stringify(value);
function expectNone(label: string, value: unknown, markers: readonly string[]) {
  const all = text(value);
  for (const marker of markers) expect(all.includes(marker), `${label} contains "${marker}"`).toBe(false);
}

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
function expectKeysIn(label: string, value: unknown, allowed: readonly string[]) {
  for (const key of keysOf(value)) expect(allowed, `${label} has the key "${key}"`).toContain(key);
}

/** Signs in as `email`, runs the attack and proves nothing changed: the whole database and the fake services. */
async function refused<T>(email: string, attack: () => Promise<T>): Promise<T> {
  await as(email);
  const before = await app.snapshot();
  const result = await attack();
  expect(await app.snapshot()).toEqual(before);
  return result;
}

/** Makes two users contacts in the database, as the actions do; returns the contact row's id. */
async function befriend(from: string, to: string, toEmail: string): Promise<string> {
  await app.db.withUser(from, (q) => q("select app.invite_contact($1)", [toEmail]));
  const received = (await peopleOf(to)).received.find((r) => r.userId === from)!;
  await app.db.withUser(to, (q) => q("select app.answer_invitation($1::uuid, true)", [received.id]));
  return (await peopleOf(from)).contacts.find((c) => c.userId === to)!.id;
}

const removeContact = (owner: string, contactId: string) => app.db.withUser(owner, (q) => q("select app.remove_contact($1::uuid)", [contactId]));
const inviteIdOf = async (user: string, event: string) =>
  (await app.db.admin<{ id: string }>("select id from app.event_invites where invitee = $1 and event_id = $2", [user, event]))[0].id;
const invitesOf = (event: string) =>
  app.db.admin<{ invitee: string; answer: string }>("select invitee, answer from app.event_invites where event_id = $1 order by invitee", [event]);
const PNG_ROW = "'image/png', '\\x89504e470d0a1a0a00'::bytea";

type World = {
  ana: string;
  ben: string;
  cleo: string;
  fay: string;
  sam: string;
  tom: string;
  pat: string;
  anaBen: string;
  anaCleo: string;
  anaFay: string;
  samTom: string;
  benTom: string;
  patInvitation: string;
  /** Ana's event with every field filled; Ben, Cleo and Fay are invited. */
  eventA: string;
  /** Ana's second event; only Cleo is invited. */
  eventB: string;
  samEvent: string;
  benInvite: string;
  cleoInvite: string;
  fayInvite: string;
};

/** The cast and the data. The session ends with Ana. */
async function world(): Promise<World> {
  const sam = await as("sam@example.com");
  const tom = await as("tom@example.com");
  const pat = await as("pat@example.com");
  const fay = await as("fay@example.com");
  const cleo = await as("cleo@example.com");
  const ben = await as("ben@example.com");
  const ana = await as("ana@example.com");
  for (const [user, name, bio] of [
    [ana, M.anaName, null],
    [ben, M.benName, null],
    [cleo, M.cleoName, M.cleoBio],
    [fay, M.fayName, null],
  ] as const)
    await app.db.withUser(user, (q) => q("select app.set_profile($1, $2, null)", [name, bio]));
  for (const user of [ana, ben, cleo, fay])
    await app.db.admin(`insert into app.profile_photos (user_id, mime, bytes) values ($1, ${PNG_ROW})`, [user]);

  const anaBen = await befriend(ana, ben, "ben@example.com");
  const anaCleo = await befriend(ana, cleo, "cleo@example.com");
  const anaFay = await befriend(ana, fay, "fay@example.com");
  const samTom = await befriend(sam, tom, "tom@example.com");
  const benTom = await befriend(ben, tom, "tom@example.com");
  await app.db.withUser(ana, (q) => q("select app.invite_contact('pat@example.com')"));
  const patInvitation = (await peopleOf(ana)).sent[0].id;

  const goal = await seedGoal(app.db, ana, { title: M.goal, deadline: "2031-03-14", rules: [{ kind: "count", target: 2 }] });
  const [a] = await app.db.admin<{ id: string }>(
    `insert into app.events (user_id, title, start_at, end_at, location, notes, guests, goal_id, travel_mode)
     values ($1, $2, '2030-01-08T10:00:00Z', '2030-01-08T11:00:00Z', $3, $4, $5, $6, $7) returning id`,
    [ana, M.titleA, M.place, M.notes, [M.guest], goal.id, M.travel],
  );
  await app.db.admin("insert into app.event_todos (user_id, event_id, title, position) values ($1, $2, $3, 0)", [ana, a.id, M.todo]);
  const [b] = await app.db.admin<{ id: string }>(
    "insert into app.events (user_id, title, start_at, end_at) values ($1, $2, '2030-01-09T10:00:00Z', '2030-01-09T11:00:00Z') returning id",
    [ana, M.titleB],
  );
  await app.db.admin("insert into app.events (user_id, title, start_at, end_at) values ($1, $2, '2030-01-08T10:00:00Z', '2030-01-08T11:00:00Z')", [cleo, M.cleoEvent]);
  const [s] = await app.db.admin<{ id: string }>(
    "insert into app.events (user_id, title, start_at, end_at) values ($1, $2, '2030-01-08T10:00:00Z', '2030-01-08T11:00:00Z') returning id",
    [sam, M.samEvent],
  );

  await as("ana@example.com");
  expect((await setInvites(a.id, [anaBen, anaCleo, anaFay])).status).toBe(200);
  expect((await setInvites(b.id, [anaCleo])).status).toBe(200);
  return {
    ana, ben, cleo, fay, sam, tom, pat,
    anaBen, anaCleo, anaFay, samTom, benTom, patInvitation,
    eventA: a.id,
    eventB: b.id,
    samEvent: s.id,
    benInvite: await inviteIdOf(ben, a.id),
    cleoInvite: await inviteIdOf(cleo, a.id),
    fayInvite: await inviteIdOf(fay, a.id),
  };
}

/** Ana removes Fay as a contact (the database removes Fay's invitation with the contact row). */
const removeFay = (w: World) => removeContact(w.ana, w.anaFay);

// ---------------------------------------------------------------------------------------------------

describe("1. reading the invitation with the real ids", () => {
  it("Sam, Fay after removal and a signed-out caller read nothing: not the people, the list, the count or the event's invitees", async () => {
    const w = await world();
    await removeFay(w);
    const attempts = async () => ({
      owned: await read(await owned(w.eventA)),
      ownedB: await read(await owned(w.eventB)),
      peopleBen: await read(await people(w.benInvite)),
      peopleCleo: await read(await people(w.cleoInvite)),
      peopleFay: await read(await people(w.fayInvite)),
      window: await read(await windowRead()),
      wide: await read(await windowRead("2029-12-01T00:00:00.000Z", "2030-01-30T00:00:00.000Z")),
      count: await read(await count()),
    });
    const expected = {
      owned: NOT_FOUND,
      ownedB: NOT_FOUND,
      peopleBen: NOT_FOUND,
      peopleCleo: NOT_FOUND,
      peopleFay: NOT_FOUND,
      window: { status: 200, body: { events: [] } },
      wide: { status: 200, body: { events: [] } },
      count: { status: 200, body: { count: 0 } },
    };
    for (const email of ["sam@example.com", "fay@example.com"]) {
      const got = await refused(email, attempts);
      expect(got, email).toEqual(expected);
      expectNone(email, got, ALL_OF_EVENT.filter((m) => m !== "@"));
    }
    // Signed out: every read is the same 401 and holds nothing.
    await app.auth.signOut();
    const before = await app.snapshot();
    const out = await attempts();
    for (const [name, got] of Object.entries(out)) {
      expect(got.status, name).toBe(401);
      expectNone(name, got, ALL_OF_EVENT.filter((m) => m !== "@"));
    }
    expect(new Set(Object.values(out).map((o) => text(o.body))).size).toBe(1);
    expect(await app.snapshot()).toEqual(before);
  });

  it("Sam guesses ids: a real foreign id, a made-up id and malformed ones all get the very same answer", async () => {
    const w = await world();
    const guesses = [
      w.eventA, // the real event
      w.benInvite, // a real invitation
      w.eventA.toUpperCase(),
      w.ana, // a real user id
      w.anaBen, // a real contact row
      UNKNOWN,
      "11111111-2222-4333-8444-555555555555",
      "not-an-id",
      "",
      "' or 1=1 --",
      `${w.eventA}x`,
      `${w.eventA}%00`,
      "../../etc/passwd",
      "undefined",
    ];
    const out: Record<string, unknown[]> = { owned: [], people: [] };
    for (const id of guesses) {
      out.owned.push(await refused("sam@example.com", async () => read(await owned(id))));
      out.people.push(await refused("sam@example.com", async () => read(await people(id))));
    }
    for (const [route, answers] of Object.entries(out)) {
      for (const [index, got] of answers.entries()) expect(got, `${route}: ${guesses[index]}`).toEqual(NOT_FOUND);
      expectNone(route, answers, ALL_OF_EVENT);
    }
    // The only id Sam may ask about is his own event; its people are empty and the same for everyone who owns one.
    expect(await refused("sam@example.com", async () => read(await owned(w.samEvent)))).toEqual({ status: 200, body: { people: [] } });
  });

  it("malformed windows are the same refusal for everyone and give nothing", async () => {
    const w = await world();
    const bad = [
      [null, null],
      [FROM, null],
      [null, TO],
      [TO, FROM],
      [FROM, FROM],
      ["2030-01-06", "2030-01-13"],
      ["garbage", TO],
      ["' or 1=1 --", TO],
      [FROM, "2030-03-10T00:00:00.000Z"], // more than 62 days
    ] as const;
    for (const email of ["ben@example.com", "sam@example.com"]) {
      await as(email);
      const before = await app.snapshot();
      for (const [from, to] of bad) {
        const query = [from === null ? "" : `from=${encodeURIComponent(from)}`, to === null ? "" : `to=${encodeURIComponent(to)}`].filter(Boolean).join("&");
        const got = await read(await invitedEvents(get(`/api/invites?${query}`), app.deps));
        expect(got, `${email} ${from} ${to}`).toEqual({ status: 400, body: { error: "invite_window", message: "Choose at most 62 days" } });
      }
      // Two "from" values: the first one counts, the second cannot widen the window.
      const twice = await read(await invitedEvents(get(`/api/invites?from=${FROM}&from=2020-01-01T00:00:00Z&to=${TO}&to=2031-01-01T00:00:00Z`), app.deps));
      expect(twice.status).toBe(200);
      expectNone("two values", twice, [M.titleB, M.notes]);
      expect(await app.snapshot()).toEqual(before);
    }
    expect(w.eventA).toBeTruthy();
  });
});

describe("2. changing who is invited to Ana's event", () => {
  it("Sam, Ben and Cleo cannot set or clear the invitations of Ana's event: invite themselves, invite others, remove someone", async () => {
    const w = await world();
    const tries: Record<string, string[][]> = {
      "sam@example.com": [[w.samTom], [w.anaBen], [w.anaBen, w.anaCleo], [], [w.ana], [w.sam], [UNKNOWN]],
      "ben@example.com": [[w.anaBen], [w.benTom], [w.anaBen, w.anaCleo, w.anaFay], [w.anaCleo], [], [w.ben], [w.ana]],
      "cleo@example.com": [[w.anaCleo], [w.anaBen], [w.anaCleo, w.anaBen, w.anaFay], [], [w.cleo]],
    };
    for (const [email, lists] of Object.entries(tries)) {
      for (const contacts of lists) {
        for (const event of [w.eventA, w.eventB]) {
          const got = await refused(email, async () => read(await setInvites(event, contacts)));
          expect(got, `${email} sets ${JSON.stringify(contacts)} on ${event}`).toEqual(NOT_FOUND);
        }
      }
    }
    expect(await invitesOf(w.eventA)).toHaveLength(3);
    expect(await invitesOf(w.eventB)).toHaveLength(1);
    // Ben also tries the invitation's own id and his invitation's id as if they were the event.
    for (const id of [w.benInvite, w.cleoInvite]) {
      expect(await refused("ben@example.com", async () => read(await setInvites(id, [w.anaBen])))).toEqual(NOT_FOUND);
      expect(await refused("ben@example.com", async () => read(await owned(id)))).toEqual(NOT_FOUND);
    }
    // Signed out: 401, nothing changes.
    await app.auth.signOut();
    const before = await app.snapshot();
    expect((await setInvites(w.eventA, [])).status).toBe(401);
    expect(await app.snapshot()).toEqual(before);
  });

  it("an invited person cannot read the owner's list of the event under any id they know (no 'my invitation' as an event id)", async () => {
    const w = await world();
    await as("ben@example.com");
    for (const id of [w.benInvite, w.cleoInvite, w.anaBen, w.ana, w.cleo]) expect(await read(await owned(id)), id).toEqual(NOT_FOUND);
  });
});

describe("3. answering", () => {
  it("nobody answers for someone else: Ben for Cleo, Sam and Fay for Ben, Ana for Ben; and a made-up id is the same answer", async () => {
    const w = await world();
    const attempts: Array<[string, string, string]> = [
      ["ben@example.com", w.cleoInvite, "declined"],
      ["ben@example.com", w.fayInvite, "declined"],
      ["cleo@example.com", w.benInvite, "accepted"],
      ["sam@example.com", w.benInvite, "accepted"],
      ["fay@example.com", w.benInvite, "accepted"], // still a contact, invited, but not Ben
      ["ana@example.com", w.benInvite, "accepted"], // the owner is not the invited person
      ["ana@example.com", w.cleoInvite, "declined"],
      ["sam@example.com", UNKNOWN, "accepted"],
    ];
    for (const [email, id, value] of attempts) {
      expect(await refused(email, async () => read(await answer(id, value))), `${email} answers ${id}`).toEqual(NOT_FOUND);
    }
    // After removal Fay is a former contact: the same for Ben's invitation and for her old one.
    await removeFay(w);
    expect(await refused("fay@example.com", async () => read(await answer(w.benInvite, "accepted")))).toEqual(NOT_FOUND);
    expect(await refused("fay@example.com", async () => read(await answer(w.fayInvite, "accepted")))).toEqual(NOT_FOUND);
    expect(await refused("fay@example.com", async () => read(await answer(w.fayInvite, "pending")))).toMatchObject({ status: 400 });
    // Everyone still pending.
    expect((await invitesOf(w.eventA)).map((i) => i.answer)).toEqual(["pending", "pending"]);
  });

  it("an answer other than accepted, tentative or declined is refused, whoever asks; nothing changes", async () => {
    const w = await world();
    const values: unknown[] = ["pending", "maybe", "Accepted", "ACCEPTED", " accepted", "accepted ", "", null, 1, true, ["accepted"], { answer: "accepted" }, "accept", "yes", "'; update app.event_invites set answer='accepted' --"];
    for (const [email, id] of [
      ["ben@example.com", w.benInvite],
      ["sam@example.com", w.benInvite],
      ["ben@example.com", UNKNOWN],
    ] as const) {
      await as(email);
      const before = await app.snapshot();
      for (const value of values) {
        const got = await read(await answer(id, value));
        expect(got.status, `${email} sends ${JSON.stringify(value)}`).toBe(400);
        expectNone("answer", got, [M.notes, M.titleA]);
      }
      // Whole bodies that are not an object with an answer.
      for (const body of ["not json", "[]", "null", '"accepted"', "{}", '{"answer":}']) {
        const got = await answerEventInvite(post(`/api/invites/${id}/answer`, body), app.deps, id);
        expect(got.status, body).toBe(400);
      }
      expect(await app.snapshot()).toEqual(before);
    }
    expect(await invitesOf(w.eventA)).toEqual(expect.arrayContaining([{ invitee: w.ben, answer: "pending" }]));
  });

  it("extra keys in the body decide nothing: Ben cannot answer for Cleo or change the owner through the body", async () => {
    const w = await world();
    await as("ben@example.com");
    const before = await invitesOf(w.eventA);
    const got = await answerEventInvite(post(`/api/invites/${w.benInvite}/answer`, { answer: "accepted", invitee: w.cleo, id: w.cleoInvite, owner: w.ben, event_id: w.eventB }), app.deps, w.benInvite);
    expect(got.status).toBe(200);
    const after = await invitesOf(w.eventA);
    expect(after.find((i) => i.invitee === w.ben)?.answer).toBe("accepted");
    expect(after.find((i) => i.invitee === w.cleo)?.answer).toBe("pending");
    expect(after.map((i) => i.invitee)).toEqual(before.map((i) => i.invitee));
    expect((await app.db.admin("select * from app.event_invites where owner <> $1", [w.ana])).length).toBe(0);
    expect((await invitesOf(w.eventB)).map((i) => i.invitee)).toEqual([w.cleo]);
  });

  it("accepting or answering maybe after the event has ended is refused (409), and a stranger gets Not found for it, not the ended sentence; nothing changes", async () => {
    const w = await world();
    await as("ben@example.com");
    expect((await answer(w.benInvite, "accepted")).status).toBe(200);
    await app.db.admin("update app.events set start_at = '2020-01-08T10:00:00Z', end_at = '2020-01-08T11:00:00Z' where id = $1", [w.eventA]); // a move: answers back to pending
    const kept = await invitesOf(w.eventA);
    // Spec 64: declining stays possible after the end (it takes the event out of the calendar); accept and maybe do not.
    expect(await refused("ben@example.com", async () => read(await answer(w.benInvite, "tentative")))).toEqual({
      status: 409,
      body: { error: "invite_ended", message: "This event has ended" },
    });
    expect(await refused("ben@example.com", async () => read(await answer(w.benInvite, "accepted")))).toEqual({
      status: 409,
      body: { error: "invite_ended", message: "This event has ended" },
    });
    expect(await refused("sam@example.com", async () => read(await answer(w.benInvite, "declined")))).toEqual(NOT_FOUND);
    expect(await refused("cleo@example.com", async () => read(await answer(w.benInvite, "declined")))).toEqual(NOT_FOUND);
    expect(await invitesOf(w.eventA)).toEqual(kept);
    // An ended event is not counted any more.
    await as("cleo@example.com");
    expect(await read(await count())).toEqual({ status: 200, body: { count: 1 } }); // only event B is left
  });

  it("an invitation taken back cannot be answered, and inviting the person again gives a new id; the old one stays dead", async () => {
    const w = await world();
    await as("ana@example.com");
    expect((await setInvites(w.eventA, [w.anaCleo, w.anaFay])).status).toBe(200);
    const dead = await refused("ben@example.com", async () => ({
      answer: await read(await answer(w.benInvite, "accepted")),
      people: await read(await people(w.benInvite)),
      madeUp: await read(await answer(UNKNOWN, "accepted")),
    }));
    expect(dead.answer).toEqual(NOT_FOUND);
    expect(dead.people).toEqual(NOT_FOUND);
    expect(dead.answer).toEqual(dead.madeUp);
    expect(await invitesOf(w.eventA)).toHaveLength(2);
    // Invited again: a new invitation, answered pending; the old id is still dead.
    await as("ana@example.com");
    expect((await setInvites(w.eventA, [w.anaBen, w.anaCleo, w.anaFay])).status).toBe(200);
    const fresh = await inviteIdOf(w.ben, w.eventA);
    expect(fresh).not.toBe(w.benInvite);
    expect(await refused("ben@example.com", async () => read(await answer(w.benInvite, "accepted")))).toEqual(NOT_FOUND);
    expect((await invitesOf(w.eventA)).find((i) => i.invitee === w.ben)?.answer).toBe("pending");
  });

  it("signed out, nobody answers (401) and nothing changes", async () => {
    const w = await world();
    await app.auth.signOut();
    const before = await app.snapshot();
    expect((await answer(w.benInvite, "accepted")).status).toBe(401);
    expect((await answer(UNKNOWN, "accepted")).status).toBe(401);
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("4. what Ana may and may not invite", () => {
  it("a stranger's user id, a contact row that is not hers, a row of two other people, herself and a pending contact are all Not found; nothing changes, not even the valid ones next to them", async () => {
    const w = await world();
    const bad: Array<[string, string[]]> = [
      ["Sam's user id", [w.sam]],
      ["Ben's user id", [w.ben]],
      ["Sam and Tom's contact row", [w.samTom]],
      ["Ben and Tom's contact row", [w.benTom]],
      ["a valid contact next to Sam and Tom's row", [w.anaBen, w.samTom]],
      ["a valid contact next to Sam's user id", [w.anaBen, w.anaCleo, w.sam]],
      ["her own user id", [w.ana]],
      ["a pending contact's invitation id", [w.patInvitation]],
      ["a valid contact next to the pending one", [w.anaCleo, w.patInvitation]],
      ["a made-up id", [UNKNOWN]],
      ["the event's own id", [w.eventA]],
      ["an invitation's id", [w.benInvite]],
    ];
    for (const [label, contacts] of bad) {
      for (const event of [w.eventA, w.eventB]) {
        const got = await refused("ana@example.com", async () => read(await setInvites(event, contacts)));
        expect(got, `${label} on ${event}`).toEqual(NOT_FOUND);
      }
    }
    // The pending contact never became a contact or an invitee.
    expect((await app.db.admin("select 1 from auth.users u join app.event_invites i on i.invitee = u.id where u.email = 'pat@example.com'")).length).toBe(0);
    expect(await invitesOf(w.eventA)).toHaveLength(3);
    expect(await invitesOf(w.eventB)).toHaveLength(1);
  });

  it("a malformed list, more than 100 entries, a long id and a null are refused with 400 and nothing changes", async () => {
    const w = await world();
    const big = Array.from({ length: 101 }, () => w.anaBen);
    const bodies: unknown[] = ["everyone", { a: 1 }, null, [null], [1], [[w.anaBen]], big, ["x".repeat(41)], [w.anaBen, null]];
    await as("ana@example.com");
    const before = await app.snapshot();
    for (const contacts of bodies) {
      const got = await setInvites(w.eventA, contacts);
      expect(got.status, JSON.stringify(contacts).slice(0, 60)).toBe(400);
    }
    // A whole body that is no object.
    for (const body of ["not json", "[]", "null"]) {
      expect((await setEventInvites(post(`/api/events/${w.eventA}/invites`, body), app.deps, w.eventA)).status, body).toBe(400);
    }
    expect(await app.snapshot()).toEqual(before);
  });

  it("21 people are refused and nothing changes; the same contact twice is one invitation", async () => {
    const w = await world();
    const [c] = await app.db.admin<{ id: string }>(
      "insert into app.events (user_id, title, start_at, end_at) values ($1, 'Big meeting', '2030-02-08T10:00:00Z', '2030-02-08T11:00:00Z') returning id",
      [w.ana],
    );
    const rows: string[] = [];
    for (let i = 0; i < 21; i++) {
      const other = await app.db.createUser(`many${i}@example.com`, { confirmed: true });
      const [row] = await app.db.admin<{ id: string }>(
        "insert into app.contacts (user_a, user_b) values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid)) returning id",
        [w.ana, other],
      );
      rows.push(row.id);
    }
    await as("ana@example.com");
    const before = await app.snapshot();
    expect(await read(await setInvites(c.id, rows))).toEqual({ status: 409, body: { error: "too_many_invitees", message: "An event can invite at most 20 people" } });
    expect((await read(await setInvites(c.id, [...rows, ...rows]))).body).toEqual({ error: "too_many_invitees", message: "An event can invite at most 20 people" });
    expect(await app.snapshot()).toEqual(before);
    expect((await setInvites(c.id, rows.slice(0, 20))).status).toBe(200);
    expect((await invitesOf(c.id)).length).toBe(20);
    // The 21st added later is refused too (the limit holds across calls), and nothing changes.
    const mid = await app.snapshot();
    expect((await read(await setInvites(c.id, rows))).body).toEqual({ error: "too_many_invitees", message: "An event can invite at most 20 people" });
    expect(await app.snapshot()).toEqual(mid);
    // Twice the same contact: one row.
    expect((await setInvites(c.id, [rows[0], rows[0]])).status).toBe(200);
    expect((await invitesOf(c.id)).length).toBe(1);
  });

  it("an Outlook event, a demo event and an ended event cannot invite (spec 65: a series event can); an event of someone else or a made-up one is Not found; nothing changes", async () => {
    const w = await world();
    const insert = async (sql: string, params: unknown[]) => (await app.db.admin<{ id: string }>(sql, params))[0].id;
    const series = await insert(
      "insert into app.events (user_id, title, start_at, end_at, series_id) values ($1, 'Lecture', '2030-01-08T10:00:00Z', '2030-01-08T11:00:00Z', '00000000-0000-4000-8000-000000000001') returning id",
      [w.ana],
    );
    const outlook = await insert(
      "insert into app.events (user_id, title, start_at, end_at, source, outlook_id) values ($1, 'From Outlook', '2030-01-08T10:00:00Z', '2030-01-08T11:00:00Z', 'outlook', 'AAMk-attack-1') returning id",
      [w.ana],
    );
    const demo = await insert("insert into app.events (user_id, title, start_at, end_at, demo) values ($1, 'Demo', '2030-01-08T10:00:00Z', '2030-01-08T11:00:00Z', true) returning id", [w.ana]);
    const ended = await insert("insert into app.events (user_id, title, start_at, end_at) values ($1, 'Long ago', '2020-01-08T10:00:00Z', '2020-01-08T11:00:00Z') returning id", [w.ana]);
    const endedAllDay = await insert("insert into app.events (user_id, title, all_day, first_day, last_day) values ($1, 'Last year', true, '2020-01-08', '2020-01-08') returning id", [w.ana]);
    const refusals: Array<[string, unknown]> = [
      [outlook, { status: 409, body: { error: "invites_outlook", message: "Outlook events cannot invite people" } }],
      [demo, { status: 409, body: { error: "invites_demo", message: "Demo events cannot invite people" } }],
      [ended, { status: 409, body: { error: "invites_ended", message: "People can only be invited to events that have not ended" } }],
      [endedAllDay, { status: 409, body: { error: "invites_ended", message: "People can only be invited to events that have not ended" } }],
      [w.samEvent, NOT_FOUND],
      [UNKNOWN, NOT_FOUND],
    ];
    for (const [event, expected] of refusals) {
      expect(await refused("ana@example.com", async () => read(await setInvites(event, [w.anaBen]))), event).toEqual(expected);
    }
    // Sam's event with Sam's own valid contact row: still not Ana's to touch, and not Sam's to share through Ana.
    expect(await refused("ana@example.com", async () => read(await setInvites(w.samEvent, [w.samTom])))).toEqual(NOT_FOUND);
    expect(await app.db.admin("select 1 from app.event_invites where event_id = any($1::uuid[])", [[series, outlook, demo, ended, endedAllDay, w.samEvent]])).toEqual([]);
    // Spec 65: the series event invites Ben; Sam's event stays out of reach also with "this and following".
    expect((await setEventInvites(post(`/api/events/${series}/invites`, { contacts: [w.anaBen] }), app.deps, series)).status).toBe(200);
    expect(await refused("ana@example.com", async () => read(await setEventInvites(post(`/api/events/${w.samEvent}/invites`, { contacts: [w.anaBen], scope: "this_and_following" }), app.deps, w.samEvent)))).toEqual(NOT_FOUND);
  });

  it("a signed-in user, even the owner, cannot insert, update or delete invitation rows by hand", async () => {
    const w = await world();
    for (const [email, sql, params] of [
      ["sam@example.com", "insert into app.event_invites (event_id, contact_id, owner, invitee) values ($1, $2, $3, $4)", [w.eventA, w.samTom, w.tom, w.sam]],
      ["ben@example.com", "insert into app.event_invites (event_id, contact_id, owner, invitee) values ($1, $2, $3, $4)", [w.eventB, w.anaBen, w.ana, w.ben]],
      ["ana@example.com", "insert into app.event_invites (event_id, contact_id, owner, invitee) values ($1, $2, $3, $4)", [w.eventB, w.anaBen, w.ana, w.ben]],
      ["ben@example.com", "update app.event_invites set answer = 'accepted'", []],
      ["ben@example.com", "update app.event_invites set invitee = $1", [w.sam]],
      ["ana@example.com", "update app.event_invites set invitee = $1", [w.sam]],
      ["ana@example.com", "delete from app.event_invites", []],
      ["ben@example.com", "delete from app.event_invites", []],
      ["sam@example.com", "delete from app.event_invites", []],
    ] as const) {
      const user = await as(email);
      const before = await app.snapshot();
      await expect(app.db.withUser(user, (q) => q(sql, [...params])), `${email}: ${sql}`).rejects.toThrow();
      expect(await app.snapshot()).toEqual(before);
    }
  });
});

describe("5. what Ben receives", () => {
  it("through the read functions: only the allowed keys, no notes, to-do, goal, guest, travel mode, updated_at, event id, contact row id or address", async () => {
    const w = await world();
    const rowIds = (await app.db.admin<{ id: string }>("select id from app.contacts")).map((r) => r.id);
    await as("ben@example.com");
    const results = await app.db.withUser(w.ben, async (q) => {
      const cards = cardsOfContacts((await readPeople(q)).contacts);
      return {
        events: await readInvitedEvents(q, new Date(FROM), new Date(TO), cards),
        // the same window, wide, with the whole of January 2030 (event B is Cleo's, not Ben's)
        wide: await readInvitedEvents(q, new Date("2029-12-15T00:00:00Z"), new Date("2030-02-10T00:00:00Z"), cards),
        open: openInvitesOf(await readOpenInviteRows(q), cards),
        people: await readInvitePeople(q, w.benInvite),
        pending: await readPendingInviteCount(q),
      };
    });
    expect(results.events).toHaveLength(1);
    expect(results.wide).toHaveLength(1);
    expect(results.open).toHaveLength(1);
    expect(results.pending).toBe(1);
    expectKeysIn("window", [results.events, results.wide, results.open], [...INVITED_EVENT_KEYS, ...INVITE_PERSON_CARD_KEYS]);
    expectKeysIn("people", results.people, INVITE_PERSON_KEYS);
    // The other invited people are not Ben's contacts: a stand-in key each, never their user id.
    expect(results.people.map((p) => p.userId).sort()).toEqual(["invited-1", "invited-2"]);
    for (const id of [w.cleo, w.fay]) expect(text(results.people).includes(id), "a co-invited person's user id").toBe(false);
    const all = text(results);
    for (const hidden of [...neverForBen(), w.eventA, w.eventB, ...rowIds, "@"]) expect(all.includes(hidden), `contains "${hidden}"`).toBe(false);
    // The window the browser calls gives the same and nothing more.
    const over = await read(await windowRead());
    expectKeysIn("GET window", over.body, ["events", ...INVITED_EVENT_KEYS, ...INVITE_PERSON_CARD_KEYS]);
    for (const hidden of [...neverForBen(), w.eventA, w.eventB, ...rowIds, "@"]) expect(text(over).includes(hidden), `GET window contains "${hidden}"`).toBe(false);
    const others = await read(await people(w.benInvite));
    expectKeysIn("GET people", others.body, ["people", ...INVITE_PERSON_KEYS]);
    for (const hidden of [...neverForBen(), w.eventA, w.eventB, ...rowIds, "@"]) expect(text(others).includes(hidden), `GET people contains "${hidden}"`).toBe(false);
  });

  it("through the calendar page's loader: the invited part has only the allowed keys; the whole result holds nothing of the owner's event but the title, times and place", async () => {
    const w = await world();
    const ownersRows = [w.anaCleo, w.anaFay]; // contact rows of the owner with the others
    const loaded = await loadCalendarPageWithInvites(app.deps, w.ben, "2030-01-08", "week");
    const { invited, open, own, pending, contacts } = loaded.invites;
    expect(invited.map((e) => e.title)).toEqual([M.titleA]);
    expect(open.map((e) => e.title)).toEqual([M.titleA]);
    expect(pending).toBe(1);
    expect(own).toEqual({});
    expectKeysIn("invited and open", [invited, open], [...INVITED_EVENT_KEYS, ...INVITE_PERSON_CARD_KEYS]);
    expectKeysIn("contacts", contacts, INVITE_CONTACT_KEYS);
    // Ben's own contact rows only (Ben's row with Ana is his own); never Ana's rows with Cleo or Fay.
    const bens = (await app.db.admin<{ id: string }>("select id from app.contacts where $1 in (user_a, user_b)", [w.ben])).map((r) => r.id);
    expect(contacts.every((c) => bens.includes(c.contactId))).toBe(true);
    expect(contacts.map((c) => c.userId)).not.toContain(w.cleo);
    expect(contacts.map((c) => c.userId)).not.toContain(w.fay);
    const whole = text(loaded);
    for (const hidden of [...neverForBen(), w.eventA, w.eventB, ...ownersRows, "secret-guest", "@@"]) expect(whole.includes(hidden), `loader contains "${hidden}"`).toBe(false);
    // No address anywhere in the invitation data.
    expect(text(loaded.invites)).not.toContain("@");
    // Not in his own events (R63) either.
    expect(loaded.week.days.flatMap((d) => [...d.events, ...d.allDay])).toEqual([]);
    expect(loaded.week.lead).toEqual([]);
    // Ana's own page does hold her event's id (her own), but never Ben's e-mail address.
    const anas = await loadCalendarPageWithInvites(app.deps, w.ana, "2030-01-08", "week");
    expect(text(anas.invites)).not.toContain("@");
    expectKeysIn("owner's own", Object.values(anas.invites.own), INVITE_PERSON_KEYS);
  });

  it("the second event of the same owner and the other people's own events never appear in Ben's window", async () => {
    const w = await world();
    await as("ben@example.com");
    const got = await read(await windowRead("2030-01-01T00:00:00.000Z", "2030-02-01T00:00:00.000Z"));
    expect((got.body.events as { title: string }[]).map((e) => e.title)).toEqual([M.titleA]);
    expectNone("Ben's window", got, [M.titleB, M.cleoEvent, M.samEvent]);
    expect(w.eventB).toBeTruthy();
  });
});

/** The markers of the owner's event that Ben may not get (the title and place are meant for him). */
function neverForBen(): string[] {
  return [M.notes, M.todo, M.guest, M.goal, M.travel, M.titleB, M.cleoEvent, M.samEvent, M.cleoBio, "updated_at", "updatedAt", "secret-guest"];
}

describe("6. Ben and Cleo are not contacts", () => {
  it("Ben cannot load Cleo's photo, profile, shared calendar or People page data, and cannot invite her as his own contact from what the invitation shows", async () => {
    const w = await world();
    await as("ben@example.com");
    // What the invitation shows him of Cleo: her display name only; no user id, no photo address.
    const shown = (await read(await people(w.benInvite))).body.people as { userId: string; name: string; photoUrl: string | null }[];
    expect(shown.find((p) => p.name === M.cleoName)).toEqual({ userId: expect.stringMatching(/^invited-\d+$/), name: M.cleoName, photoUrl: null, answer: "pending" });
    expect(shown.every((p) => p.photoUrl === null)).toBe(true);
    for (const id of [w.cleo, w.fay]) expect(JSON.stringify(shown)).not.toContain(id);
    // Even with her id (which Ben does not get from the app), nothing opens:

    // The photo answers exactly like a made-up id (status, headers and body), also with If-None-Match.
    const madeUp = await photoAnswer(await photo(UNKNOWN));
    expect(madeUp.status).toBe(404);
    for (const id of [w.cleo, w.fay]) {
      expect(await photoAnswer(await photo(id)), id).toEqual(madeUp);
      expect(await photoAnswer(await photo(id, "*")), id).toEqual(await photoAnswer(await photo(UNKNOWN, "*")));
    }
    // Cleo's profile page data and card.
    expect(await loadPersonProfile(app.deps, w.ben, w.cleo)).toBeNull();
    expect(await loadPersonProfile(app.deps, w.ben, w.fay)).toBeNull();
    expect(await loadPersonProfile(app.deps, w.ben, UNKNOWN)).toBeNull();
    // The other way round too.
    await as("cleo@example.com");
    expect(await loadPersonProfile(app.deps, w.cleo, w.ben)).toBeNull();
    expect(await photoAnswer(await photo(w.ben))).toEqual(madeUp);
    // Her shared calendar (she shares with nobody) and a made-up owner give the same answer.
    await as("ben@example.com");
    const cal = (owner: string) => sharedCalendar(get(`/api/shares/${owner}/calendar?from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}`), app.deps, owner);
    expect(await read(await cal(w.cleo))).toEqual(NOT_FOUND);
    expect(await read(await cal(UNKNOWN))).toEqual(NOT_FOUND);
    // The People page data of Ben holds nothing of her.
    expectNone("Ben's People page", await loadPeoplePage(app.deps, w.ben), [w.cleo, "cleo@example.com", M.cleoName, M.cleoBio, M.cleoEvent, w.fay, "fay@example.com", M.fayName]);
    // The calendar page with shares: nobody of them either.
    expectNone("Ben's calendar with shares", await loadCalendarPageWithShares(app.deps, w.ben, "2030-01-08", "week"), [M.cleoEvent, "cleo@example.com", M.cleoBio]);
    expect(await app.db.withUser(w.ben, async (q) => (await readPeople(q)).contacts.map((c) => c.userId).sort())).toEqual([w.ana, w.tom].sort());
  });

  it("inviting Cleo as a contact needs her address; her user id, her name and anything else the invitation showed make no contact and no invitation", async () => {
    const w = await world();
    await as("ben@example.com");
    const tables = async () => ({
      contacts: await app.db.admin("select * from app.contacts order by 1"),
      invitations: await app.db.admin("select * from app.contact_invitations order by 1"),
    });
    const before = await tables();
    const snapshot = await app.snapshot();
    // The route takes an address only ("no way in" by id); everything else is not an address.
    const learned = [w.cleo, M.cleoName, "Cleo", "cleo", `${w.cleo}@`, "@cleo", `cleo ${M.cleoBio}`, w.benInvite, w.cleoInvite, `"${M.cleoName}" <>`, "cleo@"];
    for (const value of learned) {
      const got = await inviteContact(post("/api/contacts/invite", { email: value }), app.deps);
      expect(got.status, value).toBe(400);
    }
    for (const value of [{ userId: w.cleo }, { contact: w.cleo }, { id: w.cleo }, { email: { id: w.cleo } }, { email: [w.cleo] }]) {
      expect((await inviteContact(post("/api/contacts/invite", value), app.deps)).status).toBe(400);
    }
    expect(await tables()).toEqual(before);
    expect(await app.snapshot()).toEqual(snapshot);
    // Ben cannot reach Cleo through the shares or the invitations either (a contact row id of his own is no way to her).
    expect((await peopleOf(w.ben)).contacts.map((c) => c.userId)).not.toContain(w.cleo);
  });
});

describe("7. what changes when the contact, the event or the time changes", () => {
  it("after Ana removes Fay as a contact, everything Fay could read answers like a made-up id, and her invitation is gone", async () => {
    const w = await world();
    // Before: Fay is a contact and invited and reads the event and the people.
    await as("fay@example.com");
    expect((await read(await windowRead())).body.events).toHaveLength(1);
    expect(((await read(await people(w.fayInvite))).body.people as unknown[]).length).toBe(2);
    expect((await photo(w.ana)).status).toBe(200);
    await removeFay(w);
    expect(await app.db.admin("select 1 from app.event_invites where invitee = $1", [w.fay])).toEqual([]);

    const attempts = async () => ({
      people: await read(await people(w.fayInvite)),
      answer: await read(await answer(w.fayInvite, "accepted")),
      owned: await read(await owned(w.eventA)),
      window: await read(await windowRead()),
      count: await read(await count()),
      photoAna: await photoAnswer(await photo(w.ana)),
      photoBen: await photoAnswer(await photo(w.ben)),
      photoCleo: await photoAnswer(await photo(w.cleo)),
      calendar: await read(await sharedCalendar(get(`/api/shares/${w.ana}/calendar?from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}`), app.deps, w.ana)),
      profile: await loadPersonProfile(app.deps, w.fay, w.ana),
      profileBen: await loadPersonProfile(app.deps, w.fay, w.ben),
    });
    const got = await refused("fay@example.com", attempts);
    const madeUp = await photoAnswer(await photo(UNKNOWN));
    expect(got.people).toEqual(NOT_FOUND);
    expect(got.answer).toEqual(NOT_FOUND);
    expect(got.owned).toEqual(NOT_FOUND);
    expect(got.window).toEqual({ status: 200, body: { events: [] } });
    expect(got.count).toEqual({ status: 200, body: { count: 0 } });
    for (const key of ["photoAna", "photoBen", "photoCleo"] as const) expect(got[key], key).toEqual(madeUp);
    expect(got.calendar).toEqual(NOT_FOUND);
    expect(got.profile).toBeNull();
    expect(got.profileBen).toBeNull();
    expectNone("Fay's answers", got, ALL_OF_EVENT);

    // The loader and the database's name list give her nothing either.
    const loaded = await loadCalendarPageWithInvites(app.deps, w.fay, "2030-01-08", "week");
    expect(loaded.invites).toEqual({ invited: [], open: [], pending: 0, own: {}, contacts: [] });
    const names = await app.db.withUser(w.fay, (q) => q("select user_id from app.invite_person_names($1::uuid[])", [[w.ana, w.ben, w.cleo, w.fay]]));
    expect(names.map((r) => r.user_id)).toEqual([w.fay]);

    // The others stay as they were; Ben no longer sees Fay among the people.
    expect((await invitesOf(w.eventA)).map((i) => i.invitee).sort()).toEqual([w.ben, w.cleo].sort());
    await as("ben@example.com");
    expect(((await read(await people(w.benInvite))).body.people as { name: string }[]).map((p) => p.name)).toEqual([M.cleoName]);
    await as("ana@example.com");
    expect(((await read(await owned(w.eventA))).body.people as { userId: string }[]).map((p) => p.userId).sort()).toEqual([w.ben, w.cleo].sort());

    // Becoming a contact again does not bring the old invitation back.
    await befriend(w.ana, w.fay, "fay@example.com");
    const again = await refused("fay@example.com", async () => ({
      people: await read(await people(w.fayInvite)),
      answer: await read(await answer(w.fayInvite, "accepted")),
      window: await read(await windowRead()),
    }));
    expect(again).toEqual({ people: NOT_FOUND, answer: NOT_FOUND, window: { status: 200, body: { events: [] } } });
  });

  it("Ben removing the contact himself ends his invitation the same way", async () => {
    const w = await world();
    await removeContact(w.ben, w.anaBen);
    const got = await refused("ben@example.com", async () => ({
      people: await read(await people(w.benInvite)),
      answer: await read(await answer(w.benInvite, "accepted")),
      window: await read(await windowRead()),
      count: await read(await count()),
      photo: await photoAnswer(await photo(w.cleo)),
    }));
    expect(got).toEqual({
      people: NOT_FOUND,
      answer: NOT_FOUND,
      window: { status: 200, body: { events: [] } },
      count: { status: 200, body: { count: 0 } },
      photo: await photoAnswer(await photo(UNKNOWN)),
    });
  });

  it("after Ana deletes the event, Ben and Cleo read nothing and cannot answer; the photo of the other invitee is gone too", async () => {
    const w = await world();
    await as("ben@example.com");
    expect((await photoAnswer(await photo(w.cleo))).status).toBe(404);
    await app.db.admin("delete from app.events where id = $1", [w.eventA]);
    expect(await invitesOf(w.eventA)).toEqual([]);
    for (const email of ["ben@example.com", "fay@example.com"]) {
      const user = email.startsWith("ben") ? w.ben : w.fay;
      const invite = email.startsWith("ben") ? w.benInvite : w.fayInvite;
      const got = await refused(email, async () => ({
        people: await read(await people(invite)),
        answer: await read(await answer(invite, "accepted")),
        window: await read(await windowRead()),
        count: await read(await count()),
        loader: (await loadCalendarPageWithInvites(app.deps, user, "2030-01-08", "week")).invites,
      }));
      expect(got.people, email).toEqual(NOT_FOUND);
      expect(got.answer, email).toEqual(NOT_FOUND);
      expect(got.window, email).toEqual({ status: 200, body: { events: [] } });
      expect(got.count, email).toEqual({ status: 200, body: { count: 0 } });
      expect(got.loader.invited).toEqual([]);
      expect(got.loader.open).toEqual([]);
      expectNone(email, got, [M.titleA, M.place, M.notes]);
    }
    await as("ana@example.com");
    expect(await read(await owned(w.eventA))).toEqual(NOT_FOUND);
    // Cleo's second invitation (event B) is untouched.
    expect(await invitesOf(w.eventB)).toHaveLength(1);
  });

  it("R62: moving the event resets every answer to pending; a change of title or place keeps them", async () => {
    const w = await world();
    for (const [email, invite, value] of [
      ["ben@example.com", w.benInvite, "accepted"],
      ["cleo@example.com", w.cleoInvite, "declined"],
      ["fay@example.com", w.fayInvite, "tentative"],
    ] as const) {
      await as(email);
      expect((await answer(invite, value)).status).toBe(200);
    }
    const answers = async () => (await invitesOf(w.eventA)).map((i) => [i.invitee, i.answer]).sort();
    const answered = [[w.ben, "accepted"], [w.cleo, "declined"], [w.fay, "tentative"]].sort();
    expect(await answers()).toEqual(answered);
    // Another field: the answers stay.
    await app.db.admin("update app.events set title = 'Renamed', location = 'Elsewhere', notes = 'More notes' where id = $1", [w.eventA]);
    expect(await answers()).toEqual(answered);
    // The same times written again are no move.
    await app.db.admin("update app.events set start_at = start_at, end_at = end_at where id = $1", [w.eventA]);
    expect(await answers()).toEqual(answered);
    // Another event's move does not touch these answers.
    await app.db.admin("update app.events set start_at = '2030-01-09T12:00:00Z', end_at = '2030-01-09T13:00:00Z' where id = $1", [w.eventB]);
    expect(await answers()).toEqual(answered);
    // A move: all pending, as the owner sees them.
    await app.db.admin("update app.events set start_at = '2030-01-08T14:00:00Z', end_at = '2030-01-08T15:00:00Z' where id = $1", [w.eventA]);
    expect(await answers()).toEqual([[w.ben, "pending"], [w.cleo, "pending"], [w.fay, "pending"]].sort());
    expect(await app.db.admin("select 1 from app.event_invites where event_id = $1 and answered_at is not null", [w.eventA])).toEqual([]);
    await as("ana@example.com");
    const shown = (await read(await owned(w.eventA))).body.people as { answer: string }[];
    expect(shown.map((p) => p.answer)).toEqual(["pending", "pending", "pending"]);
    // Ben's badge counts it again, and he can answer the new time.
    await as("ben@example.com");
    expect(await read(await count())).toEqual({ status: 200, body: { count: 1 } });
    expect((await answer(w.benInvite, "accepted")).status).toBe(200);
    // Making the event all-day is a move too.
    await app.db.admin("update app.events set all_day = true, goal_id = null, first_day = '2030-01-08', last_day = '2030-01-08', start_at = null, end_at = null where id = $1", [w.eventA]);
    expect((await invitesOf(w.eventA)).every((i) => i.answer === "pending")).toBe(true);
  });

  it("Ben, Cleo and Sam cannot move or read Ana's event with their own database access", async () => {
    const w = await world();
    for (const email of ["ben@example.com", "cleo@example.com", "sam@example.com"]) {
      const user = await as(email);
      const before = await app.snapshot();
      const got = await app.db.withUser(user, async (q) => ({
        select: await q("select id, title from app.events where id = $1", [w.eventA]),
        selectAny: (await q("select title from app.events where user_id = $1", [w.ana])).length,
        update: await q("update app.events set start_at = '2031-01-01T10:00:00Z', end_at = '2031-01-01T11:00:00Z', title = 'Hacked' where id = $1 returning id", [w.eventA]),
        del: await q("delete from app.events where id = $1 returning id", [w.eventA]),
        todos: await q("select * from app.event_todos where event_id = $1", [w.eventA]),
        goals: await q("select * from app.goals where user_id = $1", [w.ana]),
      }));
      expect(got, email).toEqual({ select: [], selectAny: 0, update: [], del: [], todos: [], goals: [] });
      expect(await app.snapshot()).toEqual(before);
    }
    expect((await invitesOf(w.eventA)).every((i) => i.answer === "pending")).toBe(true);
  });

  it("with their own database access, an invited person sees only their own invitation row and without the event's id; a stranger sees none; the name list gives no e-mail address", async () => {
    const w = await world();
    const ben = await as("ben@example.com");
    const own = await app.db.withUser(ben, (q) => q("select id, owner, invitee, answer from app.event_invites"));
    expect(own).toEqual([{ id: w.benInvite, owner: w.ana, invitee: w.ben, answer: "pending" }]);
    for (const column of ["event_id", "contact_id"]) {
      await expect(app.db.withUser(ben, (q) => q(`select ${column} from app.event_invites`)), column).rejects.toThrow();
      await expect(app.db.withUser(ben, (q) => q(`select i.${column} from app.event_invites i`)), column).rejects.toThrow();
    }
    await expect(app.db.withUser(ben, (q) => q("select * from app.event_invites"))).rejects.toThrow();
    const sam = await as("sam@example.com");
    expect(await app.db.withUser(sam, (q) => q("select id from app.event_invites"))).toEqual([]);
    // Calling the owner's functions as someone else.
    for (const [user, sql, params] of [
      [sam, "select * from app.event_invitees($1::uuid)", [w.eventA]],
      [ben, "select * from app.event_invitees($1::uuid)", [w.eventA]],
      [sam, "select * from app.invite_people($1::uuid)", [w.benInvite]],
      [ben, "select * from app.invite_people($1::uuid)", [w.cleoInvite]],
      [ben, "select app.set_event_invites($1::uuid, '{}'::uuid[])", [w.eventA]],
      [sam, "select app.answer_event_invite($1::uuid, 'accepted')", [w.benInvite]],
    ] as const) {
      await expect(app.db.withUser(user, (q) => q(sql, [...params])), sql).rejects.toThrow("Not found");
    }
    // Others' lists of invitees by event id: nothing for anyone but the owner.
    for (const user of [sam, ben]) {
      expect(await app.db.withUser(user, (q) => q("select * from app.own_event_invitees($1::uuid[])", [[w.eventA, w.eventB]]))).toEqual([]);
      expect(await app.db.withUser(user, (q) => q("select app.event_has_invites($1::uuid) as has", [w.eventA]))).toEqual([{ has: false }]);
    }
    expect(await app.db.withUser(w.ana, (q) => q("select app.event_has_invites($1::uuid) as has", [w.eventA]))).toEqual([{ has: true }]);
    // The helper that decides "ended" is not callable by users at all.
    await expect(app.db.withUser(ben, (q) => q("select app.event_has_ended($1::uuid)", [w.eventA]))).rejects.toThrow();
    // Names: Sam gets none; Ben gets the others by name and never an address.
    expect(await app.db.withUser(sam, (q) => q("select * from app.invite_person_names($1::uuid[])", [[w.ana, w.ben, w.cleo, w.fay]]))).toEqual([]);
    const bens = await app.db.withUser(ben, (q) => q("select * from app.invite_person_names($1::uuid[])", [[w.ana, w.cleo, w.fay, w.sam, w.tom]]));
    expect(bens.map((r) => r.user_id).sort()).toEqual([w.ana, w.cleo, w.fay, w.tom].sort());
    expect(text(bens)).not.toContain("@");
    expect(bens.find((r) => r.user_id === w.cleo)?.fallback_name).toBeNull();
  });
});

describe("8. from another site", () => {
  it("every POST route is refused without the same-origin header and changes nothing; so are the GET routes that read invitations", async () => {
    const w = await world();
    const raw = (path: string, body: unknown, headers: Record<string, string>) =>
      new Request(`${OWN_ORIGIN}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
    const variants: Record<string, Record<string, string>> = {
      "cross-site with a foreign origin": { host: "localhost:3000", ...CROSS_SITE },
      "foreign origin only": { host: "localhost:3000", origin: "https://evil.example" },
      "cross-site only, right origin": { host: "localhost:3000", origin: OWN_ORIGIN, "sec-fetch-site": "cross-site" },
      "same-site only": { host: "localhost:3000", origin: OWN_ORIGIN, "sec-fetch-site": "same-site" },
      "no origin, no fetch metadata": { host: "localhost:3000" },
      "origin null": { host: "localhost:3000", origin: "null" },
      "foreign host": { host: "evil.example", origin: OWN_ORIGIN, "sec-fetch-site": "same-origin" },
      "foreign origin as a form": { host: "localhost:3000", ...CROSS_SITE, "content-type": "text/plain" },
      "a look-alike origin": { host: "localhost:3000", origin: "http://localhost:3000.evil.example", "sec-fetch-site": "same-origin" },
    };
    const owner = { path: `/api/events/${w.eventA}/invites`, body: { contacts: [w.anaBen] }, run: (r: Request) => setEventInvites(r, app.deps, w.eventA), email: "ana@example.com" };
    const invitee = { path: `/api/invites/${w.benInvite}/answer`, body: { answer: "accepted" }, run: (r: Request) => answerEventInvite(r, app.deps, w.benInvite), email: "ben@example.com" };
    for (const route of [owner, invitee]) {
      await as(route.email);
      const before = await app.snapshot();
      for (const [name, headers] of Object.entries(variants)) {
        const got = await route.run(raw(route.path, route.body, headers));
        expect(got.status, `${route.path}: ${name}`).toBe(403);
        expectNone(name, await got.text(), ALL_OF_EVENT);
      }
      expect(await app.snapshot()).toEqual(before);
    }
    // The reading routes too.
    await as("ben@example.com");
    const gets: Array<[string, () => Promise<Response>]> = [
      ["window", () => windowRead(FROM, TO, CROSS_SITE)],
      ["people", () => people(w.benInvite, CROSS_SITE)],
    ];
    await as("ana@example.com");
    gets.push(["owned", () => owned(w.eventA, CROSS_SITE)]);
    for (const [name, run] of gets) {
      const got = await run();
      expect(got.status, name).toBe(403);
      expectNone(name, await got.text(), ALL_OF_EVENT);
    }
  });
});

describe("9. Ben's own data stays clean", () => {
  it("the invited event is not among Ben's own events: not in his calendar, his own rows or what the coach is sent", async () => {
    const w = await world();
    const plain = await loadCalendarPage(app.deps, w.ben, "2030-01-08", "week");
    expect(plain.week.days.flatMap((d) => [...d.events, ...d.allDay])).toEqual([]);
    expect(plain.week.lead).toEqual([]);
    expectNone("plain loader", plain, [M.titleA, M.place, w.eventA]);
    const shares = await loadCalendarPageWithShares(app.deps, w.ben, "2030-01-08", "week");
    expectNone("loader with shares", shares, [M.titleA, M.place, w.eventA]);
    const withInvites = await loadCalendarPageWithInvites(app.deps, w.ben, "2030-01-08", "week");
    expect(withInvites.week.days.flatMap((d) => [...d.events, ...d.allDay])).toEqual([]);
    // No copy in his table, before or after answering.
    const own = () => app.db.withUser(w.ben, (q) => q("select id from app.events"));
    expect(await own()).toEqual([]);
    await as("ben@example.com");
    const eventsBefore = await app.db.admin("select * from app.events order by id");
    expect((await answer(w.benInvite, "accepted")).status).toBe(200);
    expect(await app.db.admin("select * from app.events order by id")).toEqual(eventsBefore);
    expect(await own()).toEqual([]);
    expect(await app.db.admin("select * from app.event_todos where user_id = $1", [w.ben])).toEqual([]);
  });

  it("the coach of the invited person is sent nothing of the invitation, and the rows it reads are empty", async () => {
    const w = await world();
    // An event inside the coach's 14 days, with Ben and Cleo invited (written directly: the database's own clock decides 'ended').
    const [row] = await app.db.admin<{ id: string }>(
      "insert into app.events (user_id, title, start_at, end_at, location, notes) values ($1, 'COACH-TITLE-MARK', '2026-11-18T10:00:00Z', '2026-11-18T11:00:00Z', 'COACH-PLACE-MARK', 'COACH-NOTES-MARK') returning id",
      [w.ana],
    );
    await app.db.admin("insert into app.event_invites (event_id, contact_id, owner, invitee) values ($1, $2, $3, $4), ($1, $5, $3, $6)", [row.id, w.anaBen, w.ana, w.ben, w.anaCleo, w.cleo]);
    expect(await app.db.withUser(w.ben, (q) => readCalendar(q, app.now(), "UTC"))).toEqual([]);
    await setPlan(app.db, w.ben, "pro");
    await as("ben@example.com");
    expect((await sendMessage(post("/api/chat/messages", { text: "What is on this week?" }), app.deps)).status).toBe(201);
    const request = text(app.assistant.requests.at(-1));
    for (const hidden of ["COACH-TITLE-MARK", "COACH-PLACE-MARK", "COACH-NOTES-MARK", w.ana, "ana@example.com", M.anaName, M.cleoName, w.cleo, row.id, w.anaBen]) {
      expect(request.includes(hidden), `the coach's request contains "${hidden}"`).toBe(false);
    }
  });
});
