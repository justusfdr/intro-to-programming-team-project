// Tests for supabase/migrations/20261220000000_accepted_invite_details.sql (spec 55): once an invited
// person ACCEPTED, the owner and they share the event's to-dos and notes; the goal, the travel mode,
// where the trip starts and the done mark are the invited person's own, on their invitation row (R65 to
// R67). Every rule has its accepted and its rejected case: a pending, maybe or declined invitation, a
// non-invitee, the owner using the invitation's id, someone else's invitation, a to-do of another event,
// and that nothing but the notes of the owner's row can be written this way (R63). A refusal changes
// nothing (R1).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedGoal as seedGoalRow } from "../support/goals";
import { createTestDb, type TestDb } from "./harness";

let db: TestDb;
let ana: string;
let ben: string;
let carl: string;
let dora: string;
let anaBen: string;
let anaDora: string;

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

async function seedEvent(user: string, title: string, extra: { start?: string; end?: string; allDay?: boolean; notes?: string | null } = {}): Promise<string> {
  const allDay = extra.allDay ?? false;
  const [row] = await db.admin<{ id: string }>(
    `insert into app.events (user_id, title, all_day, start_at, end_at, first_day, last_day, location, notes, travel_mode, travel_from)
     values ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6::date, $7::date, 'Library, room 4', $8, 'walking', 'home') returning id`,
    [
      user,
      title,
      allDay,
      allDay ? null : (extra.start ?? inHours(24)),
      allDay ? null : (extra.end ?? inHours(25)),
      allDay ? new Date(Date.now() + 2 * 24 * HOUR).toISOString().slice(0, 10) : null,
      allDay ? new Date(Date.now() + 2 * 24 * HOUR).toISOString().slice(0, 10) : null,
      extra.notes === undefined ? "Bring the slides" : extra.notes,
    ],
  );
  return row.id;
}

async function seedGoal(user: string, title = "Exam"): Promise<string> {
  const deadline = new Date(Date.now() + 60 * 24 * HOUR).toISOString().slice(0, 10);
  return (await seedGoalRow(db, user, { title, deadline, rules: [{ kind: "count", target: 2 }] })).id;
}

const setInvites = (user: string, event: string, contacts: string[]) => as(user, "select app.set_event_invites($1::uuid, $2::uuid[])", [event, contacts]);
const answer = (user: string, invite: string, value: string) => as(user, "select app.answer_event_invite($1::uuid, $2::text)", [invite, value]);
const inviteIdOf = async (invitee: string, event: string) =>
  (await db.admin<{ id: string }>("select id from app.event_invites where invitee = $1 and event_id = $2", [invitee, event]))[0].id;

const details = (user: string, invite: string) => as(user, "select * from app.accepted_invite_details($1::uuid)", [invite]);
const todos = (user: string, invite: string) => as<{ id: string; title: string; done: boolean }>(user, "select * from app.accepted_invite_todos($1::uuid)", [invite]);
const addTodo = (user: string, invite: string, title: string | null) => as<{ id: string }>(user, "select app.add_accepted_invite_todo($1::uuid, $2::text) as id", [invite, title]);
const renameTodo = (user: string, invite: string, todo: string, title: string) => as(user, "select app.rename_accepted_invite_todo($1::uuid, $2::uuid, $3::text)", [invite, todo, title]);
const tickTodo = (user: string, invite: string, todo: string, done: boolean) => as(user, "select app.tick_accepted_invite_todo($1::uuid, $2::uuid, $3::boolean)", [invite, todo, done]);
const moveTodo = (user: string, invite: string, todo: string, to: number) => as(user, "select app.move_accepted_invite_todo($1::uuid, $2::uuid, $3::integer)", [invite, todo, to]);
const deleteTodo = (user: string, invite: string, todo: string) => as(user, "select app.delete_accepted_invite_todo($1::uuid, $2::uuid)", [invite, todo]);
const setNotes = (user: string, invite: string, notes: string, before: string | null) => as(user, "select app.set_accepted_invite_notes($1::uuid, $2::text, $3::text)", [invite, notes, before]);
const setPersonal = (user: string, invite: string, goal: string | null, mode: string | null, from: string | null) =>
  as(user, "select app.set_accepted_invite_personal($1::uuid, $2::uuid, $3::text, $4::text)", [invite, goal, mode, from]);
const setDone = (user: string, invite: string, done: boolean) => as(user, "select app.set_accepted_invite_done($1::uuid, $2::boolean)", [invite, done]);
const goalEvents = (user: string) => as<{ invite_id: string; goal_id: string; title: string; status: string }>(user, "select * from app.accepted_invite_goal_events()");

/** Every row an accepted invitation could touch, to prove that a refusal changed nothing. */
const everything = () => Promise.all(["event_invites", "events", "event_todos", "goals"].map((t) => db.admin(`select * from app.${t} order by 1`)));
const todoTitles = async (event: string) =>
  (await db.admin<{ title: string; done: boolean; position: number }>("select title, done, position from app.event_todos where event_id = $1 order by position", [event])).map(
    (t) => `${t.position}:${t.title}${t.done ? " ✓" : ""}`,
  );

let event: string;
let benInvite: string;
let doraInvite: string;

beforeEach(async () => {
  await db.admin("delete from auth.users");
  ana = await db.createUser("ana@example.com", { confirmed: true, timeZone: "Europe/Lisbon" });
  ben = await db.createUser("ben@example.com", { confirmed: true });
  carl = await db.createUser("carl@example.com", { confirmed: true });
  dora = await db.createUser("dora@example.com", { confirmed: true });
  anaBen = await connect(ana, ben, "ben@example.com");
  anaDora = await connect(ana, dora, "dora@example.com");
  await connect(ana, carl, "carl@example.com");
  event = await seedEvent(ana, "Group project meeting");
  // Ana's own to-do, from before anyone was invited.
  await db.admin("insert into app.event_todos (user_id, event_id, title, position) values ($1, $2, 'Book the room', 0)", [ana, event]);
  await setInvites(ana, event, [anaBen, anaDora]);
  benInvite = await inviteIdOf(ben, event);
  doraInvite = await inviteIdOf(dora, event);
  await answer(ben, benInvite, "accepted");
});

describe("reading an accepted invitation (R65)", () => {
  it("the accepted person reads title, times, place, notes and their own choices; never the event's id or the owner's choices", async () => {
    const [row] = await details(ben, benInvite);
    expect(Object.keys(row).sort()).toEqual(
      ["invite_id", "answer", "owner_id", "title", "all_day", "start_at", "end_at", "first_day", "last_day", "location", "notes", "goal_id", "travel_mode", "travel_from", "status"].sort(),
    );
    expect(row).toMatchObject({
      invite_id: benInvite,
      answer: "accepted",
      owner_id: ana,
      title: "Group project meeting",
      location: "Library, room 4",
      notes: "Bring the slides",
      // Ben's own, empty so far: not Ana's travel mode "walking" or her "home".
      goal_id: null,
      travel_mode: null,
      travel_from: null,
      status: "planned",
    });
    expect(JSON.stringify(row)).not.toContain(event);
    expect((await todos(ben, benInvite)).map((t) => t.title)).toEqual(["Book the room"]);
  });

  it("refuses a pending, a maybe and a declined invitation, a non-invitee, the owner, and a missing id with the same 'Not found'", async () => {
    await expect(details(dora, doraInvite)).rejects.toThrow("Not found");
    await answer(dora, doraInvite, "tentative");
    await expect(details(dora, doraInvite)).rejects.toThrow("Not found");
    await expect(todos(dora, doraInvite)).rejects.toThrow("Not found");
    await answer(dora, doraInvite, "declined");
    await expect(details(dora, doraInvite)).rejects.toThrow("Not found");
    // Someone else's invitation: Carl and Dora cannot use Ben's; Ana neither (she is the owner, not the invited person).
    await expect(details(carl, benInvite)).rejects.toThrow("Not found");
    await expect(details(dora, benInvite)).rejects.toThrow("Not found");
    await expect(details(ana, benInvite)).rejects.toThrow("Not found");
    await expect(details(ben, "00000000-0000-4000-8000-00000000abcd")).rejects.toThrow("Not found");
  });

  it("is gone once the owner moves the event (the answer is back to no answer yet, R62) or takes the person off", async () => {
    await db.admin("update app.events set start_at = start_at + interval '1 hour', end_at = end_at + interval '1 hour' where id = $1", [event]);
    await expect(details(ben, benInvite)).rejects.toThrow("Not found");
    await answer(ben, benInvite, "accepted");
    expect(await details(ben, benInvite)).toHaveLength(1);
    await setInvites(ana, event, [anaDora]);
    await expect(details(ben, benInvite)).rejects.toThrow("Not found");
  });

  it("the invitation's table still hands nobody the new columns", async () => {
    await expect(as(ben, "select goal_id from app.event_invites")).rejects.toThrow(/permission denied/);
    await expect(as(ana, "select travel_from from app.event_invites")).rejects.toThrow(/permission denied/);
    await expect(as(ana, "select status from app.event_invites")).rejects.toThrow(/permission denied/);
    await expect(as(ben, "update app.event_invites set goal_id = null")).rejects.toThrow(/permission denied/);
  });
});

describe("the shared to-dos (R66)", () => {
  it("the accepted person adds, renames, ticks, moves and deletes; the owner sees it as her own list, and the event's updated_at stays (R40)", async () => {
    const [{ updated_at: before }] = await db.admin<{ updated_at: Date }>("select updated_at from app.events where id = $1", [event]);
    const [{ id: added }] = await addTodo(ben, benInvite, "  Print handouts  ");
    expect(await todoTitles(event)).toEqual(["0:Book the room", "1:Print handouts"]);
    // On Ana's row, so Ana reads it through her own row-level security.
    expect((await as<{ title: string }>(ana, "select title from app.event_todos where event_id = $1 order by position", [event])).map((t) => t.title)).toEqual([
      "Book the room",
      "Print handouts",
    ]);
    // Also Ana's own to-do can be changed by Ben.
    const [{ id: anas }] = await db.admin<{ id: string }>("select id from app.event_todos where title = 'Book the room'");
    await tickTodo(ben, benInvite, anas, true);
    await renameTodo(ben, benInvite, added, "Print 10 handouts");
    await moveTodo(ben, benInvite, added, 0);
    expect(await todoTitles(event)).toEqual(["0:Print 10 handouts", "1:Book the room ✓"]);
    await moveTodo(ben, benInvite, added, 99);
    expect(await todoTitles(event)).toEqual(["0:Book the room ✓", "1:Print 10 handouts"]);
    await deleteTodo(ben, benInvite, anas);
    expect(await todoTitles(event)).toEqual(["0:Print 10 handouts"]);
    expect((await todos(ben, benInvite)).map((t) => [t.title, t.done])).toEqual([["Print 10 handouts", false]]);
    const [{ updated_at: after }] = await db.admin<{ updated_at: Date }>("select updated_at from app.events where id = $1", [event]);
    expect(after).toEqual(before);
    // A second accepted person shares the same list.
    await answer(dora, doraInvite, "accepted");
    expect((await todos(dora, doraInvite)).map((t) => t.title)).toEqual(["Print 10 handouts"]);
  });

  it("refuses pending, maybe and declined people, a non-invitee and the owner through the invitation; nothing changes", async () => {
    const [{ id: anas }] = await db.admin<{ id: string }>("select id from app.event_todos where title = 'Book the room'");
    const before = await everything();
    await expect(addTodo(dora, doraInvite, "Snacks")).rejects.toThrow("Not found");
    await answer(dora, doraInvite, "tentative");
    await expect(addTodo(dora, doraInvite, "Snacks")).rejects.toThrow("Not found");
    await expect(tickTodo(dora, doraInvite, anas, true)).rejects.toThrow("Not found");
    await answer(dora, doraInvite, "declined");
    await expect(renameTodo(dora, doraInvite, anas, "Mine now")).rejects.toThrow("Not found");
    await expect(deleteTodo(dora, doraInvite, anas)).rejects.toThrow("Not found");
    await expect(moveTodo(dora, doraInvite, anas, 0)).rejects.toThrow("Not found");
    await expect(addTodo(carl, benInvite, "Snacks")).rejects.toThrow("Not found");
    await expect(deleteTodo(carl, benInvite, anas)).rejects.toThrow("Not found");
    await expect(addTodo(ana, benInvite, "Snacks")).rejects.toThrow("Not found");
    // Dora's answers changed only her invitation; everything else is as it was.
    const after = await everything();
    expect(after.slice(1)).toEqual(before.slice(1));
  });

  it("refuses a to-do of another event, also another event of the same owner, with 'Not found'", async () => {
    const other = await seedEvent(ana, "Ana's private event");
    const [{ id: secret }] = await db.admin<{ id: string }>(
      "insert into app.event_todos (user_id, event_id, title, position) values ($1, $2, 'Private', 0) returning id",
      [ana, other],
    );
    const before = await everything();
    await expect(renameTodo(ben, benInvite, secret, "Seen")).rejects.toThrow("Not found");
    await expect(tickTodo(ben, benInvite, secret, true)).rejects.toThrow("Not found");
    await expect(moveTodo(ben, benInvite, secret, 0)).rejects.toThrow("Not found");
    await expect(deleteTodo(ben, benInvite, secret)).rejects.toThrow("Not found");
    expect(await everything()).toEqual(before);
    expect((await todos(ben, benInvite)).map((t) => t.title)).not.toContain("Private");
  });

  it("checks the title and the limit of 20, counting the owner's to-dos too", async () => {
    const before = await everything();
    await expect(addTodo(ben, benInvite, "   ")).rejects.toThrow("A to-do needs a title of 1 to 100 characters");
    await expect(addTodo(ben, benInvite, null)).rejects.toThrow("A to-do needs a title of 1 to 100 characters");
    await expect(addTodo(ben, benInvite, "x".repeat(101))).rejects.toThrow("A to-do needs a title of 1 to 100 characters");
    expect(await everything()).toEqual(before);
    for (let i = 1; i < 20; i++) await addTodo(ben, benInvite, `To-do ${i}`);
    expect(await todoTitles(event)).toHaveLength(20);
    await expect(addTodo(ben, benInvite, "The 21st")).rejects.toThrow("An event can have at most 20 to-dos");
    expect(await todoTitles(event)).toHaveLength(20);
  });

  it("an invited person cannot reach the owner's to-dos or event through the tables themselves", async () => {
    const before = await everything();
    expect(await as(ben, "select id from app.event_todos where event_id = $1", [event])).toEqual([]);
    expect(await as(ben, "update app.event_todos set title = 'Hacked' where event_id = $1 returning id", [event])).toEqual([]);
    await expect(as(ben, "insert into app.event_todos (event_id, title, position) values ($1, 'Mine', 5)", [event])).rejects.toThrow();
    expect(await everything()).toEqual(before);
  });
});

describe("the shared notes (R66)", () => {
  it("the accepted person changes the notes the owner then reads; the event gets a new updated_at and nothing else changes", async () => {
    const [before] = await db.admin<Record<string, unknown>>("select * from app.events where id = $1", [event]);
    await setNotes(ben, benInvite, "Bring the slides and a laptop", "Bring the slides");
    const [after] = await db.admin<Record<string, unknown>>("select * from app.events where id = $1", [event]);
    expect(after.notes).toBe("Bring the slides and a laptop");
    expect(new Date(after.updated_at as Date).getTime()).toBeGreaterThan(new Date(before.updated_at as Date).getTime());
    // Title, times, place, Ana's goal, travel mode and travel_from: as they were (R63).
    const rest = (row: Record<string, unknown>) => ({ ...row, notes: null, updated_at: null });
    expect(rest(after)).toEqual(rest(before));
    expect((await as<{ notes: string }>(ana, "select notes from app.events where id = $1", [event]))[0].notes).toBe("Bring the slides and a laptop");
    // Empty removes them.
    await setNotes(ben, benInvite, "", "Bring the slides and a laptop");
    expect((await db.admin<{ notes: string | null }>("select notes from app.events where id = $1", [event]))[0].notes).toBeNull();
    await setNotes(ben, benInvite, "Fresh start", null);
    expect((await details(ben, benInvite))[0].notes).toBe("Fresh start");
  });

  it("refuses notes changed meanwhile, too long notes and spaces at the end; nothing changes", async () => {
    const before = await everything();
    await expect(setNotes(ben, benInvite, "Mine", "Something older")).rejects.toThrow("The notes were changed meanwhile. Reload to see the latest version");
    await expect(setNotes(ben, benInvite, "x".repeat(2001), "Bring the slides")).rejects.toThrow(/events_notes_length/);
    await expect(setNotes(ben, benInvite, "Trailing ", "Bring the slides")).rejects.toThrow(/events_notes_length/);
    expect(await everything()).toEqual(before);
  });

  it("refuses a pending, maybe or declined person, a non-invitee and the owner through the invitation", async () => {
    const before = await everything();
    await expect(setNotes(dora, doraInvite, "Dora was here", "Bring the slides")).rejects.toThrow("Not found");
    await answer(dora, doraInvite, "tentative");
    await expect(setNotes(dora, doraInvite, "Dora was here", "Bring the slides")).rejects.toThrow("Not found");
    await answer(dora, doraInvite, "declined");
    await expect(setNotes(dora, doraInvite, "Dora was here", "Bring the slides")).rejects.toThrow("Not found");
    await expect(setNotes(carl, benInvite, "Carl was here", "Bring the slides")).rejects.toThrow("Not found");
    await expect(setNotes(ana, benInvite, "Ana via Ben", "Bring the slides")).rejects.toThrow("Not found");
    const after = await everything();
    expect(after.slice(1)).toEqual(before.slice(1));
  });

  it("the title, times and place cannot be written by an invited person in any way (R63)", async () => {
    const before = await everything();
    // Through the table: row-level security finds no row of Ana's.
    expect(await as(ben, "update app.events set title = 'Ben''s now', start_at = start_at + interval '1 day' where id = $1 returning id", [event])).toEqual([]);
    expect(await as(ben, "update app.events set notes = 'Direct' where id = $1 returning id", [event])).toEqual([]);
    // No function of this file takes a title, a time or a place, and the notes function writes only the notes.
    const functions = await db.admin<{ args: string }>(
      `select pg_get_function_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'app' and p.proname like '%accepted_invite%'`,
    );
    expect(functions.length).toBeGreaterThanOrEqual(10);
    for (const f of functions) expect(f.args).not.toMatch(/title_new|p_start|p_end|p_location|p_day/);
    expect(await everything()).toEqual(before);
  });
});

describe("the invited person's own goal, route and done mark (R67)", () => {
  it("saves one of their own goals, a travel mode and a start on their invitation only; the owner's event keeps hers", async () => {
    const goal = await seedGoal(ben);
    const [eventBefore] = await db.admin("select * from app.events where id = $1", [event]);
    await setPersonal(ben, benInvite, goal, "transit", "address:Rua Augusta 10");
    expect((await details(ben, benInvite))[0]).toMatchObject({ goal_id: goal, travel_mode: "transit", travel_from: "address:Rua Augusta 10" });
    expect(await db.admin("select * from app.events where id = $1", [event])).toEqual([eventBefore]);
    // Back to none and the standard.
    await setPersonal(ben, benInvite, null, null, null);
    expect((await details(ben, benInvite))[0]).toMatchObject({ goal_id: null, travel_mode: null, travel_from: null });
    // Deleting the goal empties it.
    await setPersonal(ben, benInvite, goal, null, null);
    await db.admin("delete from app.goals where id = $1", [goal]);
    expect((await details(ben, benInvite))[0].goal_id).toBeNull();
  });

  it("refuses someone else's goal, a goal on an all-day event, bad values, and anyone but the accepted person", async () => {
    const anasGoal = await seedGoal(ana, "Ana's goal");
    const bensGoal = await seedGoal(ben);
    const doraGoal = await seedGoal(dora);
    const before = await everything();
    await expect(setPersonal(ben, benInvite, anasGoal, null, null)).rejects.toThrow("Not found");
    await expect(setPersonal(ben, benInvite, "00000000-0000-4000-8000-00000000abcd", null, null)).rejects.toThrow("Not found");
    await expect(setPersonal(ben, benInvite, null, "teleport", null)).rejects.toThrow(/event_invites_travel_mode/);
    await expect(setPersonal(ben, benInvite, null, null, "somewhere")).rejects.toThrow(/event_invites_travel_from_form/);
    await expect(setPersonal(dora, doraInvite, doraGoal, null, null)).rejects.toThrow("Not found");
    await expect(setPersonal(carl, benInvite, null, "driving", null)).rejects.toThrow("Not found");
    await expect(setPersonal(ana, benInvite, anasGoal, null, null)).rejects.toThrow("Not found");
    expect(await everything()).toEqual(before);

    const allDay = await seedEvent(ana, "Trip", { allDay: true });
    await setInvites(ana, allDay, [anaBen]);
    const allDayInvite = await inviteIdOf(ben, allDay);
    await answer(ben, allDayInvite, "accepted");
    await expect(setPersonal(ben, allDayInvite, bensGoal, null, null)).rejects.toThrow("All-day events have no goal");
  });

  it("marks done once the event has started, never an all-day event, and only for the accepted person", async () => {
    const now = await seedEvent(ana, "Now", { start: inHours(-1), end: inHours(1) });
    await setInvites(ana, now, [anaBen, anaDora]);
    const benNow = await inviteIdOf(ben, now);
    const doraNow = await inviteIdOf(dora, now);
    await answer(ben, benNow, "accepted");
    await setDone(ben, benNow, true);
    expect((await details(ben, benNow))[0].status).toBe("done");
    // Ana's own event stays planned.
    expect((await db.admin<{ status: string }>("select status from app.events where id = $1", [now]))[0].status).toBe("planned");
    await setDone(ben, benNow, false);
    expect((await details(ben, benNow))[0].status).toBe("planned");

    await expect(setDone(ben, benInvite, true)).rejects.toThrow("You can mark an event done once it has started");
    await expect(setDone(dora, doraNow, true)).rejects.toThrow("Not found");
    await expect(setDone(carl, benNow, true)).rejects.toThrow("Not found");
    await expect(setDone(ana, benNow, true)).rejects.toThrow("Not found");
    expect((await details(ben, benNow))[0].status).toBe("planned");
  });
});

describe("the goal's events of the invited person (R66)", () => {
  it("lists only accepted invitations to timed events with one of the caller's goals, with their own done mark", async () => {
    const goal = await seedGoal(ben);
    expect(await goalEvents(ben)).toEqual([]);
    await setPersonal(ben, benInvite, goal, null, null);
    expect(await goalEvents(ben)).toEqual([expect.objectContaining({ invite_id: benInvite, goal_id: goal, title: "Group project meeting", status: "planned" })]);
    // Nobody else sees Ben's: not Ana (the owner), not Carl, not Dora.
    expect(await goalEvents(ana)).toEqual([]);
    expect(await goalEvents(carl)).toEqual([]);
    expect(await goalEvents(dora)).toEqual([]);
    // Maybe or declined: it does not count.
    await answer(ben, benInvite, "tentative");
    expect(await goalEvents(ben)).toEqual([]);
    await answer(ben, benInvite, "accepted");
    expect(await goalEvents(ben)).toHaveLength(1);
    // The owner moves the event: back to no answer yet, so it does not count until accepted again.
    await db.admin("update app.events set start_at = start_at + interval '1 hour', end_at = end_at + interval '1 hour' where id = $1", [event]);
    expect(await goalEvents(ben)).toEqual([]);
  });
});

describe("rights of the functions", () => {
  it("anon may run none of them, and the helper is for the functions only", async () => {
    const rows = await db.admin<{ proname: string; anon: boolean; authenticated: boolean }>(
      `select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as authenticated
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'app' and p.proname like '%accepted_invite%' order by p.proname`,
    );
    expect(rows.map((r) => r.proname)).toEqual([
      "accepted_invite_details",
      "accepted_invite_goal_events",
      "accepted_invite_row",
      "accepted_invite_todos",
      "add_accepted_invite_todo",
      "delete_accepted_invite_todo",
      "move_accepted_invite_todo",
      "rename_accepted_invite_todo",
      "set_accepted_invite_done",
      "set_accepted_invite_notes",
      "set_accepted_invite_personal",
      "tick_accepted_invite_todo",
    ]);
    for (const row of rows) {
      expect(row.anon, row.proname).toBe(false);
      expect(row.authenticated, row.proname).toBe(row.proname !== "accepted_invite_row");
    }
    await expect(as(ben, "select * from app.accepted_invite_row($1::uuid)", [benInvite])).rejects.toThrow(/permission denied/);
  });
});
