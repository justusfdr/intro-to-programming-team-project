// Tests for the actions of spec 55 (an accepted invitation, almost like an own event; ontology R65 to
// R67): the full card, the shared to-dos and notes, the invited person's own goal, route and done mark,
// their travel time, and that their goal progress, widgets and analytics count the event. Accepted and
// rejected case for each rule; a rejection changes nothing (R1). The card's keys are checked against
// allow-lists (ACCEPTED_INVITE_KEYS), so a new key fails a test. Pending, maybe and declined invitations,
// other people, the owner and malformed ids all get the same "Not found" (R64).
// The database decides "not ended" and "started" by its own clock, so most events lie in 2030; the goal
// progress uses the fake clock's week (Monday 16 November 2026), set up directly in the database.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, OWN_ORIGIN, postJson, read, type TestApp } from "@test/support/app";
import { seedGoal } from "@test/support/goals";
import { readPeople } from "@/lib/server/profiles/cards";
import { FakeRouting } from "@/lib/server/routing/fake";
import { loadGoals } from "@/lib/server/goals/load";
import { readAnalyticsReport } from "@/lib/server/analytics/report";
import { readTimeZone } from "@/lib/server/settings";
import { ACCEPTED_INVITE_KEYS, INVITE_PERSON_CARD_KEYS, SHARED_TODO_KEYS } from "@/lib/invites/types";
import {
  acceptedInviteDetails,
  addInviteTodo,
  answerEventInvite,
  deleteInviteTodo,
  inviteTravelTime,
  moveInviteTodo,
  renameInviteTodo,
  setEventInvites,
  setInviteDone,
  setInviteNotes,
  setInvitePersonal,
  tickInviteTodo,
} from "./event-invites";
import { listTodos } from "./event-todos";

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

const details = (invite: string, headers?: Record<string, string>) => acceptedInviteDetails(get(`/api/invites/${invite}/details`, headers), app.deps, invite);
const addTodo = (invite: string, title: unknown) => addInviteTodo(postJson(`/api/invites/${invite}/todos`, { title }), app.deps, invite);
const renameTodo = (invite: string, todo: string, title: unknown) => renameInviteTodo(postJson(`/api/invites/${invite}/todos/${todo}/rename`, { title }), app.deps, invite, todo);
const tickTodo = (invite: string, todo: string, done: unknown) => tickInviteTodo(postJson(`/api/invites/${invite}/todos/${todo}/done`, { done }), app.deps, invite, todo);
const moveTodo = (invite: string, todo: string, toIndex: unknown) => moveInviteTodo(postJson(`/api/invites/${invite}/todos/${todo}/move`, { toIndex }), app.deps, invite, todo);
const deleteTodo = (invite: string, todo: string) => deleteInviteTodo(postJson(`/api/invites/${invite}/todos/${todo}/delete`, {}), app.deps, invite, todo);
const setNotes = (invite: string, notes: unknown, before: unknown, headers?: Record<string, string>) =>
  setInviteNotes(postJson(`/api/invites/${invite}/notes`, { notes, before }, headers), app.deps, invite);
const setPersonal = (invite: string, body: Record<string, unknown>) => setInvitePersonal(postJson(`/api/invites/${invite}/personal`, body), app.deps, invite);
const setDone = (invite: string, done: unknown) => setInviteDone(postJson(`/api/invites/${invite}/done`, { done }), app.deps, invite);
const answer = (invite: string, value: string) => answerEventInvite(postJson(`/api/invites/${invite}/answer`, { answer: value }), app.deps, invite);

/** Signs `email` in again (the session belongs to the last one). */
const as = (email: string) => app.signedInAs(email);

/** Ana is contacts with Ben, Dora and Carl. Ana invites Ben and Dora to "Group project meeting"; Ben accepts. Ben is signed in at the end. */
async function cast(extra: { start?: string; end?: string } = {}) {
  const carl = await as("carl@example.com");
  const dora = await as("dora@example.com");
  const ben = await as("ben@example.com");
  const ana = await as("ana@example.com");
  const befriend = async (a: string, b: string, bEmail: string) => {
    await app.db.withUser(a, (q) => q("select app.invite_contact($1)", [bEmail]));
    const received = (await app.db.withUser(b, readPeople)).received[0];
    await app.db.withUser(b, (q) => q("select app.answer_invitation($1::uuid, true)", [received.id]));
  };
  await befriend(ana, ben, "ben@example.com");
  await befriend(ana, dora, "dora@example.com");
  await befriend(ana, carl, "carl@example.com");
  await app.db.admin("update app.profiles set display_name = 'Ana Lopes' where id = $1", [ana]);
  const anas = (await app.db.withUser(ana, readPeople)).contacts;
  const [row] = await app.db.admin<{ id: string }>(
    `insert into app.events (user_id, title, start_at, end_at, location, notes, travel_mode, travel_from, guests)
     values ($1, 'Group project meeting', $2::timestamptz, $3::timestamptz, 'Library, room 4', 'Bring the slides', 'walking', 'home', '{lea@example.com}') returning id`,
    [ana, extra.start ?? "2030-01-08T10:00:00Z", extra.end ?? "2030-01-08T11:00:00Z"],
  );
  const event = row.id;
  await app.db.admin("insert into app.event_todos (event_id, user_id, title, position) values ($1, $2, 'Book the room', 0)", [event, ana]);
  const contactOf = (id: string) => anas.find((c) => c.userId === id)!.id;
  expect((await setEventInvites(postJson(`/api/events/${event}/invites`, { contacts: [contactOf(ben), contactOf(dora)] }), app.deps, event)).status).toBe(200);
  const inviteOf = async (invitee: string) => (await app.db.admin<{ id: string }>("select id from app.event_invites where invitee = $1 and event_id = $2", [invitee, event]))[0].id;
  const benInvite = await inviteOf(ben);
  const doraInvite = await inviteOf(dora);
  await as("ben@example.com");
  expect((await answer(benInvite, "accepted")).status).toBe(200);
  return { ana, ben, carl, dora, event, benInvite, doraInvite };
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

const ALLOWED = new Set<string>([...ACCEPTED_INVITE_KEYS, ...SHARED_TODO_KEYS, ...INVITE_PERSON_CARD_KEYS]);

describe("read_accepted_invite_details (R65)", () => {
  it("the accepted person reads title, time, place, notes, the shared to-dos and their own choices; only allowed keys", async () => {
    const { ana, event, benInvite } = await cast();
    const answered = await read(await details(benInvite));
    expect(answered.status).toBe(200);
    const card = answered.body.details as Record<string, unknown>;
    expect(card).toMatchObject({
      inviteId: benInvite,
      answer: "accepted",
      inviter: { userId: ana, name: "Ana Lopes", photoUrl: null },
      title: "Group project meeting",
      location: "Library, room 4",
      notes: "Bring the slides",
      allDay: false,
      startAt: "2030-01-08T10:00:00.000Z",
      endAt: "2030-01-08T11:00:00.000Z",
      goalId: null,
      travelMode: null,
      travelFrom: null,
      done: false,
    });
    expect((card.todos as { title: string }[]).map((t) => t.title)).toEqual(["Book the room"]);
    for (const key of keysOf(answered.body)) expect(ALLOWED.has(key) || key === "details", key).toBe(true);
    // Never the event's id, Ana's guests, her travel mode or start, or any address.
    const text = JSON.stringify(answered.body);
    expect(text).not.toContain(event);
    expect(text).not.toContain("@");
    expect(text).not.toContain("walking");
    expect(text).not.toContain('"home"');
  });

  it("refuses a pending, maybe and declined invitation, someone else's, the owner, unknown and malformed ids with the same 'Not found'", async () => {
    const { doraInvite, benInvite } = await cast();
    await as("dora@example.com");
    expect(await read(await details(doraInvite))).toEqual(NOT_FOUND);
    await answer(doraInvite, "tentative");
    expect(await read(await details(doraInvite))).toEqual(NOT_FOUND);
    await answer(doraInvite, "declined");
    expect(await read(await details(doraInvite))).toEqual(NOT_FOUND);
    expect(await read(await details(benInvite))).toEqual(NOT_FOUND);
    await as("carl@example.com");
    expect(await read(await details(benInvite))).toEqual(NOT_FOUND);
    await as("ana@example.com");
    expect(await read(await details(benInvite))).toEqual(NOT_FOUND);
    expect(await read(await details(UNKNOWN))).toEqual(NOT_FOUND);
    expect(await read(await details("not-a-uuid"))).toEqual(NOT_FOUND);
  });

  it("refuses a request from another site and one without sign-in", async () => {
    const { benInvite } = await cast();
    expect((await details(benInvite, CROSS_SITE)).status).toBe(403);
    await app.auth.signOut();
    expect((await details(benInvite)).status).toBe(401);
  });
});

describe("the shared to-dos (R66)", () => {
  it("Ben adds, renames, ticks, moves and deletes; Ana's own editor reads the same list", async () => {
    const { event, benInvite } = await cast();
    const added = await read(await addTodo(benInvite, "  Print handouts "));
    expect(added.status).toBe(201);
    expect(added.body.message).toBe("To-do added.");
    let todos = (added.body.details as { todos: { id: string; title: string; done: boolean }[] }).todos;
    expect(todos.map((t) => t.title)).toEqual(["Book the room", "Print handouts"]);
    const [anas, bens] = todos;
    todos = ((await read(await tickTodo(benInvite, anas.id, true))).body.details as { todos: typeof todos }).todos;
    expect(todos[0].done).toBe(true);
    await renameTodo(benInvite, bens.id, "Print 10 handouts");
    todos = ((await read(await moveTodo(benInvite, bens.id, 0))).body.details as { todos: typeof todos }).todos;
    expect(todos.map((t) => t.title)).toEqual(["Print 10 handouts", "Book the room"]);
    // Ana's editor reads the list through her own action.
    await as("ana@example.com");
    const own = await read(await listTodos(get(`/api/events/${event}/todos`), app.deps, event));
    expect((own.body.todos as { title: string; done: boolean }[]).map((t) => [t.title, t.done])).toEqual([
      ["Print 10 handouts", false],
      ["Book the room", true],
    ]);
    await as("ben@example.com");
    todos = ((await read(await deleteTodo(benInvite, anas.id))).body.details as { todos: typeof todos }).todos;
    expect(todos.map((t) => t.title)).toEqual(["Print 10 handouts"]);
  });

  it("refuses a pending, maybe or declined person, someone else, a to-do of another event and a bad title; nothing changes", async () => {
    const { ana, benInvite, doraInvite } = await cast();
    const [other] = await app.db.admin<{ id: string }>("insert into app.events (user_id, title, start_at, end_at) values ($1, 'Private', '2030-01-09T10:00:00Z', '2030-01-09T11:00:00Z') returning id", [ana]);
    const [{ id: secret }] = await app.db.admin<{ id: string }>("insert into app.event_todos (event_id, user_id, title, position) values ($1, $2, 'Private to-do', 0) returning id", [other.id, ana]);
    const [{ id: shared }] = await app.db.admin<{ id: string }>("select id from app.event_todos where title = 'Book the room'");
    const before = (await app.snapshot()).tables;
    expect(await read(await renameTodo(benInvite, secret, "Seen"))).toEqual(NOT_FOUND);
    expect(await read(await tickTodo(benInvite, secret, true))).toEqual(NOT_FOUND);
    expect(await read(await deleteTodo(benInvite, secret))).toEqual(NOT_FOUND);
    expect(await read(await moveTodo(benInvite, secret, 0))).toEqual(NOT_FOUND);
    expect(await read(await addTodo(benInvite, "   "))).toEqual({ status: 400, body: { error: "todo_title_length", message: "A to-do needs a title of 1 to 100 characters" } });
    expect((await addTodo(benInvite, 7)).status).toBe(400);
    expect(await read(await renameTodo(benInvite, "not-a-uuid", "x"))).toEqual(NOT_FOUND);
    await as("dora@example.com");
    expect(await read(await addTodo(doraInvite, "Snacks"))).toEqual(NOT_FOUND);
    expect(await read(await tickTodo(doraInvite, shared, true))).toEqual(NOT_FOUND);
    expect(await read(await addTodo(benInvite, "Snacks"))).toEqual(NOT_FOUND);
    await as("carl@example.com");
    expect(await read(await deleteTodo(benInvite, shared))).toEqual(NOT_FOUND);
    await as("ana@example.com");
    expect(await read(await addTodo(benInvite, "Snacks"))).toEqual(NOT_FOUND);
    expect((await app.snapshot()).tables).toEqual(before);
  });

  it("the 21st to-do is refused with the ontology's sentence", async () => {
    const { benInvite } = await cast();
    for (let i = 1; i < 20; i++) expect((await addTodo(benInvite, `To-do ${i}`)).status).toBe(201);
    expect(await read(await addTodo(benInvite, "The 21st"))).toEqual({ status: 409, body: { error: "too_many_todos", message: "An event can have at most 20 to-dos" } });
  });
});

describe("the shared notes (R66)", () => {
  it("Ben changes the notes Ana then reads; title, time and place stay hers", async () => {
    const { event, benInvite } = await cast();
    const [before] = await app.db.admin<Record<string, unknown>>("select title, start_at, end_at, location, goal_id, travel_mode, travel_from, guests from app.events where id = $1", [event]);
    const saved = await read(await setNotes(benInvite, "Bring the slides and a laptop  ", "Bring the slides"));
    expect(saved.status).toBe(200);
    expect(saved.body.message).toBe("Notes saved.");
    expect((saved.body.details as { notes: string }).notes).toBe("Bring the slides and a laptop");
    const [after] = await app.db.admin<Record<string, unknown>>("select title, start_at, end_at, location, goal_id, travel_mode, travel_from, guests, notes from app.events where id = $1", [event]);
    expect(after).toEqual({ ...before, notes: "Bring the slides and a laptop" });
    // Empty removes them.
    expect((await read(await setNotes(benInvite, "", "Bring the slides and a laptop"))).body.details).toMatchObject({ notes: null });
  });

  it("refuses notes changed meanwhile, too long notes, a pending person and someone else; nothing changes", async () => {
    const { benInvite, doraInvite } = await cast();
    const before = (await app.snapshot()).tables;
    expect(await read(await setNotes(benInvite, "Mine", "An older text"))).toEqual({
      status: 409,
      body: { error: "notes_changed", message: "The notes were changed meanwhile. Reload to see the latest version" },
    });
    expect(await read(await setNotes(benInvite, "x".repeat(2001), "Bring the slides"))).toEqual({ status: 400, body: { error: "notes_length", message: "Notes can be at most 2,000 characters" } });
    expect((await setNotes(benInvite, "Hi", "Bring the slides", CROSS_SITE)).status).toBe(403);
    await as("dora@example.com");
    expect(await read(await setNotes(doraInvite, "Dora", "Bring the slides"))).toEqual(NOT_FOUND);
    await as("carl@example.com");
    expect(await read(await setNotes(benInvite, "Carl", "Bring the slides"))).toEqual(NOT_FOUND);
    expect((await app.snapshot()).tables).toEqual(before);
  });
});

describe("the invited person's own goal, route and done mark (R67)", () => {
  it("saves one of Ben's goals and his route on his invitation; Ana's event keeps her way and start", async () => {
    const { ben, event, benInvite } = await cast();
    const goal = await seedGoal(app.db, ben, { title: "Uni", deadline: "2030-06-30", rules: [{ kind: "count", target: 2 }] });
    const saved = await read(await setPersonal(benInvite, { goalId: goal.id, travelMode: "transit", travelFrom: "address:Rua Augusta 10" }));
    expect(saved.status).toBe(200);
    expect(saved.body.message).toBe("Saved for you.");
    expect(saved.body.details).toMatchObject({ goalId: goal.id, travelMode: "transit", travelFrom: "address:Rua Augusta 10" });
    expect(await app.db.admin("select goal_id, travel_mode, travel_from from app.events where id = $1", [event])).toEqual([{ goal_id: null, travel_mode: "walking", travel_from: "home" }]);
    // Back to none and the standards.
    expect((await read(await setPersonal(benInvite, { goalId: null, travelMode: null, travelFrom: null }))).body.details).toMatchObject({ goalId: null, travelMode: null, travelFrom: null });
  });

  it("refuses Ana's goal, a malformed goal, a bad way or start, and anyone but the accepted person; nothing changes", async () => {
    const { ana, benInvite, doraInvite } = await cast();
    const anasGoal = await seedGoal(app.db, ana, { title: "Ana's", deadline: "2030-06-30", rules: [{ kind: "count", target: 1 }] });
    const before = (await app.snapshot()).tables;
    expect(await read(await setPersonal(benInvite, { goalId: anasGoal.id, travelMode: null, travelFrom: null }))).toEqual(NOT_FOUND);
    expect(await read(await setPersonal(benInvite, { goalId: "nope", travelMode: null, travelFrom: null }))).toEqual(NOT_FOUND);
    expect((await setPersonal(benInvite, { goalId: null, travelMode: "teleport", travelFrom: null })).status).toBe(400);
    expect((await setPersonal(benInvite, { goalId: null, travelMode: null, travelFrom: "somewhere" })).status).toBe(400);
    expect((await setPersonal(benInvite, { goalId: null })).status).toBe(400);
    await as("dora@example.com");
    expect(await read(await setPersonal(doraInvite, { goalId: null, travelMode: "driving", travelFrom: null }))).toEqual(NOT_FOUND);
    await as("ana@example.com");
    expect(await read(await setPersonal(benInvite, { goalId: anasGoal.id, travelMode: null, travelFrom: null }))).toEqual(NOT_FOUND);
    expect((await app.snapshot()).tables).toEqual(before);
  });

  it("marks done only once the event has started (the database's clock), for the accepted person only", async () => {
    const now = Date.now();
    const { benInvite, doraInvite } = await cast({ start: new Date(now - 60 * 60_000).toISOString(), end: new Date(now + 60 * 60_000).toISOString() });
    const done = await read(await setDone(benInvite, true));
    expect(done.status).toBe(200);
    expect(done.body.message).toBe("Marked done.");
    expect(done.body.details).toMatchObject({ done: true });
    expect((await read(await setDone(benInvite, false))).body.details).toMatchObject({ done: false });
    await as("dora@example.com");
    expect(await read(await setDone(doraInvite, true))).toEqual(NOT_FOUND);
  });

  it("refuses done before the event has started", async () => {
    const { benInvite } = await cast();
    const before = (await app.snapshot()).tables;
    expect(await read(await setDone(benInvite, true))).toEqual({ status: 409, body: { error: "not_started", message: "You can mark an event done once it has started" } });
    expect((await app.snapshot()).tables).toEqual(before);
  });
});

describe("Ben's goal counts the accepted event like an own one (R66)", () => {
  /** The event on Tuesday of the fake clock's week, accepted, with Ben's goal; set up in the database (the rules are tested above). */
  async function weekCast(status: "planned" | "done", answerValue = "accepted") {
    const { ben, ana, event, benInvite } = await cast();
    const goal = await seedGoal(app.db, ben, { title: "Uni", deadline: "2027-03-14", createdAt: "2026-11-02T10:00:00Z", rules: [{ kind: "count", target: 2 }] });
    // Moving the event resets the answer (R62), so the answer and Ben's choices are written after it.
    await app.db.admin("update app.events set start_at = '2026-11-17T10:00:00Z', end_at = '2026-11-17T11:00:00Z' where id = $1", [event]);
    await app.db.admin("update app.event_invites set answer = $2, answered_at = now(), goal_id = $3, status = $4 where id = $1", [benInvite, answerValue, goal.id, status]);
    return { ben, ana, goal: goal.id };
  }

  it("done: the rule's count and the day row show it; Ana's goals are not touched", async () => {
    const { ben, ana, goal } = await weekCast("done");
    const [view] = await loadGoals(app.deps, ben);
    expect(view.id).toBe(goal);
    expect(view.progress.thisWeek[0].text).toContain("1");
    expect(view.progress.days?.find((d) => d.date === "2026-11-17")).toMatchObject({ done: true });
    expect(await loadGoals(app.deps, ana)).toEqual([]);
    // The analytics count it as a done event of the goal.
    const report = await app.db.withUser(ben, (q) => readAnalyticsReport(q, app.now(), undefined, readTimeZone(q)));
    const items = report.goals.plan.flatMap((d) => d.items);
    expect(items).toEqual([expect.objectContaining({ title: "Group project meeting", state: "done" })]);
  });

  it("planned: the day row shows it planned, the count stays 0", async () => {
    const { ben } = await weekCast("planned");
    const [view] = await loadGoals(app.deps, ben);
    expect(view.progress.days?.find((d) => d.date === "2026-11-17")).toMatchObject({ done: false, planned: true });
  });

  it("maybe or declined: it does not count", async () => {
    const { ben } = await weekCast("done", "tentative");
    const [view] = await loadGoals(app.deps, ben);
    expect(view.progress.days?.find((d) => d.date === "2026-11-17")).toMatchObject({ done: false });
    expect(view.progress.days?.find((d) => d.date === "2026-11-17")?.planned).toBeFalsy();
  });
});

describe("Ben's own travel time to the event (R67)", () => {
  const ask = (invite: string, query = "") => inviteTravelTime(get(`/api/invites/${invite}/travel${query}`), app.deps, invite, routing);
  let routing: FakeRouting;

  beforeEach(() => {
    routing = new FakeRouting();
    routing.places.set("rua augusta 10, lisboa", { lat: 38.71, lon: -9.137 });
    routing.places.set("library, room 4", { lat: 38.68, lon: -9.32 });
  });

  it("from Ben's home with Ben's way and buffer, never Ana's; a preview way counts for that answer only", async () => {
    const { ben, benInvite } = await cast();
    await app.db.admin("update app.settings set home_address = 'Rua Augusta 10, Lisboa', travel_mode = 'driving', travel_buffer_minutes = 5 where user_id = $1", [ben]);
    const before = (await app.snapshot()).tables;
    const answered = await read(await ask(benInvite));
    expect(answered.status).toBe(200);
    // Driving 25 minutes + 5 buffer before 10:00 UTC: Ana's "walking" (90 minutes) is not used.
    expect(answered.body.travel).toMatchObject({ status: "ok", mode: "driving", minutes: 25, bufferMinutes: 5, leaveAt: "2030-01-08T09:30:00.000Z", from: "Home" });
    expect((await read(await ask(benInvite, "?mode=cycling"))).body.travel).toMatchObject({ mode: "cycling", minutes: 40 });
    // The place cannot be previewed: it is Ana's.
    expect((await read(await ask(benInvite, "?location=Nowhere"))).body.travel).toMatchObject({ status: "ok", minutes: 25 });
    expect((await app.snapshot()).tables).toEqual(before);
  });

  it("refuses a pending person, someone else and a malformed id with 'Not found'", async () => {
    const { benInvite, doraInvite } = await cast();
    await as("dora@example.com");
    expect(await read(await ask(doraInvite))).toEqual(NOT_FOUND);
    await as("carl@example.com");
    expect(await read(await ask(benInvite))).toEqual(NOT_FOUND);
    expect(await read(await ask("x"))).toEqual(NOT_FOUND);
  });
});
