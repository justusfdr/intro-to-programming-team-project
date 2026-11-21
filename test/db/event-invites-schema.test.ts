// Tests for supabase/migrations/20261210000000_event_invites.sql (spec 36): the owner invites contacts to
// a single event of their own (R59); an invited person reads only the reduced shape (R60) and answers
// (R61); moving the event resets the answers, renaming does not, and deleting the event, removing the
// contact or deleting an account removes the invitation (R62); the invited person can only answer
// (R63); nobody else sees anything, "Not found" alike for foreign, missing and malformed ids (R64).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./harness";

let db: TestDb;
let ana: string;
let ben: string;
let carl: string;
let dora: string;
/** Contact rows: Ana–Ben, Ana–Dora, Ben–Carl. Carl is not Ana's contact. */
let anaBen: string;
let anaDora: string;
let benCarl: string;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db.close();
});

const as = <T extends Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) =>
  db.withUser(user, (q) => q<T>(sql, params));

async function connect(a: string, b: string, bEmail: string): Promise<string> {
  await as(a, "select app.invite_contact($1)", [bEmail]);
  const [inv] = await as<{ id: string }>(b, "select id from app.contact_cards() where kind = 'received'");
  await as(b, "select app.answer_invitation($1::uuid, $2::boolean)", [inv.id, true]);
  const [c] = await db.admin<{ id: string }>(
    "select id from app.contacts where user_a = least($1::uuid, $2::uuid) and user_b = greatest($1::uuid, $2::uuid)",
    [a, b],
  );
  return c.id;
}

const HOUR = 60 * 60 * 1000;
const inHours = (h: number) => new Date(Date.now() + h * HOUR).toISOString();

async function seedEvent(
  user: string,
  title: string,
  extra: { start?: string; end?: string; location?: string; notes?: string; guests?: string[]; demo?: boolean; source?: string; series?: boolean; outlookId?: string } = {},
): Promise<string> {
  const [row] = await db.admin<{ id: string }>(
    `insert into app.events (user_id, title, start_at, end_at, location, notes, guests, demo, source, series_id, outlook_id)
     values ($1, $2, $3::timestamptz, $4::timestamptz, $5, $6, $7::text[], $8, $9, $10::uuid, $11) returning id`,
    [
      user,
      title,
      extra.start ?? inHours(24),
      extra.end ?? inHours(25),
      extra.location ?? null,
      extra.notes ?? null,
      extra.guests ?? null,
      extra.demo ?? false,
      extra.source ?? "app",
      extra.series ? "00000000-0000-4000-8000-000000000001" : null,
      extra.outlookId ?? null,
    ],
  );
  return row.id;
}

const setInvites = (user: string, event: string, contacts: string[]) =>
  as(user, "select app.set_event_invites($1::uuid, $2::uuid[])", [event, contacts]);
const seriesInvites = (user: string, event: string, contacts: string[]) =>
  as(user, "select app.set_series_invites($1::uuid, $2::uuid[])", [event, contacts]);
const answer = (user: string, invite: string, value: string | null) =>
  as(user, "select app.answer_event_invite($1::uuid, $2::text)", [invite, value]);
const inviteeRows = (user: string, event: string) =>
  as<{ user_id: string; answer: string }>(user, "select user_id, answer from app.event_invitees($1::uuid)", [event]);
const inviteIdOf = async (invitee: string) =>
  (await db.admin<{ id: string }>("select id from app.event_invites where invitee = $1 order by created_at", [invitee]))[0]?.id;
const windowOf = (user: string, from = inHours(-24), to = inHours(24 * 7)) =>
  as(user, "select * from app.invited_events($1::timestamptz, $2::timestamptz)", [from, to]);

/** Every row of the tables an invitation touches, to prove that a refusal changed nothing. */
const everything = () => Promise.all(["event_invites", "events", "contacts"].map((t) => db.admin(`select * from app.${t} order by 1`)));

beforeEach(async () => {
  await db.admin("delete from auth.users");
  ana = await db.createUser("ana@example.com", { confirmed: true, timeZone: "Europe/Lisbon" });
  ben = await db.createUser("ben@example.com", { confirmed: true });
  carl = await db.createUser("carl@example.com", { confirmed: true });
  dora = await db.createUser("dora@example.com", { confirmed: true });
  anaBen = await connect(ana, ben, "ben@example.com");
  anaDora = await connect(ana, dora, "dora@example.com");
  benCarl = await connect(ben, carl, "carl@example.com");
});

describe("inviting (R59)", () => {
  it("the owner invites contacts to a single event of their own; the list is set as a whole and keeps answers", async () => {
    const event = await seedEvent(ana, "Group project meeting");
    await setInvites(ana, event, [anaBen, anaDora]);
    expect((await inviteeRows(ana, event)).map((r) => r.answer)).toEqual(["pending", "pending"]);
    expect(new Set((await inviteeRows(ana, event)).map((r) => r.user_id))).toEqual(new Set([ben, dora]));

    const benInvite = await inviteIdOf(ben);
    await answer(ben, benInvite, "accepted");
    // Setting the same list again (also with a repeat) keeps Ben's answer; taking Dora off removes her.
    await setInvites(ana, event, [anaBen, anaBen]);
    expect(await inviteeRows(ana, event)).toEqual([{ user_id: ben, answer: "accepted" }]);
    expect(await db.admin("select id from app.event_invites where invitee = $1", [dora])).toEqual([]);
    // An empty list removes everyone.
    await setInvites(ana, event, []);
    expect(await inviteeRows(ana, event)).toEqual([]);
  });

  it("refuses a non-contact, someone else's contact row, a foreign event and a missing one with the same 'Not found'", async () => {
    const event = await seedEvent(ana, "Group project meeting");
    const bensEvent = await seedEvent(ben, "Ben's");
    const before = await everything();
    // Ben–Carl is a real contact row, but not Ana's: she cannot invite Carl through it.
    await expect(setInvites(ana, event, [benCarl])).rejects.toThrow("Not found");
    await expect(setInvites(ana, event, ["00000000-0000-4000-8000-00000000abcd"])).rejects.toThrow("Not found");
    await expect(setInvites(ana, bensEvent, [anaBen])).rejects.toThrow("Not found");
    await expect(setInvites(carl, event, [benCarl])).rejects.toThrow("Not found");
    await expect(setInvites(ana, "00000000-0000-4000-8000-00000000abcd", [anaBen])).rejects.toThrow("Not found");
    await expect(as(ana, "select app.set_event_invites($1::uuid, $2::uuid[])", [event, null])).rejects.toThrow("Invalid request.");
    expect(await everything()).toEqual(before);
  });

  it("refuses Outlook, demo and ended events (spec 65: no longer an event of a series); taking people off stays possible", async () => {
    const outlook = await seedEvent(ana, "Team call", { source: "outlook", outlookId: "o-1" });
    const demo = await seedEvent(ana, "Demo", { demo: true });
    const ended = await seedEvent(ana, "Yesterday", { start: inHours(-26), end: inHours(-25) });
    const before = await everything();
    await expect(setInvites(ana, outlook, [anaBen])).rejects.toThrow("Outlook events cannot invite people");
    await expect(setInvites(ana, demo, [anaBen])).rejects.toThrow("Demo events cannot invite people");
    await expect(setInvites(ana, ended, [anaBen])).rejects.toThrow("People can only be invited to events that have not ended");
    expect(await everything()).toEqual(before);

    // An event that ended after Ben was invited: Ana can still take him off.
    const soon = await seedEvent(ana, "Soon");
    await setInvites(ana, soon, [anaBen]);
    await db.admin("update app.events set start_at = $2::timestamptz, end_at = $3::timestamptz where id = $1", [soon, inHours(-3), inHours(-2)]);
    await expect(setInvites(ana, soon, [anaBen, anaDora])).rejects.toThrow("People can only be invited to events that have not ended");
    await setInvites(ana, soon, []);
    expect(await inviteeRows(ana, soon)).toEqual([]);
  });

  it("spec 65: an event of a series invites people like a single event, only that one event", async () => {
    const lecture = await seedEvent(ana, "Lecture", { series: true });
    const next = await seedEvent(ana, "Lecture", { series: true, start: inHours(48), end: inHours(49) });
    await setInvites(ana, lecture, [anaBen]);
    expect(await inviteeRows(ana, lecture)).toEqual([{ user_id: ben, answer: "pending" }]);
    expect(await inviteeRows(ana, next)).toEqual([]);
  });

  it("spec 65: this and the later events of a series get the same people; earlier ones and other series stay", async () => {
    const earlier = await seedEvent(ana, "Lecture", { series: true, start: inHours(2), end: inHours(3) });
    const lecture = await seedEvent(ana, "Lecture", { series: true });
    const next = await seedEvent(ana, "Lecture", { series: true, start: inHours(48), end: inHours(49) });
    const other = await seedEvent(ana, "Gym", { start: inHours(72), end: inHours(73) });
    await setInvites(ana, next, [anaDora]);
    await seriesInvites(ana, lecture, [anaBen]);
    expect(await inviteeRows(ana, earlier)).toEqual([]);
    expect(await inviteeRows(ana, lecture)).toEqual([{ user_id: ben, answer: "pending" }]);
    // The later event's list is set as a whole: Dora is taken off, Ben is invited.
    expect(await inviteeRows(ana, next)).toEqual([{ user_id: ben, answer: "pending" }]);
    expect(await inviteeRows(ana, other)).toEqual([]);
    // Each date is its own invitation, answered on its own.
    const ids = await as<{ id: string }>(ben, "select id from app.event_invites order by id");
    expect(ids).toHaveLength(2);
    await answer(ben, ids[0].id, "accepted");
    const answers = (await as<{ answer: string }>(ben, "select answer from app.event_invites order by answer")).map((r) => r.answer);
    expect(answers).toEqual(["accepted", "pending"]);
    // Taking everyone off the series again.
    await seriesInvites(ana, lecture, []);
    expect([...(await inviteeRows(ana, lecture)), ...(await inviteeRows(ana, next))]).toEqual([]);
  });

  it("spec 65: one refusal for the series saves nothing; a foreign event or contact is Not found; without a series it is the one event", async () => {
    const lecture = await seedEvent(ana, "Lecture", { series: true });
    await seedEvent(ana, "Lecture", { series: true, start: inHours(48), end: inHours(49) });
    const before = await everything();
    await expect(seriesInvites(ana, lecture, [benCarl])).rejects.toThrow("Not found");
    await expect(seriesInvites(carl, lecture, [benCarl])).rejects.toThrow("Not found");
    await expect(seriesInvites(ana, "00000000-0000-4000-8000-00000000abcd", [anaBen])).rejects.toThrow("Not found");
    // The second date is a demo event: the whole call is refused, the first date gets nobody either.
    const otherSeries = (start: number, demo: boolean) =>
      db.admin<{ id: string }>(
        `insert into app.events (user_id, title, start_at, end_at, demo, series_id)
         values ($1, 'Mixed lecture', $2::timestamptz, $3::timestamptz, $4, '00000000-0000-4000-8000-000000000002') returning id`,
        [ana, inHours(start), inHours(start + 1), demo],
      );
    const [[demoSeries], [demoNext]] = [await otherSeries(96, false), await otherSeries(120, true)];
    const withDemo = await everything();
    await expect(seriesInvites(ana, demoSeries.id, [anaBen])).rejects.toThrow("Demo events cannot invite people");
    expect(await everything()).toEqual(withDemo);
    expect(await inviteeRows(ana, demoSeries.id)).toEqual([]);
    expect(await inviteeRows(ana, demoNext.id)).toEqual([]);
    expect(before[0]).toEqual(withDemo[0]);
    // An event without a series: only that event.
    const single = await seedEvent(ana, "Coffee", { start: inHours(30), end: inHours(31) });
    await seriesInvites(ana, single, [anaBen]);
    expect(await inviteeRows(ana, single)).toEqual([{ user_id: ben, answer: "pending" }]);
    const [rights] = await db.admin<{ anon: boolean; authenticated: boolean; definer: boolean }>(
      `select has_function_privilege('anon', 'app.set_series_invites(uuid, uuid[])', 'execute') as anon,
              has_function_privilege('authenticated', 'app.set_series_invites(uuid, uuid[])', 'execute') as authenticated,
              (select p.prosecdef and 'search_path=""' = any (p.proconfig) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'app' and p.proname = 'set_series_invites') as definer`,
    );
    expect(rights).toEqual({ anon: false, authenticated: true, definer: true });
  });

  it("an all-day event counts as ended only after its last day in the owner's time zone", async () => {
    const [today] = await db.admin<{ d: string }>("select (now() at time zone 'Europe/Lisbon')::date::text as d");
    const [allDay] = await db.admin<{ id: string }>(
      "insert into app.events (user_id, title, all_day, first_day, last_day) values ($1, 'Exam day', true, $2::date, $2::date) returning id",
      [ana, today.d],
    );
    await setInvites(ana, allDay.id, [anaBen]);
    expect(await inviteeRows(ana, allDay.id)).toEqual([{ user_id: ben, answer: "pending" }]);
    await db.admin("update app.events set first_day = first_day - 2, last_day = last_day - 2 where id = $1", [allDay.id]);
    await expect(setInvites(ana, allDay.id, [anaBen, anaDora])).rejects.toThrow("People can only be invited to events that have not ended");
  });

  it("at most 20 people per event, in the function and on the table", async () => {
    const event = await seedEvent(ana, "Big meeting");
    // Contacts written directly (the invitation route would hit the limit of 10 per hour).
    const contacts: string[] = [];
    for (let i = 0; i < 21; i++) {
      const person = await db.createUser(`p${i}@example.com`, { confirmed: true });
      const [row] = await db.admin<{ id: string }>(
        "insert into app.contacts (user_a, user_b) values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid)) returning id",
        [ana, person],
      );
      contacts.push(row.id);
    }
    await expect(setInvites(ana, event, contacts)).rejects.toThrow("An event can invite at most 20 people");
    expect(await inviteeRows(ana, event)).toEqual([]);
    await setInvites(ana, event, contacts.slice(0, 20));
    expect(await inviteeRows(ana, event)).toHaveLength(20);
    const [last] = await db.admin<{ user_a: string; user_b: string }>("select user_a, user_b from app.contacts where id = $1", [contacts[20]]);
    const other = last.user_a === ana ? last.user_b : last.user_a;
    await expect(
      db.admin("insert into app.event_invites (event_id, contact_id, owner, invitee) values ($1, $2, $3, $4)", [event, contacts[20], ana, other]),
    ).rejects.toThrow("An event can invite at most 20 people");
  });

  it("the table refuses an invitation that does not match its contact row or its event, and one to oneself", async () => {
    const event = await seedEvent(ana, "Meeting");
    const series = await seedEvent(ana, "Lecture", { series: true });
    const bens = await seedEvent(ben, "Ben's");
    const insert = (eventId: string, contact: string, owner: string, invitee: string) =>
      db.admin("insert into app.event_invites (event_id, contact_id, owner, invitee) values ($1, $2, $3, $4)", [eventId, contact, owner, invitee]);
    await expect(insert(event, anaBen, ana, carl)).rejects.toThrow("An invitation belongs to the two people of its contact");
    await expect(insert(bens, anaBen, ana, ben)).rejects.toThrow("Only the owner's own single event can invite people");
    // Spec 65: an event of a series may invite people now, also at the table.
    await insert(series, anaBen, ana, ben);
    await expect(insert(event, anaBen, ana, ana)).rejects.toThrow();
    await expect(
      db.admin("insert into app.event_invites (event_id, contact_id, owner, invitee, answer) values ($1, $2, $3, $4, 'maybe')", [event, anaBen, ana, ben]),
    ).rejects.toThrow();
  });
});

describe("what an invited person sees (R60)", () => {
  it("the reduced shape only, read from the owner's row at the moment of the request, never notes, to-dos, goal or guests", async () => {
    const goal = await db.withUser(ana, async (q) => {
      const [row] = await q<{ id: string }>("insert into app.goals (title, deadline) values ('Pass statistics', current_date + 30) returning id");
      await q("insert into app.rules (goal_id, kind, target) values ($1, 'count', 2)", [row.id]);
      return row;
    });
    const event = await seedEvent(ana, "Group project meeting", {
      location: "Nova SBE, Carcavelos",
      notes: "Ask Ana about the exam",
      guests: ["lea@example.com"],
    });
    await db.admin("update app.events set goal_id = $2, travel_mode = 'walking' where id = $1", [event, goal.id]);
    await db.admin("insert into app.event_todos (event_id, user_id, title, position) values ($1, $2, 'Read the slides', 0)", [event, ana]);
    await setInvites(ana, event, [anaBen]);

    const rows = await windowOf(ben);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(
      ["invite_id", "answer", "owner_id", "title", "all_day", "start_at", "end_at", "first_day", "last_day", "location"].sort(),
    );
    const row = rows[0] as Record<string, unknown>;
    expect(row.invite_id).toBe(await inviteIdOf(ben));
    expect(row).toMatchObject({ answer: "pending", owner_id: ana, title: "Group project meeting", all_day: false, location: "Nova SBE, Carcavelos" });
    const text = JSON.stringify(rows);
    for (const hidden of ["Ask Ana", "lea@example.com", "Read the slides", goal.id, event, "walking", anaBen]) expect(text).not.toContain(hidden);

    // A change by the owner shows at the next read (nothing is copied).
    await db.admin("update app.events set title = 'Project meeting (room 2)' where id = $1", [event]);
    expect(((await windowOf(ben))[0] as { title: string }).title).toBe("Project meeting (room 2)");
  });

  it("the table shows the invited person their own row without the event's or the contact's id", async () => {
    const event = await seedEvent(ana, "Meeting");
    await setInvites(ana, event, [anaBen]);
    const own = await as(ben, "select id, owner, invitee, answer, answered_at, created_at from app.event_invites");
    expect(own).toHaveLength(1);
    await expect(as(ben, "select event_id from app.event_invites")).rejects.toThrow(/permission denied/);
    await expect(as(ben, "select contact_id from app.event_invites")).rejects.toThrow(/permission denied/);
    await expect(as(ben, "select * from app.events where id = $1", [event])).resolves.toEqual([]);
  });

  it("the open list, the badge count and the 62-day window", async () => {
    const soon = await seedEvent(ana, "Soon");
    const later = await seedEvent(ana, "Later", { start: inHours(24 * 3), end: inHours(24 * 3 + 1) });
    await setInvites(ana, soon, [anaBen]);
    await setInvites(ana, later, [anaBen]);
    expect(await as(ben, "select app.pending_invite_count() as n")).toEqual([{ n: 2 }]);
    const [first] = await db.admin<{ id: string }>("select i.id from app.event_invites i where i.event_id = $1", [soon]);
    await answer(ben, first.id, "accepted");
    expect(await as(ben, "select app.pending_invite_count() as n")).toEqual([{ n: 1 }]);
    expect((await as<{ title: string }>(ben, "select title from app.open_event_invites()")).map((r) => r.title)).toEqual(["Later"]);
    await answer(ben, first.id, "declined");
    expect((await as<{ title: string; answer: string }>(ben, "select title, answer from app.open_event_invites()"))).toEqual([
      { title: "Soon", answer: "declined" },
      { title: "Later", answer: "pending" },
    ]);
    // Ana, Dora and Carl have nothing to answer.
    for (const user of [ana, dora, carl]) {
      expect(await as(user, "select app.pending_invite_count() as n")).toEqual([{ n: 0 }]);
      expect(await as(user, "select * from app.open_event_invites()")).toEqual([]);
    }
    // 62 days are fine, 62 days and one second are not.
    const from = new Date(Date.now() - HOUR).toISOString();
    const to62 = new Date(Date.parse(from) + 62 * 24 * HOUR).toISOString();
    await expect(windowOf(ben, from, to62)).resolves.toHaveLength(2);
    await expect(windowOf(ben, from, new Date(Date.parse(to62) + 1000).toISOString())).rejects.toThrow("Choose at most 62 days");
    await expect(windowOf(ben, from, from)).rejects.toThrow("Choose at most 62 days");
  });

  it("people: the owner and the invited people see the list and answers; names and photos without e-mail addresses", async () => {
    const event = await seedEvent(ana, "Meeting");
    await setInvites(ana, event, [anaBen, anaDora]);
    const benInvite = await inviteIdOf(ben);
    await answer(ben, benInvite, "tentative");
    await db.admin("update app.profiles set display_name = 'Dora D' where id = $1", [dora]);
    await db.admin("insert into app.profile_photos (user_id, mime, bytes) values ($1, 'image/png', '\\x89504e470d0a1a0a00'::bytea)", [dora]);

    // Ben sees Dora (not his contact) with her answer, name and photo; never her address.
    expect(await as(ben, "select user_id, answer from app.invite_people($1::uuid)", [benInvite])).toEqual([{ user_id: dora, answer: "pending" }]);
    const names = await as<{ user_id: string; display_name: string | null; fallback_name: string | null }>(
      ben,
      "select user_id, display_name, fallback_name from app.invite_person_names($1::uuid[])",
      [[dora, ana, carl]],
    );
    // Carl is Ben's contact, so he shows too; Dora by her name only, Ana by the part before the "@".
    expect(names).toEqual(
      expect.arrayContaining([
        { user_id: dora, display_name: "Dora D", fallback_name: null },
        { user_id: ana, display_name: null, fallback_name: "ana" },
      ]),
    );
    expect(JSON.stringify(names)).not.toContain("@");
    expect(await as(ben, "select mime from app.profile_photo($1::uuid)", [dora])).toEqual([{ mime: "image/png" }]);
    // profile_card still gives Ben nothing of Dora (no address to a co-invited person).
    expect(await as(ben, "select * from app.profile_card($1::uuid)", [dora])).toEqual([]);

    // The owner sees everyone with their answers.
    expect(await inviteeRows(ana, event)).toEqual(
      expect.arrayContaining([
        { user_id: ben, answer: "tentative" },
        { user_id: dora, answer: "pending" },
      ]),
    );
    expect(await as(ana, "select user_id, answer from app.own_event_invitees($1::uuid[])", [[event]])).toHaveLength(2);
    expect(await as(ana, "select app.event_has_invites($1::uuid) as yes", [event])).toEqual([{ yes: true }]);
  });

  it("a third user sees nothing, and foreign, missing and malformed ids answer the same 'Not found'", async () => {
    const event = await seedEvent(ana, "Meeting");
    await setInvites(ana, event, [anaBen]);
    const benInvite = await inviteIdOf(ben);
    expect(await as(carl, "select id, owner, invitee, answer from app.event_invites")).toEqual([]);
    expect(await windowOf(carl)).toEqual([]);
    await expect(inviteeRows(carl, event)).rejects.toThrow("Not found");
    await expect(inviteeRows(ben, event)).rejects.toThrow("Not found");
    await expect(as(carl, "select * from app.invite_people($1::uuid)", [benInvite])).rejects.toThrow("Not found");
    await expect(as(ana, "select * from app.invite_people($1::uuid)", [benInvite])).rejects.toThrow("Not found");
    await expect(as(carl, "select * from app.invite_people(gen_random_uuid())")).rejects.toThrow("Not found");
    await expect(as(carl, "select * from app.event_invitees($1::uuid)", ["not-a-uuid"])).rejects.toThrow();
    expect(await as(carl, "select * from app.own_event_invitees($1::uuid[])", [[event]])).toEqual([]);
    expect(await as(carl, "select app.event_has_invites($1::uuid) as yes", [event])).toEqual([{ yes: false }]);
    expect(await as(carl, "select * from app.invite_person_names($1::uuid[])", [[dora]])).toEqual([]);
    // Dora is Ana's contact but not invited: she does not see Ben through the event.
    expect(await as(dora, "select * from app.invite_person_names($1::uuid[])", [[ben]])).toEqual([]);
    expect(await as(dora, "select * from app.profile_photo($1::uuid)", [ben])).toEqual([]);
  });

  it("nobody outside the app can call the functions", async () => {
    for (const fn of [
      "app.set_event_invites(uuid, uuid[])",
      "app.answer_event_invite(uuid, text)",
      "app.invited_events(timestamptz, timestamptz)",
      "app.open_event_invites()",
      "app.pending_invite_count()",
      "app.event_invitees(uuid)",
      "app.own_event_invitees(uuid[])",
      "app.event_has_invites(uuid)",
      "app.invite_people(uuid)",
      "app.invite_person_names(uuid[])",
    ]) {
      const [rights] = await db.admin<{ anon: boolean; authenticated: boolean }>(
        "select has_function_privilege('anon', $1, 'execute') as anon, has_function_privilege('authenticated', $1, 'execute') as authenticated",
        [fn],
      );
      expect(rights, fn).toEqual({ anon: false, authenticated: true });
    }
    for (const fn of ["app.event_has_ended(uuid)", "app.check_event_invite()", "app.reset_event_invites()", "app.may_see_profile(uuid, uuid)"]) {
      const [rights] = await db.admin<{ authenticated: boolean }>("select has_function_privilege('authenticated', $1, 'execute') as authenticated", [fn]);
      expect(rights, fn).toEqual({ authenticated: false });
    }
    const [definer] = await db.admin<{ n: number }>(
      `select count(*)::integer as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'app' and p.proname in ('set_event_invites', 'answer_event_invite', 'invited_events', 'open_event_invites', 'pending_invite_count',
          'event_invitees', 'own_event_invitees', 'event_has_invites', 'invite_people', 'invite_person_names', 'reset_event_invites')
          and p.prosecdef and 'search_path=""' = any (p.proconfig)`,
    );
    expect(definer.n).toBe(11);
  });
});

describe("answering (R61) and read only for the invited (R63)", () => {
  it("the invited person answers and changes the answer while the event has not ended", async () => {
    const event = await seedEvent(ana, "Meeting");
    await setInvites(ana, event, [anaBen]);
    const id = await inviteIdOf(ben);
    for (const value of ["accepted", "tentative", "declined", "accepted"]) {
      await answer(ben, id, value);
      const [row] = await db.admin<{ answer: string; answered_at: Date | null }>("select answer, answered_at from app.event_invites where id = $1", [id]);
      expect(row.answer).toBe(value);
      expect(row.answered_at).not.toBeNull();
    }
  });

  it("refuses another person's answer, a bad answer, an ended event and the owner answering; nothing changes", async () => {
    const event = await seedEvent(ana, "Meeting");
    await setInvites(ana, event, [anaBen, anaDora]);
    const benInvite = await inviteIdOf(ben);
    const before = await everything();
    await expect(answer(dora, benInvite, "declined")).rejects.toThrow("Not found");
    await expect(answer(ana, benInvite, "declined")).rejects.toThrow("Not found");
    await expect(answer(carl, benInvite, "declined")).rejects.toThrow("Not found");
    await expect(as(ben, "select app.answer_event_invite(gen_random_uuid(), 'accepted')")).rejects.toThrow("Not found");
    await expect(answer(ben, benInvite, "maybe")).rejects.toThrow("Choose accept, maybe or decline");
    await expect(answer(ben, benInvite, "pending")).rejects.toThrow("Choose accept, maybe or decline");
    await expect(answer(ben, benInvite, null)).rejects.toThrow("Choose accept, maybe or decline");
    expect(await everything()).toEqual(before);

    await db.admin("update app.events set start_at = $2::timestamptz, end_at = $3::timestamptz where id = $1", [event, inHours(-3), inHours(-2)]);
    await expect(answer(ben, benInvite, "accepted")).rejects.toThrow("This event has ended");
  });

  it("after the event has ended the invited person can still decline (spec 64), but not accept or answer maybe", async () => {
    const event = await seedEvent(ana, "Yesterday's meeting");
    await setInvites(ana, event, [anaBen, anaDora]);
    const benInvite = await inviteIdOf(ben);
    await answer(ben, benInvite, "accepted");
    await db.admin("update app.events set start_at = $2::timestamptz, end_at = $3::timestamptz where id = $1", [event, inHours(-26), inHours(-25)]);
    const before = await everything();
    await expect(answer(ben, benInvite, "accepted")).rejects.toThrow("This event has ended");
    await expect(answer(ben, benInvite, "tentative")).rejects.toThrow("This event has ended");
    await expect(answer(dora, benInvite, "declined")).rejects.toThrow("Not found");
    await expect(answer(carl, benInvite, "declined")).rejects.toThrow("Not found");
    expect(await everything()).toEqual(before);

    await answer(ben, benInvite, "declined");
    const [row] = await db.admin<{ answer: string; answered_at: Date | null }>("select answer, answered_at from app.event_invites where id = $1", [benInvite]);
    expect(row.answer).toBe("declined");
    expect(row.answered_at).not.toBeNull();
    // Declined stays declined: it cannot be accepted again once the event has ended.
    await expect(answer(ben, benInvite, "accepted")).rejects.toThrow("This event has ended");
  });

  it("the invited person cannot change, move or delete the event, write the table, or invite others", async () => {
    const event = await seedEvent(ana, "Meeting");
    await setInvites(ana, event, [anaBen]);
    const id = await inviteIdOf(ben);
    const before = await everything();
    expect(await as(ben, "update app.events set title = 'Hacked' where id = $1 returning id", [event])).toEqual([]);
    expect(await as(ben, "delete from app.events where id = $1 returning id", [event])).toEqual([]);
    await expect(as(ben, "update app.event_invites set answer = 'accepted' where id = $1", [id])).rejects.toThrow(/permission denied/);
    await expect(as(ben, "delete from app.event_invites")).rejects.toThrow(/permission denied/);
    await expect(
      as(ben, "insert into app.event_invites (event_id, contact_id, owner, invitee) values ($1, $2, $3, $4)", [event, benCarl, ben, carl]),
    ).rejects.toThrow(/permission denied/);
    await expect(setInvites(ben, event, [benCarl])).rejects.toThrow("Not found");
    expect(await everything()).toEqual(before);
  });
});

describe("changes by the owner (R62)", () => {
  it("moving resets every answer to pending; renaming and a new place keep them", async () => {
    const event = await seedEvent(ana, "Meeting");
    await setInvites(ana, event, [anaBen, anaDora]);
    await answer(ben, await inviteIdOf(ben), "accepted");
    await answer(dora, await inviteIdOf(dora), "declined");
    const answers = async () => (await db.admin<{ answer: string; answered_at: Date | null }>("select answer, answered_at from app.event_invites order by invitee")).map((r) => [r.answer, r.answered_at === null]);

    // As the user's own edit (the way edit_event writes it): title and notes keep the answers.
    await as(ana, "update app.events set title = 'Meeting (room 2)', notes = 'Room 2' where id = $1", [event]);
    expect((await answers()).map(([a]) => a).sort()).toEqual(["accepted", "declined"]);
    // Setting the same times again is no move.
    await as(ana, "update app.events set start_at = start_at, end_at = end_at where id = $1", [event]);
    expect((await answers()).map(([a]) => a).sort()).toEqual(["accepted", "declined"]);
    // A move resets.
    await as(ana, "update app.events set start_at = start_at + interval '1 hour', end_at = end_at + interval '1 hour' where id = $1", [event]);
    expect(await answers()).toEqual([
      ["pending", true],
      ["pending", true],
    ]);
    // Making it an all-day event resets too.
    await answer(ben, await inviteIdOf(ben), "accepted");
    await as(ana, "update app.events set all_day = true, start_at = null, end_at = null, first_day = current_date + 2, last_day = current_date + 2 where id = $1", [event]);
    expect((await answers()).map(([a]) => a)).toEqual(["pending", "pending"]);
    // And moving its days.
    await answer(ben, await inviteIdOf(ben), "tentative");
    await as(ana, "update app.events set first_day = first_day + 1, last_day = last_day + 1 where id = $1", [event]);
    expect((await answers()).map(([a]) => a)).toEqual(["pending", "pending"]);
  });

  it("the move keeps the event's own update path working (updated_at and done)", async () => {
    const event = await seedEvent(ana, "Meeting");
    await setInvites(ana, event, [anaBen]);
    const [before] = await db.admin<{ updated_at: Date }>("select updated_at from app.events where id = $1", [event]);
    await as(ana, "update app.events set start_at = start_at + interval '1 hour', end_at = end_at + interval '1 hour' where id = $1", [event]);
    const [after] = await db.admin<{ updated_at: Date }>("select updated_at from app.events where id = $1", [event]);
    expect(new Date(after.updated_at).getTime()).toBeGreaterThan(new Date(before.updated_at).getTime());
  });

  it("deleting the event, taking a person off, removing the contact (either side) or deleting an account removes the invitation", async () => {
    const one = await seedEvent(ana, "One");
    const two = await seedEvent(ana, "Two");
    await setInvites(ana, one, [anaBen, anaDora]);
    await setInvites(ana, two, [anaBen, anaDora]);
    await as(ana, "delete from app.events where id = $1", [one]);
    expect(await db.admin("select * from app.event_invites where event_id = $1", [one])).toEqual([]);
    expect(await windowOf(ben)).toHaveLength(1);

    // Ben removes Ana as a contact: his invitation goes, Dora's stays.
    await as(ben, "select app.remove_contact($1::uuid)", [anaBen]);
    expect(await windowOf(ben)).toEqual([]);
    expect(await windowOf(dora)).toHaveLength(1);
    // Dora's account is deleted: hers goes too.
    await db.admin("delete from auth.users where id = $1", [dora]);
    expect(await db.admin("select * from app.event_invites")).toEqual([]);

    // The owner's account deleted: everything goes.
    const three = await seedEvent(ana, "Three");
    const again = await connect(ana, ben, "ben@example.com");
    await setInvites(ana, three, [again]);
    await db.admin("delete from auth.users where id = $1", [ana]);
    expect(await db.admin("select * from app.event_invites")).toEqual([]);
  });
});
