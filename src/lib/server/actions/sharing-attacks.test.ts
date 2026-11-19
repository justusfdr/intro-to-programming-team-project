// Attack tests against the people and sharing feature (spec 53; R43, R52 to R58): can one user get at
// another user's data? Cast: Alice owns the data, Bob is her contact, Carol is a former contact (removed),
// Mallory is a stranger with an account, and some addresses have no account at all.
// Alice's data carries unique marker strings in every field. Every answer is checked as a whole
// (JSON.stringify of the body or of the loader's result) for markers that must not be there, and every
// refused request must leave the whole database and the fake services as they were (snapshot()).
// Nothing here fixes anything; a failing test marks a hole.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, OWN_ORIGIN, postJson, read, type TestApp } from "@test/support/app";
import { setPlan } from "@test/support/chat";
import { seedGoal } from "@test/support/goals";
import { readPeople } from "@/lib/server/profiles/cards";
import { loadCalendarPageWithShares, loadPeoplePage, loadPersonProfile } from "@/lib/server/pages/load";
import { answerInvitation, invitationCount, removeContact, withdrawInvitation } from "./contacts";
import { deliverProfilePhoto } from "./deliver-photo";
import { inviteContact } from "./invite-contact";
import { uploadProfilePhoto } from "./profile-photo";
import { sendMessage } from "./send-message";
import { setShare, sharedCalendar } from "./shares";

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
const NEUTRAL = { status: 200, body: { message: "If this person uses LockedIn, they will see your invitation." } };
const UNKNOWN = "00000000-0000-4000-8000-000000000000";
const WINDOW_ERROR = { status: 400, body: { error: "share_window", message: "Choose at most 62 days" } };

const M = {
  title1: "TITLE-MARK-1",
  title2: "TITLE-MARK-2",
  titleAllDay: "TITLE-MARK-ALLDAY",
  titleNight: "TITLE-MARK-NIGHT",
  place1: "PLACE-MARK-1",
  place2: "PLACE-MARK-2",
  notes: "NOTES-MARK",
  guest: "guest-mark@example.com",
  todo: "TODO-MARK",
  goal: "GOAL-MARK",
  demo: "DEMO-MARK",
  bio: "BIO-MARK",
  aliceName: "Alice NAME-MARK",
  bobName: "Bob ZETA-NAME",
  bobBio: "ZETA-BIOGRAPHY",
};
/** Never allowed in what Bob (busy) gets. */
const PRIVATE_FOR_BUSY = [M.title1, M.title2, M.titleAllDay, M.titleNight, M.place1, M.place2, M.notes, M.guest, M.todo, M.goal, M.demo, "TITLE-MARK", "PLACE-MARK"];
/** Never allowed in what Bob (details) gets. */
const PRIVATE_FOR_DETAILS = [M.notes, M.guest, M.todo, M.goal, M.demo];
/** Everything of Alice that a stranger must never get anywhere. */
const ALL_OF_ALICE = [...PRIVATE_FOR_BUSY, M.bio, M.aliceName, "NAME-MARK", "alice@example.com"];

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  postJson(path, body, { "x-forwarded-for": `10.9.0.${client}`, ...headers });
const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(`${OWN_ORIGIN}${path}`, { method: "GET", headers: { host: "localhost:3000", "sec-fetch-site": "same-origin", ...headers } });

const invite = (email: unknown, headers?: Record<string, string>) => inviteContact(post("/api/contacts/invite", { email }, headers), app.deps);
const answer = (id: string, body: unknown = { accept: true }, headers?: Record<string, string>) =>
  answerInvitation(post(`/api/contacts/invitations/${id}/answer`, body, headers), app.deps, id);
const withdraw = (id: string, headers?: Record<string, string>) => withdrawInvitation(post(`/api/contacts/invitations/${id}/withdraw`, {}, headers), app.deps, id);
const remove = (id: string, headers?: Record<string, string>) => removeContact(post(`/api/contacts/${id}/remove`, {}, headers), app.deps, id);
const share = (contactId: string, body: unknown, headers?: Record<string, string>) =>
  setShare(post(`/api/contacts/${contactId}/share`, body, headers), app.deps, contactId);
const FROM = "2026-11-16T00:00:00.000Z";
const TO = "2026-11-23T00:00:00.000Z";
const calendar = (owner: string, from: string | null = FROM, to: string | null = TO, headers?: Record<string, string>) => {
  const params = [from === null ? "" : `from=${encodeURIComponent(from)}`, to === null ? "" : `to=${encodeURIComponent(to)}`].filter(Boolean).join("&");
  return sharedCalendar(get(`/api/shares/${owner}/calendar?${params}`, headers), app.deps, owner);
};
const photo = (id: string, ifNoneMatch: string | null = null) => deliverProfilePhoto(app.deps, id, ifNoneMatch);
const people = (user: string) => app.db.withUser(user, readPeople);
const as = (email: string) => app.signedInAs(email);

const b64 = (head: number[], fill = 60) => Buffer.concat([Buffer.from(head), Buffer.alloc(fill, 7)]).toString("base64");
const JPEG = b64([0xff, 0xd8, 0xff, 0xe0]);
const PNG = b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const headersOf = (response: Response) => Object.fromEntries(response.headers.entries());
/** Status, headers and body of a photo answer, to compare one 404 with another, byte for byte. */
async function photoAnswer(response: Response) {
  return { status: response.status, headers: headersOf(response), body: await response.text() };
}

/** The text of a whole answer or loader result, for marker searches. */
const text = (value: unknown) => JSON.stringify(value);
function expectNone(label: string, value: unknown, markers: string[]) {
  const all = text(value);
  for (const marker of markers) expect(all.includes(marker), `${label} contains "${marker}"`).toBe(false);
}

/**
 * Signs in as `email`, runs the attack and proves nothing changed: the whole database, the fake sign-in
 * service, its e-mails and the session are the same afterwards.
 */
async function refused<T>(email: string, attack: () => Promise<T>): Promise<T> {
  await as(email);
  const before = await app.snapshot();
  const result = await attack();
  expect(await app.snapshot()).toEqual(before);
  return result;
}

type World = { alice: string; bob: string; carol: string; mallory: string; aliceBob: string; aliceCarol: string };

/** Makes two users contacts in the database, as the actions do; returns the contact row's id. */
async function befriend(from: string, to: string, toEmail: string): Promise<string> {
  await app.db.withUser(from, (q) => q("select app.invite_contact($1)", [toEmail]));
  const received = (await people(to)).received.find((r) => r.userId === from)!;
  await app.db.withUser(to, (q) => q("select app.answer_invitation($1::uuid, true)", [received.id]));
  return (await people(from)).contacts.find((c) => c.userId === to)!.id;
}

const level = (owner: string, contactId: string, calendarLevel: "none" | "busy" | "details") =>
  app.db.withUser(owner, (q) => q("select app.set_share($1::uuid, $2::text, false)", [contactId, calendarLevel]));

/**
 * Alice owns the data. Bob and Carol are her contacts (nothing shared yet), Mallory is a stranger. Alice's
 * calendar has an event for every field (markers everywhere), a goal, a to-do, an all-day event, a demo
 * event, two touching events and one that runs overnight; she has a name, a bio and a photo. Bob has a
 * name, a bio and a photo too. The session ends with Alice.
 */
async function world(): Promise<World> {
  const mallory = await as("mallory@example.com");
  const carol = await as("carol@example.com");
  const bob = await as("bob@example.com");
  const alice = await as("alice@example.com");
  await app.db.withUser(alice, (q) => q("select app.set_profile($1, $2, null)", [M.aliceName, M.bio]));
  await app.db.withUser(bob, (q) => q("select app.set_profile($1, $2, null)", [M.bobName, M.bobBio]));

  const goal = await seedGoal(app.db, alice, { title: M.goal, deadline: "2027-03-14", rules: [{ kind: "count", target: 2 }] });
  const [first] = await app.db.admin<{ id: string }>(
    `insert into app.events (user_id, title, start_at, end_at, location, notes, guests, goal_id)
     values ($1, $2, '2026-11-17T09:00:00Z', '2026-11-17T10:00:00Z', $3, $4, $5, $6) returning id`,
    [alice, M.title1, M.place1, M.notes, [M.guest], goal.id],
  );
  await app.db.admin("insert into app.event_todos (user_id, event_id, title, position) values ($1, $2, $3, 0)", [alice, first.id, M.todo]);
  await app.db.admin(
    `insert into app.events (user_id, title, start_at, end_at, location) values
       ($1, $2, '2026-11-17T10:00:00Z', '2026-11-17T11:00:00Z', $3),
       ($1, $4, '2026-11-19T22:00:00Z', '2026-11-20T02:00:00Z', null)`,
    [alice, M.title2, M.place2, M.titleNight],
  );
  await app.db.admin("insert into app.events (user_id, title, all_day, first_day, last_day) values ($1, $2, true, '2026-11-18', '2026-11-18')", [alice, M.titleAllDay]);
  await app.db.admin("insert into app.events (user_id, title, start_at, end_at, demo) values ($1, $2, '2026-11-18T13:00:00Z', '2026-11-18T14:00:00Z', true)", [alice, M.demo]);

  const aliceBob = await befriend(alice, bob, "bob@example.com");
  const aliceCarol = await befriend(alice, carol, "carol@example.com");

  await as("alice@example.com");
  expect((await uploadProfilePhoto(post("/api/profile/photo", { data: JPEG }), app.deps)).status).toBe(200);
  await as("bob@example.com");
  expect((await uploadProfilePhoto(post("/api/profile/photo", { data: PNG }), app.deps)).status).toBe(200);
  await as("alice@example.com");
  return { alice, bob, carol, mallory, aliceBob, aliceCarol };
}

// ---------------------------------------------------------------------------------------------------

describe("1. reading Alice's calendar without a share", () => {
  it("Mallory, Bob without a share, Carol after removal, an unknown and a malformed id all get the very same answer", async () => {
    const w = await world();
    await level(w.alice, w.aliceCarol, "details"); // Carol had a share while she was a contact
    await as("alice@example.com");
    expect((await remove(w.aliceCarol)).status).toBe(200);
    const answers: Record<string, { status: number; body: unknown }> = {};
    answers.mallory = await refused("mallory@example.com", async () => read(await calendar(w.alice)));
    answers.bobNoShare = await refused("bob@example.com", async () => read(await calendar(w.alice)));
    answers.carolRemoved = await refused("carol@example.com", async () => read(await calendar(w.alice)));
    answers.unknown = await refused("bob@example.com", async () => read(await calendar(UNKNOWN)));
    answers.malformed = await refused("bob@example.com", async () => read(await calendar("not-an-id")));
    answers.sqlish = await refused("bob@example.com", async () => read(await calendar("' or 1=1 --")));
    answers.upper = await refused("mallory@example.com", async () => read(await calendar(w.alice.toUpperCase())));
    for (const [who, got] of Object.entries(answers)) {
      expect(got, who).toEqual(NOT_FOUND);
      expectNone(who, got, ALL_OF_ALICE);
    }
  });
});

describe("2. the two levels of sharing", () => {
  it("busy: times only, nothing of the title, place, notes, guests, to-do, goal or demo event anywhere; touching events are merged", async () => {
    const w = await world();
    await level(w.alice, w.aliceBob, "busy");
    const got = await refused("bob@example.com", async () => read(await calendar(w.alice)));
    expect(got.status).toBe(200);
    expect(got.body.level).toBe("busy");
    expectNone("busy answer", got, [...PRIVATE_FOR_BUSY, M.bio, M.aliceName, "alice@example.com", w.alice]);
    const events = got.body.events as Record<string, unknown>[];
    const timed = events.filter((e) => e.allDay === false);
    // 09:00-10:00 and 10:00-11:00 touch and are one block; the overnight event is one block; the demo event is not there.
    expect(timed).toEqual([
      { allDay: false, startAt: "2026-11-17T09:00:00.000Z", endAt: "2026-11-17T11:00:00.000Z" },
      { allDay: false, startAt: "2026-11-19T22:00:00.000Z", endAt: "2026-11-20T02:00:00.000Z" },
    ]);
    expect(events.filter((e) => e.allDay === true)).toEqual([{ allDay: true, firstDay: "2026-11-18", lastDay: "2026-11-18" }]);
    for (const event of events) expect(Object.keys(event).sort()).toEqual(event.allDay ? ["allDay", "firstDay", "lastDay"] : ["allDay", "endAt", "startAt"]);
    expect(Object.keys(got.body).sort()).toEqual(["events", "level"]);
  });

  it("details: title and place yes; notes, guests, to-dos, goal and demo events never", async () => {
    const w = await world();
    await level(w.alice, w.aliceBob, "details");
    const got = await refused("bob@example.com", async () => read(await calendar(w.alice)));
    expect(got.status).toBe(200);
    expect(got.body.level).toBe("details");
    const all = text(got);
    expect(all).toContain(M.title1);
    expect(all).toContain(M.place1);
    expectNone("details answer", got, [...PRIVATE_FOR_DETAILS, M.bio, M.aliceName, "alice@example.com", w.alice]);
    for (const event of got.body.events as Record<string, unknown>[]) {
      expect(Object.keys(event).sort()).toEqual(event.allDay ? ["allDay", "firstDay", "lastDay", "location", "title"] : ["allDay", "endAt", "location", "startAt", "title"]);
    }
  });

  it("the share is one-way: Bob sharing with Alice gives Bob nothing of Alice's", async () => {
    const w = await world();
    await level(w.bob, w.aliceBob, "details"); // Bob shares his calendar with Alice; Alice shares nothing
    const got = await refused("bob@example.com", async () => read(await calendar(w.alice)));
    expect(got).toEqual(NOT_FOUND);
  });
});

describe("3. withdrawing a share and removing a contact", () => {
  it("Alice switches the share to none: Bob's next read is 'Not found'", async () => {
    const w = await world();
    await level(w.alice, w.aliceBob, "details");
    await as("bob@example.com");
    expect((await calendar(w.alice)).status).toBe(200);
    await as("alice@example.com");
    expect((await share(w.aliceBob, { calendar: "none", focus: false })).status).toBe(200);
    const got = await refused("bob@example.com", async () => read(await calendar(w.alice)));
    expect(got).toEqual(NOT_FOUND);
    expect((await loadCalendarPageWithShares(app.deps, w.bob)).sharing).toEqual([]);
  });

  for (const remover of ["alice", "bob"] as const) {
    it(`${remover} removes the contact: Bob's calendar read, his view of Alice's profile and her photo are gone, like a made-up id`, async () => {
      const w = await world();
      await level(w.alice, w.aliceBob, "details");
      await as("bob@example.com");
      expect((await photo(w.alice)).status).toBe(200);
      expect((await loadPersonProfile(app.deps, w.bob, w.alice))?.person.userId).toBe(w.alice);
      await as(`${remover}@example.com`);
      expect((await remove(w.aliceBob)).status).toBe(200);

      const madeUp = await refused("bob@example.com", async () => photoAnswer(await photo(UNKNOWN)));
      const gone = await refused("bob@example.com", async () => photoAnswer(await photo(w.alice)));
      expect(gone).toEqual(madeUp);
      expect(madeUp.status).toBe(404);
      expect(await refused("bob@example.com", async () => read(await calendar(w.alice)))).toEqual(NOT_FOUND);
      expect(await loadPersonProfile(app.deps, w.bob, w.alice)).toBeNull();
      expect(await loadPersonProfile(app.deps, w.bob, UNKNOWN)).toBeNull();
      // And the other way round: Alice sees nothing of Bob either.
      expect(await loadPersonProfile(app.deps, w.alice, w.bob)).toBeNull();
      await as("alice@example.com");
      expect(await photoAnswer(await photo(w.bob))).toEqual(madeUp);
      expectNone("Bob's People page", await loadPeoplePage(app.deps, w.bob), [...ALL_OF_ALICE, w.alice]);
      expectNone("Bob's calendar page", await loadCalendarPageWithShares(app.deps, w.bob), [...ALL_OF_ALICE, w.alice]);
      expectNone("Alice's People page", await loadPeoplePage(app.deps, w.alice), [M.bobName, M.bobBio, w.bob, "bob@example.com"]);
    });
  }

  it("a removed contact comes back later: the old share does not come back with them", async () => {
    const w = await world();
    await level(w.alice, w.aliceCarol, "details");
    await as("alice@example.com");
    await remove(w.aliceCarol);
    await befriend(w.alice, w.carol, "carol@example.com");
    const got = await refused("carol@example.com", async () => read(await calendar(w.alice)));
    expect(got).toEqual(NOT_FOUND);
  });
});

describe("4. share writes", () => {
  it("Mallory posts to the share of Alice and Bob: refused, nothing changes", async () => {
    const w = await world();
    await level(w.alice, w.aliceBob, "details");
    await level(w.bob, w.aliceBob, "busy");
    const answers = await refused("mallory@example.com", async () => [
      await read(await share(w.aliceBob, { calendar: "none", focus: false })),
      await read(await share(w.aliceBob, { calendar: "details", focus: true })),
      await read(await share(w.aliceBob, { calendar: "none", focus: false, owner: w.alice, viewer: w.mallory, userId: w.alice, contact_id: w.aliceBob })),
      await read(await share(w.aliceBob.toUpperCase(), { calendar: "none", focus: false })),
    ]);
    for (const got of answers) expect(got).toEqual(NOT_FOUND);
    const alice = await loadPeoplePage(app.deps, w.alice);
    expect(alice.shares).toEqual([{ contactId: w.aliceBob, userId: w.bob, out: { calendar: "details", focus: false }, in: { calendar: "busy", focus: false } }]);
  });

  it("Bob posts to the share: only what Bob shares with Alice changes; what Alice shares with Bob is untouched", async () => {
    const w = await world();
    await level(w.alice, w.aliceBob, "details");
    await as("bob@example.com");
    expect((await share(w.aliceBob, { calendar: "busy", focus: false })).status).toBe(200);
    const alice = await loadPeoplePage(app.deps, w.alice);
    expect(alice.shares).toEqual([{ contactId: w.aliceBob, userId: w.bob, out: { calendar: "details", focus: false }, in: { calendar: "busy", focus: false } }]);
    const bob = await loadPeoplePage(app.deps, w.bob);
    expect(bob.shares).toEqual([{ contactId: w.aliceBob, userId: w.alice, out: { calendar: "busy", focus: false }, in: { calendar: "details", focus: false } }]);
    // Bob still reads Alice at the level Alice chose, not at the one Bob wrote.
    expect(((await read(await calendar(w.alice))).body as { level: string }).level).toBe("details");
  });

  it("a body with extra keys (owner, viewer, userId, contact_id) is refused or the keys have no effect", async () => {
    const w = await world();
    await level(w.alice, w.aliceBob, "details");
    await as("bob@example.com");
    const extra = { calendar: "none", focus: false, owner: w.alice, viewer: w.bob, userId: w.alice, user_id: w.alice, contact_id: w.aliceCarol, direction: "out", level: "details" };
    const got = await read(await share(w.aliceBob, extra));
    expect([200, 400]).toContain(got.status);
    const alice = await loadPeoplePage(app.deps, w.alice);
    // Alice's side is untouched, Carol's contact row is untouched, and nothing was written to Alice's account by Bob.
    expect(alice.shares.find((s) => s.contactId === w.aliceBob)?.out).toEqual({ calendar: "details", focus: false });
    expect(alice.shares.find((s) => s.contactId === w.aliceCarol)).toBeUndefined();
    expect(((await read(await calendar(w.alice))).body as { level: string }).level).toBe("details");
  });

  it("invalid levels and shapes are refused; nothing changes", async () => {
    const w = await world();
    await level(w.alice, w.aliceBob, "busy");
    const bodies: unknown[] = [
      { calendar: "everything", focus: false },
      { calendar: "", focus: false },
      { calendar: null, focus: false },
      { calendar: "DETAILS", focus: false },
      { calendar: "busy ", focus: false },
      { calendar: ["busy"], focus: false },
      { calendar: 1, focus: false },
      { calendar: { x: 1 }, focus: false },
      // Adjusted after the security review (I4): a body without "focus" is now accepted (the server keeps
      // the stored flag itself), so { calendar: "busy" } moved out of this list; see below.
      { calendar: "busy", focus: "yes" },
      {},
      [],
      "busy",
      null,
    ];
    await refused("alice@example.com", async () => {
      for (const body of bodies) expect((await share(w.aliceBob, body)).status, text(body)).toBe(400);
      expect((await share(w.aliceBob, "{not json")).status).toBe(400);
    });
    expect(((await loadPeoplePage(app.deps, w.alice)).shares[0]).out.calendar).toBe("busy");
    // Without "focus" the level is saved and the stored flag stays as it was (false here).
    await as("alice@example.com");
    expect((await share(w.aliceBob, { calendar: "busy" })).status).toBe(200);
    expect(((await loadPeoplePage(app.deps, w.alice)).shares[0]).out).toEqual({ calendar: "busy", focus: false });
  });

  it("Carol cannot write a share on her removed contact row", async () => {
    const w = await world();
    await level(w.alice, w.aliceCarol, "details");
    await as("alice@example.com");
    await remove(w.aliceCarol);
    const got = await refused("carol@example.com", async () => read(await share(w.aliceCarol, { calendar: "details", focus: false })));
    expect(got).toEqual(NOT_FOUND);
  });
});

describe("5. invitations", () => {
  it("Mallory, the invitee (withdraw), the sender (accept) and wrong ids are all refused alike; answering twice and after withdrawal too", async () => {
    const w = await world();
    const dave = await as("dave@example.com");
    await app.db.withUser(w.alice, (q) => q("select app.invite_contact('dave@example.com')"));
    const invitation = (await people(dave)).received.find((r) => r.userId === w.alice)!.id;
    const sentId = (await people(w.alice)).sent.find((s) => s.email === "dave@example.com")!.id;

    const attacks: Array<[string, string, () => Promise<Response>]> = [
      ["mallory answers (accept)", "mallory@example.com", () => answer(invitation, { accept: true })],
      ["mallory answers (decline)", "mallory@example.com", () => answer(invitation, { accept: false })],
      ["mallory withdraws", "mallory@example.com", () => withdraw(invitation)],
      ["mallory withdraws by the sender's list id", "mallory@example.com", () => withdraw(sentId)],
      ["bob (a contact of the sender, not the invitee) answers", "bob@example.com", () => answer(invitation, { accept: true })],
      ["the invitee withdraws", "dave@example.com", () => withdraw(invitation)],
      ["the sender accepts her own", "alice@example.com", () => answer(invitation, { accept: true })],
      ["the sender declines her own", "alice@example.com", () => answer(invitation, { accept: false })],
      ["a contact row id used as invitation id", "mallory@example.com", () => answer(w.aliceBob, { accept: true })],
      ["a contact row id withdrawn", "mallory@example.com", () => withdraw(w.aliceBob)],
      ["an unknown id", "dave@example.com", () => answer(UNKNOWN, { accept: true })],
    ];
    for (const [label, who, run] of attacks) {
      const got = await refused(who, async () => read(await run()));
      expect(got, label).toEqual(NOT_FOUND);
    }
    // The invitation is still open and Alice and Dave are not contacts.
    expect((await people(dave)).received).toHaveLength(1);
    expect((await people(w.alice)).contacts.some((c) => c.userId === dave)).toBe(false);

    // The invitee answers for real; a second answer and a withdrawal after it are refused alike.
    await as("dave@example.com");
    expect((await answer(invitation, { accept: true })).status).toBe(200);
    const again = await refused("dave@example.com", async () => [await read(await answer(invitation, { accept: true })), await read(await answer(invitation, { accept: false }))]);
    expect(again).toEqual([NOT_FOUND, NOT_FOUND]);
    expect(await refused("alice@example.com", async () => read(await withdraw(invitation)))).toEqual(NOT_FOUND);
  });

  it("answering after the sender withdrew is refused; no contact appears", async () => {
    const w = await world();
    const erin = await as("erin@example.com");
    await app.db.withUser(w.alice, (q) => q("select app.invite_contact('erin@example.com')"));
    const invitation = (await people(erin)).received[0].id;
    await as("alice@example.com");
    expect((await withdraw(invitation)).status).toBe(200);
    expect(await refused("erin@example.com", async () => read(await answer(invitation, { accept: true })))).toEqual(NOT_FOUND);
    expect((await people(w.alice)).contacts.some((c) => c.userId === erin)).toBe(false);
    expect((await people(erin)).contacts).toEqual([]);
  });

  it("an answer body with extra keys cannot name another user or another relation", async () => {
    const w = await world();
    const gus = await as("gus@example.com");
    await app.db.withUser(w.alice, (q) => q("select app.invite_contact('gus@example.com')"));
    const invitation = (await people(gus)).received[0].id;
    await as("mallory@example.com");
    const got = await refused("mallory@example.com", async () =>
      read(await answer(invitation, { accept: true, user: w.mallory, userId: gus, from_user: w.alice, to_user: w.mallory })),
    );
    expect(got).toEqual(NOT_FOUND);
    expect((await people(w.mallory)).contacts).toEqual([]);
  });
});

describe("6. no account enumeration through invitations", () => {
  it("five kinds of address give byte-identical answers, and Alice's People data does not tell an account from none", async () => {
    const w = await world();
    const eve = await as("eve@example.com");
    await app.db.withUser(eve, (q) => q("select app.set_profile('Eve EVE-MARK', 'EVEBIO-MARK', null)"));
    const dave = await as("dave@example.com");
    await app.db.withUser(w.alice, (q) => q("select app.invite_contact('dave@example.com')"));
    const fromAlice = (await people(dave)).received[0].id;
    await app.db.withUser(dave, (q) => q("select app.answer_invitation($1::uuid, false)", [fromAlice])); // Dave declined Alice
    await app.db.withUser(w.alice, (q) => q("select app.invite_contact('frank@example.com')")); // already invited, no account
    await as("alice@example.com");
    const before = await app.snapshot();

    const targets = [
      ["an address with an account", "eve@example.com"],
      ["an address without an account", "nobody@example.com"],
      ["Bob, already her contact", "bob@example.com"],
      ["someone who declined her", "dave@example.com"],
      ["someone she already invited", "frank@example.com"],
    ] as const;
    const raw: Array<{ status: number; headers: Record<string, string>; body: string }> = [];
    for (const [, email] of targets) {
      const response = await invite(email);
      raw.push({ status: response.status, headers: headersOf(response), body: await response.text() });
    }
    expect(JSON.parse(raw[0].body)).toEqual(NEUTRAL.body);
    for (const [index, got] of raw.entries()) expect(got, targets[index][0]).toEqual(raw[0]);
    expect(await app.snapshot()).not.toEqual(before); // (a) and (b) did write an invitation row: this proves the test saw real work

    const page = await loadPeoplePage(app.deps, w.alice);
    expectNone("Alice's People page", page, [eve, "EVE-MARK", "EVEBIO-MARK", dave, `/api/profiles/${eve}/photo`]);
    const sentTo = (email: string) => page.people.sent.filter((s) => s.email === email);
    const a = sentTo("eve@example.com");
    const b = sentTo("nobody@example.com");
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(Object.keys(a[0]).sort()).toEqual(Object.keys(b[0]).sort());
    expect(Object.keys(a[0]).sort()).toEqual(["email", "id", "sentAt"]);
    expect(page.people.contacts.map((c) => c.userId).sort()).toEqual([w.bob, w.carol].sort());
    // The invited account got the invitation (by design); the stranger address leaves no trace of "no account" anywhere.
    expect((await people(eve)).received.map((r) => r.userId)).toEqual([w.alice]);
  });
});

describe("7. odd addresses", () => {
  it("own address in other letter case or with spaces; 300 characters; quotes and SQL; empty: refused or plain text, nothing breaks", async () => {
    const w = await world();
    const eventsBefore = (await app.db.admin<{ n: string }>("select count(*)::text as n from app.events"))[0].n;
    const selfs = ["ALICE@EXAMPLE.COM", "Alice@Example.com", "  alice@example.com  ", "\talice@example.com\n"];
    const odd = [
      `${"a".repeat(290)}@example.com`,
      `${"a".repeat(300)}`,
      `"quoted"@example.com`,
      `x@example.com'; drop table app.events; --`,
      `'; drop table app.events; --@example.com`,
      "a@b.com; drop table app.events",
      "",
      "   ",
      "not an address",
      "a@b",
      "x".repeat(5000),
    ];
    const results = await refused("alice@example.com", async () => {
      const out: Array<[string, number]> = [];
      for (const email of [...selfs, ...odd]) out.push([email.slice(0, 40), (await invite(email)).status]);
      for (const email of [null, 5, {}, [], true]) out.push([text(email), (await invite(email)).status]);
      out.push(["no body key", (await inviteContact(post("/api/contacts/invite", {}), app.deps)).status]);
      return out;
    });
    for (const [label, status] of results) expect(status, label).toBe(400);
    expect((await app.db.admin<{ n: string }>("select count(*)::text as n from app.events"))[0].n).toBe(eventsBefore);
    expect((await people(w.alice)).sent).toEqual([]);
  });
});

describe("8. an invitation that is not answered yet (R43)", () => {
  it("the invitee sees the inviter's card and photo; the inviter gets nothing of the invitee; after a decline neither sees the other", async () => {
    const w = await world();
    const hal = await as("hal@example.com");
    await app.db.withUser(hal, (q) => q("select app.set_profile('Hal HALNAME-X', 'HALBIO-X', null)"));
    await app.auth.signOut();
    await as("hal@example.com");
    expect((await uploadProfilePhoto(post("/api/profile/photo", { data: PNG }), app.deps)).status).toBe(200);
    await as("alice@example.com");
    expect((await invite("hal@example.com")).status).toBe(200);
    const HAL_PRIVATE = ["HALNAME-X", "HALBIO-X", hal, `/api/profiles/${hal}/photo`];

    // Hal (invitee): may see Alice's card and photo (an open inviter).
    const card = await loadPersonProfile(app.deps, hal, w.alice);
    expect(card?.person.userId).toBe(w.alice);
    expect(card?.relation).toBeNull();
    await as("hal@example.com");
    expect((await photo(w.alice)).status).toBe(200);
    // Alice (inviter): nothing of Hal.
    const madeUp = await photoAnswer(await photo(UNKNOWN));
    await as("alice@example.com");
    expect(await loadPersonProfile(app.deps, w.alice, hal)).toBeNull();
    expect(await photoAnswer(await photo(hal))).toEqual(madeUp);
    const beforeDecline = await loadPeoplePage(app.deps, w.alice);
    expectNone("Alice's People page", beforeDecline, HAL_PRIVATE);
    expectNone("Alice's calendar page", await loadCalendarPageWithShares(app.deps, w.alice), HAL_PRIVATE);
    expect(beforeDecline.people.sent.map((s) => Object.keys(s).sort())).toEqual([["email", "id", "sentAt"]]);
    // The only address Alice sees is the one she typed herself.
    expect(beforeDecline.people.sent[0].email).toBe("hal@example.com");

    // Hal declines.
    const invitation = (await people(hal)).received[0].id;
    await as("hal@example.com");
    expect((await answer(invitation, { accept: false })).status).toBe(200);
    expect(await loadPersonProfile(app.deps, hal, w.alice)).toBeNull();
    expect(await photoAnswer(await photo(w.alice))).toEqual(madeUp);
    expect((await people(hal)).received).toEqual([]);
    await as("alice@example.com");
    expect(await loadPersonProfile(app.deps, w.alice, hal)).toBeNull();
    expect(await photoAnswer(await photo(hal))).toEqual(madeUp);
    // Alice's view is the same as before the decline (she cannot tell a decline from a pending invitation).
    expect(await loadPeoplePage(app.deps, w.alice)).toEqual(beforeDecline);
  });

  it("Mallory invites Alice: Alice may see Mallory's card, Mallory still gets nothing of Alice", async () => {
    const w = await world();
    await as("mallory@example.com");
    expect((await invite("alice@example.com")).status).toBe(200);
    expect(await loadPersonProfile(app.deps, w.mallory, w.alice)).toBeNull();
    expect(await photoAnswer(await photo(w.alice))).toEqual(await photoAnswer(await photo(UNKNOWN)));
    expect(await read(await calendar(w.alice))).toEqual(NOT_FOUND);
    // (her own typed address is in her "sent" list, so the address itself is not searched for here)
    expectNone("Mallory's People page", await loadPeoplePage(app.deps, w.mallory), [...ALL_OF_ALICE.filter((m) => m !== "alice@example.com"), w.alice]);
  });
});

describe("9. the photo", () => {
  it("Mallory and Carol get the same 404 as for a made-up id, also with the real ETag; never a 304", async () => {
    const w = await world();
    await as("bob@example.com");
    const real = await photo(w.alice);
    expect(real.status).toBe(200);
    const etag = real.headers.get("etag")!;
    expect(etag).toMatch(/^"\d+"$/);
    await as("alice@example.com");
    await remove(w.aliceCarol);

    const madeUp = await refused("mallory@example.com", async () => photoAnswer(await photo(UNKNOWN)));
    expect(madeUp.status).toBe(404);
    const headersToTry = [null, etag, `W/${etag}`, `"0", ${etag}`, "*"];
    for (const who of ["mallory@example.com", "carol@example.com"]) {
      await refused(who, async () => {
        for (const header of headersToTry) {
          const got = await photoAnswer(await photo(w.alice, header));
          expect(got, `${who} with If-None-Match ${header}`).toEqual(madeUp);
          expect(got.status).not.toBe(304);
          expect(got.headers.etag).toBeUndefined();
        }
        expect(await photoAnswer(await photo(w.alice.toUpperCase(), etag))).toEqual(madeUp);
      });
    }
  });

  it("planted rows in event_invites and in the old lists tables do not open the photo or the card", async () => {
    const w = await world();
    const [event] = await app.db.admin<{ id: string }>("select id from app.events where user_id = $1 limit 1", [w.alice]);
    const planted: string[] = [];
    const plant = async (label: string, sql: string, params: unknown[]) => {
      try {
        await app.db.admin(sql, params);
        planted.push(label);
      } catch (error) {
        planted.push(`${label} (could not be planted: ${(error as Error).message.slice(0, 60)})`);
      }
    };
    await plant(
      "event_invites alice->mallory",
      "insert into app.event_invites (event_id, contact_id, owner, invitee) values ($1, $2, $3, $4)",
      [event.id, w.aliceBob, w.alice, w.mallory],
    );
    // The trigger that keeps an invitation to the two people of its contact is switched off for one insert, to plant the row anyway.
    await app.db.admin("set session_replication_role = replica");
    await plant(
      "event_invites alice->mallory (trigger off)",
      "insert into app.event_invites (event_id, contact_id, owner, invitee) values ($1, $2, $3, $4)",
      [event.id, w.aliceBob, w.alice, w.mallory],
    );
    await app.db.admin("set session_replication_role = origin");
    await plant("lists", "insert into app.lists (id, owner, title) values ($1, $2, 'LIST-MARK')", ["11111111-1111-4111-8111-111111111111", w.alice]);
    await plant(
      "list_members mallory",
      "insert into app.list_members (list_id, user_id, contact_id) values ($1, $2, $3)",
      ["11111111-1111-4111-8111-111111111111", w.mallory, w.aliceBob],
    );
    console.info("planted:", planted);

    const madeUp = await refused("carol@example.com", async () => photoAnswer(await photo(UNKNOWN)));
    await as("mallory@example.com");
    await app.db.admin("delete from app.profile_photos where false");
    const before = await app.snapshot();
    expect(await photoAnswer(await photo(w.alice))).toEqual(madeUp);
    expect(await photoAnswer(await photo(w.alice, "*"))).toEqual(madeUp);
    expect(await loadPersonProfile(app.deps, w.mallory, w.alice)).toBeNull();
    expect(await read(await calendar(w.alice))).toEqual(NOT_FOUND);
    expectNone("Mallory's People page", await loadPeoplePage(app.deps, w.mallory), [...ALL_OF_ALICE, w.alice, "LIST-MARK"]);
    expect(await app.snapshot()).toEqual(before);
  });

  it("the photo answer is safe to embed: nosniff, no scripts, same origin only", async () => {
    const w = await world();
    await as("bob@example.com");
    const response = await photo(w.alice);
    expect(response.status).toBe(200);
    const headers = headersOf(response);
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["cross-origin-resource-policy"]).toBe("same-origin");
    expect(headers["content-security-policy"]).toBe("default-src 'none'; sandbox");
    expect(headers["cache-control"]).toBe("private, no-cache");
    expect(headers["content-type"]).toBe("image/jpeg");
  });
});

describe("10. cross-site requests and no session", () => {
  it("every new POST route and the calendar GET refuse another site; nothing changes", async () => {
    const w = await world();
    await level(w.alice, w.aliceBob, "details");
    const dave = await as("dave@example.com");
    await app.db.withUser(w.alice, (q) => q("select app.invite_contact('dave@example.com')"));
    const invitation = (await people(dave)).received[0].id;
    await refused("alice@example.com", async () => {
      const results = {
        invite: await invite("someone@example.com", CROSS_SITE),
        share: await share(w.aliceBob, { calendar: "none", focus: false }, CROSS_SITE),
        remove: await remove(w.aliceBob, CROSS_SITE),
        withdraw: await withdraw(invitation, CROSS_SITE),
        answer: await answer(invitation, { accept: true }, CROSS_SITE),
        upload: await uploadProfilePhoto(post("/api/profile/photo", { data: PNG }, CROSS_SITE), app.deps),
      };
      for (const [name, response] of Object.entries(results)) expect(response.status, name).toBe(403);
    });
    await refused("bob@example.com", async () => {
      expect((await calendar(w.alice, FROM, TO, CROSS_SITE)).status).toBe(403);
      expect((await calendar(w.alice, FROM, TO, { origin: "https://evil.example" })).status).toBe(403);
    });
    // The same requests from our own site still work, so the refusals above were about the site.
    await as("bob@example.com");
    expect((await calendar(w.alice)).status).toBe(200);
  });

  it("every new route refuses a request without a session with 401; nothing changes", async () => {
    const w = await world();
    await level(w.alice, w.aliceBob, "details");
    const dave = await as("dave@example.com");
    await app.db.withUser(w.alice, (q) => q("select app.invite_contact('dave@example.com')"));
    const invitation = (await people(dave)).received[0].id;
    await app.auth.signOut();
    const before = await app.snapshot();
    const results = {
      invite: await invite("someone@example.com"),
      share: await share(w.aliceBob, { calendar: "none", focus: false }),
      remove: await remove(w.aliceBob),
      withdraw: await withdraw(invitation),
      answer: await answer(invitation, { accept: true }),
      calendar: await calendar(w.alice),
      photo: await photo(w.alice),
      count: await invitationCount(app.deps),
      upload: await uploadProfilePhoto(post("/api/profile/photo", { data: PNG }), app.deps),
    };
    for (const [name, response] of Object.entries(results)) expect(response.status, name).toBe(401);
    expectNone("signed-out answers", await Promise.all(Object.values(results).map((r) => r.clone().text())), [...ALL_OF_ALICE, w.alice]);
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("11. window abuse on the calendar GET", () => {
  it("bad windows give 400 and the same answer whether or not the owner shared with the caller", async () => {
    const w = await world();
    await level(w.alice, w.aliceBob, "details");
    const windows: Array<[string, string | null, string | null]> = [
      ["more than 62 days", "2026-11-01T00:00:00.000Z", "2027-01-02T00:00:01.000Z"],
      ["a year", "2026-01-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z"],
      ["reversed", "2026-11-20T00:00:00.000Z", "2026-11-19T00:00:00.000Z"],
      ["empty", FROM, FROM],
      ["from missing", null, TO],
      ["to missing", FROM, null],
      ["both missing", null, null],
      ["not ISO (word)", "yesterday", TO],
      ["not ISO (date only)", "2026-11-16", "2026-11-17"],
      ["not ISO (no offset)", "2026-11-16T00:00:00", "2026-11-17T00:00:00"],
      ["a number", "1700000000000", "1700086400000"],
      ["SQL-looking from", "'; drop table app.events; --", TO],
      ["SQL-looking to", FROM, "2026-11-17T00:00:00Z' or '1'='1"],
      ["empty strings", "", ""],
      ["huge strings", "9".repeat(5000), "9".repeat(5000)],
    ];
    const eventsBefore = (await app.db.admin<{ n: string }>("select count(*)::text as n from app.events"))[0].n;
    // Callers: Bob (shared), Mallory (not shared), Carol (a contact without a share); owner Alice; and an owner nobody has.
    for (const [label, from, to] of windows) {
      const answers: unknown[] = [];
      for (const [who, owner] of [["bob@example.com", w.alice], ["mallory@example.com", w.alice], ["carol@example.com", w.alice], ["bob@example.com", UNKNOWN]] as const) {
        answers.push(await refused(who, async () => read(await calendar(owner, from, to))));
      }
      for (const got of answers) expect(got, label).toEqual(WINDOW_ERROR);
    }
    expect((await app.db.admin<{ n: string }>("select count(*)::text as n from app.events"))[0].n).toBe(eventsBefore);
    // Exactly 62 days works, one second more does not.
    await as("bob@example.com");
    expect((await calendar(w.alice, "2026-11-01T00:00:00.000Z", "2027-01-02T00:00:00.000Z")).status).toBe(200);
    expect(await read(await calendar(w.alice, "2026-11-01T00:00:00.000Z", "2027-01-02T00:00:01.000Z"))).toEqual(WINDOW_ERROR);
    // A repeated parameter cannot smuggle a second window past the check.
    const twice = await sharedCalendar(get(`/api/shares/${w.alice}/calendar?from=${FROM}&from=2020-01-01T00:00:00Z&to=${TO}&to=2031-01-01T00:00:00Z`), app.deps, w.alice);
    const body = text(await read(twice));
    expect(body).not.toContain("2020-");
  });
});

describe("12. what the pages of other people contain", () => {
  it("Mallory's People page and calendar page contain nothing of Alice or Bob", async () => {
    const w = await world();
    await level(w.alice, w.aliceBob, "details");
    await level(w.bob, w.aliceBob, "details");
    const mallory = [
      await loadPeoplePage(app.deps, w.mallory),
      await loadCalendarPageWithShares(app.deps, w.mallory),
      await loadPersonProfile(app.deps, w.mallory, w.alice),
      await loadPersonProfile(app.deps, w.mallory, w.bob),
    ];
    expectNone("Mallory's pages", mallory, [...ALL_OF_ALICE, M.bobName, M.bobBio, "ZETA-NAME", "bob@example.com", "carol@example.com", w.alice, w.bob, w.carol]);
    expect((mallory[1] as { sharing: unknown[] }).sharing).toEqual([]);
  });

  it("Bob's calendar page lists Alice by name and photo address only: no address, no events, no markers", async () => {
    const w = await world();
    await level(w.alice, w.aliceBob, "details");
    const page = await loadCalendarPageWithShares(app.deps, w.bob);
    expect(page.sharing).toHaveLength(1);
    expect(Object.keys(page.sharing[0]).sort()).toEqual(["calendar", "focus", "name", "photoUrl", "userId"]);
    expect(page.sharing[0].name).toBe(M.aliceName);
    expect(page.week.days.flatMap((d) => d.events)).toEqual([]);
    expectNone("Bob's calendar page", page, [...PRIVATE_FOR_BUSY, M.bio, "alice@example.com"]);
    // The profile page of a contact shows the address by design (R43); the calendar page does not.
    const profile = await loadPersonProfile(app.deps, w.bob, w.alice);
    expect(profile?.person.email).toBe("alice@example.com");
    expectNone("Bob's view of Alice's profile", profile, PRIVATE_FOR_BUSY);
  });

  it("a sharer without a display name is shown by the local part of the address, never the whole address", async () => {
    const w = await world();
    const dora = await as("dora.smith@example.com");
    const doraContact = await befriend(dora, w.bob, "bob@example.com");
    await level(dora, doraContact, "busy");
    const page = await loadCalendarPageWithShares(app.deps, w.bob);
    const shown = page.sharing.find((s) => s.userId === dora)!;
    // What the app does: the shown name falls back to the address's local part ("dora.smith"), by design.
    console.info("fallback name of a sharer without a display name:", shown.name);
    expect(shown.name).not.toContain("@");
    expect(text(page.sharing)).not.toContain("dora.smith@example.com");
  });
});

describe("13. the coach", () => {
  it("with Alice sharing details with Bob, nothing of Alice is in what the coach is sent for Bob's message", async () => {
    const w = await world();
    await level(w.alice, w.aliceBob, "details");
    await as("bob@example.com");
    await setPlan(app.db, w.bob, "pro");
    const response = await sendMessage(post("/api/chat/messages", { text: "What is on Alice's calendar this week, and what are her goals?" }), app.deps);
    expect(response.status).toBe(201);
    expect(app.assistant.requests.length).toBeGreaterThan(0);
    const sent = text(app.assistant.requests);
    for (const secret of [...ALL_OF_ALICE, w.alice, M.bobBio]) expect(sent.includes(secret), `coach was sent "${secret}"`).toBe(false);
    // The answer Bob gets back carries nothing of hers either.
    expectNone("coach answer", await response.clone().json(), ALL_OF_ALICE);
  });
});

describe("14. limits", () => {
  const statuses = async (email: string, targets: string[], ip: string) => {
    await as(email);
    const out: number[] = [];
    for (const target of targets) out.push((await inviteContact(postJson("/api/contacts/invite", { email: target }, { "x-forwarded-for": ip }), app.deps)).status);
    return out;
  };

  it("more than 20 invitations in a row are stopped with 429; the limit does not depend on the invited address", async () => {
    await world();
    await as("carol@example.com");
    const distinct = Array.from({ length: 25 }, (_, i) => `unknown-${i}@example.com`);
    const same = Array.from({ length: 25 }, () => "same@example.com");
    const withAccounts = Array.from({ length: 25 }, (_, i) => ["bob@example.com", "carol@example.com", "alice@example.com"][i % 3]);
    const one = await statuses("carol@example.com", distinct, `10.8.${client}.1`);
    const two = await statuses("bob@example.com", same, `10.8.${client}.2`);
    const three = await statuses("mallory@example.com", withAccounts, `10.8.${client}.3`);
    console.info("statuses (distinct addresses):", one.join(","));
    expect(two).toEqual(one);
    expect(three).toEqual(one);
    // Never more than 20 get through, and from the 21st on every one is a 429.
    expect(one.filter((s) => s === 200).length).toBeLessThanOrEqual(20);
    for (const status of one.slice(20)) expect(status).toBe(429);
    expect(one.at(-1)).toBe(429);
    // Once stopped, never let through again.
    const firstStop = one.indexOf(429);
    for (const status of one.slice(firstStop)) expect(status).toBe(429);
  });

  it("another client address does not lift one user's limit", async () => {
    await world();
    const targets = Array.from({ length: 25 }, (_, i) => `rot-${i}@example.com`);
    const first = await statuses("mallory@example.com", targets.slice(0, 12), `10.7.${client}.1`);
    const second = await statuses("mallory@example.com", targets.slice(12), `10.7.${client}.2`);
    for (const status of second) expect(status).toBe(429);
    expect(first.slice(10)).toEqual([429, 429]);
  });
});

describe("extra attacks", () => {
  it("A. a stranger removing or withdrawing on Alice's contact row is refused; the contact and its shares stay", async () => {
    const w = await world();
    await level(w.alice, w.aliceBob, "details");
    const got = await refused("mallory@example.com", async () => [
      await read(await remove(w.aliceBob)),
      await read(await withdraw(w.aliceBob)),
      await read(await answer(w.aliceBob, { accept: false })),
    ]);
    expect(got).toEqual([NOT_FOUND, NOT_FOUND, NOT_FOUND]);
    await as("bob@example.com");
    expect((await calendar(w.alice)).status).toBe(200);
  });

  it("B. the badge count and the People page carry only the caller's own invitations", async () => {
    const w = await world();
    const ivy = await as("ivy@example.com");
    await app.db.withUser(w.alice, (q) => q("select app.invite_contact('ivy@example.com')"));
    await as("mallory@example.com");
    const count = await read(await invitationCount(app.deps));
    expect(count).toEqual({ status: 200, body: { count: 0 } });
    expect(await people(w.mallory).then((p) => p.received)).toEqual([]);
    await as("ivy@example.com");
    expect((await read(await invitationCount(app.deps))).body).toEqual({ count: 1 });
    void ivy;
  });

  it("C. a share written for a contact row never reaches a different contact row of the same owner", async () => {
    const w = await world();
    await as("alice@example.com");
    expect((await share(w.aliceBob, { calendar: "details", focus: false })).status).toBe(200);
    expect(await refused("carol@example.com", async () => read(await calendar(w.alice)))).toEqual(NOT_FOUND);
    expect(await refused("mallory@example.com", async () => read(await calendar(w.alice)))).toEqual(NOT_FOUND);
    const page = await loadPeoplePage(app.deps, w.alice);
    expect(page.shares.map((s) => s.contactId)).toEqual([w.aliceBob]);
  });

  it("D. Bob cannot read Carol's or Mallory's calendar through Alice's share, and a malformed or upper-case id changes nothing", async () => {
    const w = await world();
    await level(w.alice, w.aliceBob, "details");
    await level(w.alice, w.aliceCarol, "details");
    const got = await refused("bob@example.com", async () => [
      await read(await calendar(w.carol)),
      await read(await calendar(w.mallory)),
      await read(await calendar(`${w.alice}/../${w.carol}`)),
    ]);
    expect(got).toEqual([NOT_FOUND, NOT_FOUND, NOT_FOUND]);
  });

  it("E. Alice deleting an event, or changing it afterwards, is seen at once and never leaves a trace for Bob", async () => {
    const w = await world();
    await level(w.alice, w.aliceBob, "details");
    await app.db.admin("update app.events set title = 'CHANGED-MARK' where title = $1", [M.title1]);
    await app.db.admin("delete from app.events where title = $1", [M.title2]);
    const got = await refused("bob@example.com", async () => read(await calendar(w.alice)));
    expect(text(got)).toContain("CHANGED-MARK");
    expectNone("after the change", got, [M.title1, M.title2, M.place2, ...PRIVATE_FOR_DETAILS]);
  });

  it("F. a window in the past or far in the future shows only events in it, and no marker outside it", async () => {
    const w = await world();
    await level(w.alice, w.aliceBob, "details");
    const early = await refused("bob@example.com", async () => read(await calendar(w.alice, "2020-01-01T00:00:00.000Z", "2020-02-01T00:00:00.000Z")));
    expect(early.body).toEqual({ level: "details", events: [] });
    const late = await refused("bob@example.com", async () => read(await calendar(w.alice, "2031-01-01T00:00:00.000Z", "2031-02-01T00:00:00.000Z")));
    expect(late.body).toEqual({ level: "details", events: [] });
  });

  it("G. Carol, a former contact, cannot learn anything through her old invitation or contact id", async () => {
    const w = await world();
    await level(w.alice, w.aliceCarol, "details");
    await as("alice@example.com");
    await remove(w.aliceCarol);
    const got = await refused("carol@example.com", async () => [
      await read(await remove(w.aliceCarol)),
      await read(await answer(w.aliceCarol, { accept: true })),
      await read(await calendar(w.alice)),
    ]);
    expect(got).toEqual([NOT_FOUND, NOT_FOUND, NOT_FOUND]);
    expectNone("Carol's People page", await loadPeoplePage(app.deps, w.carol), [...ALL_OF_ALICE, w.alice]);
    expectNone("Carol's calendar page", await loadCalendarPageWithShares(app.deps, w.carol), [...ALL_OF_ALICE, w.alice]);
    expect(await loadPersonProfile(app.deps, w.carol, w.alice)).toBeNull();
  });
});
