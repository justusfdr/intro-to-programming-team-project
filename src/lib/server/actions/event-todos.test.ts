// Tests for the to-dos inside an event (spec 21): add_todo, rename_todo, tick_todo, move_todo,
// delete_todo and reading an event's list; create_event with a list (one event, a series, all day,
// rejected lists); delete_event answering with the to-dos for the calendar's undo (R38); the calendar
// loader's two numbers. Each rule with its accepted and rejected case; a rejection changes nothing
// (app.snapshot() before and after, R1).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, OWN_ORIGIN, postJson, read, type TestApp } from "@test/support/app";
import { seedAllDay, seedEvent } from "@test/support/events";
import { loadWeek } from "@/lib/server/events/week";
import { createEvent } from "./create-event";
import { deleteEvent } from "./delete-event";
import { addTodo, deleteTodo, listTodos, moveTodo, renameTodo, tickTodo } from "./event-todos";

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

// Tuesday 17 November 2026, 12:00 to 13:00 UTC (the clock stands at Monday 09:00).
const STUDY = { title: "Study", start: "2026-11-17T12:00:00Z", end: "2026-11-17T13:00:00Z" };

const add = (eventId: string, title: string, headers?: Record<string, string>) =>
  addTodo(postJson(`/api/events/${eventId}/todos`, { title }, headers), app.deps, eventId);
const rename = (id: string, title: string) => renameTodo(postJson(`/api/todos/${id}/rename`, { title }), app.deps, id);
const tick = (id: string, done: boolean) => tickTodo(postJson(`/api/todos/${id}/done`, { done }), app.deps, id);
const move = (id: string, toIndex: unknown) => moveTodo(postJson(`/api/todos/${id}/move`, { toIndex }), app.deps, id);
const remove = (id: string) => deleteTodo(postJson(`/api/todos/${id}/delete`, {}), app.deps, id);

/** A GET from our own page, as fetch sends it (no Origin, Sec-Fetch-Site same-origin). */
function list(eventId: string, headers: Record<string, string> = {}) {
  const request = new Request(`${OWN_ORIGIN}/api/events/${eventId}/todos`, {
    method: "GET",
    headers: { host: "localhost:3000", "sec-fetch-site": "same-origin", ...headers },
  });
  return listTodos(request, app.deps, eventId);
}

type Listed = { todos: { id: string; title: string; done: boolean }[]; todoCount: number; todosDone: number };
const listed = async (response: Response) => (await read(response)).body as unknown as Listed;
const titles = async (eventId: string) =>
  (await app.db.admin<{ title: string }>("select title from app.event_todos where event_id = $1 order by position", [eventId])).map((t) => t.title);
const positions = async (eventId: string) =>
  (await app.db.admin<{ position: number }>("select position from app.event_todos where event_id = $1 order by position", [eventId])).map(
    (t) => t.position,
  );

async function seedTodos(userId: string, eventId: string, count: number) {
  await app.db.admin(
    "insert into app.event_todos (user_id, event_id, title, position) select $1, $2, 'To-do ' || n, n - 1 from generate_series(1, $3::int) n",
    [userId, eventId, count],
  );
}

async function seedOutlookEvent(userId: string) {
  const [row] = await app.db.admin<{ id: string }>(
    `insert into app.events (user_id, title, start_at, end_at, source, outlook_id)
     values ($1, 'Team call', '2026-11-17T10:00:00Z', '2026-11-17T11:00:00Z', 'outlook', 'AAMk-1') returning id`,
    [userId],
  );
  return row.id;
}

describe("add_todo", () => {
  it("adds to the end of the list, trimmed, not done; answers with the whole list and '0/2'", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { id } = await seedEvent(app.db, alice, STUDY);

    await add(id, "Read chapter 3");
    const answer = await read(await add(id, "  Exercises 1-4  "));

    expect(answer.status).toBe(201);
    expect(answer.body).toMatchObject({
      message: "To-do added.",
      eventId: id,
      todos: [
        { title: "Read chapter 3", done: false },
        { title: "Exercises 1-4", done: false },
      ],
      todoCount: 2,
      todosDone: 0,
    });
    expect(await positions(id)).toEqual([0, 1]);
  });

  it("works on an all-day event, and leaves the event's updated_at as it was (R4)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const exam = await seedAllDay(app.db, alice, { firstDay: "2026-11-16", lastDay: "2026-11-20" });
    expect((await read(await add(exam.id, "Pack"))).status).toBe(201);
    const [row] = await app.db.admin<{ updated_at: Date }>("select updated_at from app.events where id = $1", [exam.id]);
    expect(new Date(row.updated_at).toISOString()).toBe(exam.updatedAt);
  });

  it("rejects an empty or 101-character title: 'A to-do needs a title of 1 to 100 characters'; 100 is fine", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { id } = await seedEvent(app.db, alice, STUDY);
    const before = await app.snapshot();
    for (const title of ["", "   ", "x".repeat(101)]) {
      expect(await read(await add(id, title)), JSON.stringify(title)).toEqual({
        status: 400,
        body: { error: "todo_title_length", message: "A to-do needs a title of 1 to 100 characters" },
      });
    }
    expect(await app.snapshot()).toEqual(before);
    expect((await read(await add(id, "x".repeat(100)))).status).toBe(201);
  });

  it("rejects the 21st: 'An event can have at most 20 to-dos'; nothing saved", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { id } = await seedEvent(app.db, alice, STUDY);
    await seedTodos(alice, id, 19);
    expect((await read(await add(id, "Twentieth"))).status).toBe(201);
    const before = await app.snapshot();
    expect(await read(await add(id, "Too many"))).toEqual({
      status: 409,
      body: { error: "too_many_todos", message: "An event can have at most 20 to-dos" },
    });
    expect(await app.snapshot()).toEqual(before);
  });

  it("two additions at the same moment at 19: exactly one is saved, the other gets the same message", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { id } = await seedEvent(app.db, alice, STUDY);
    await seedTodos(alice, id, 19);
    const answers = await Promise.all([add(id, "First"), add(id, "Second")].map(async (r) => read(await r)));
    expect(answers.map((a) => a.status).sort()).toEqual([201, 409]);
    expect(await titles(id)).toHaveLength(20);
  });

  it("rejects an Outlook event (R11): 'To-dos cannot be added to Outlook events'; nothing saved", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const outlook = await seedOutlookEvent(alice);
    const before = await app.snapshot();
    expect(await read(await add(outlook, "Agenda"))).toEqual({
      status: 409,
      body: { error: "outlook_event", message: "To-dos cannot be added to Outlook events" },
    });
    expect(await app.snapshot()).toEqual(before);
  });

  it("answers the same 'Not found' for another user's event, a missing one and a malformed id (R3); nothing changes", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const bobs = await seedEvent(app.db, bob, STUDY);
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    for (const id of [bobs.id, "00000000-0000-4000-8000-000000000000", "not-a-uuid"]) {
      expect(await read(await add(id, "Mine now")), id).toEqual({ status: 404, body: { error: "not_found", message: "Not found" } });
    }
    expect(await app.snapshot()).toEqual(before);
  });

  it("answers 401 without a session and 403 from another site; nothing changes", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { id } = await seedEvent(app.db, alice, STUDY);
    const crossSite = await read(await add(id, "x", { origin: "https://evil.example", "sec-fetch-site": "cross-site" }));
    expect(crossSite.status).toBe(403);
    await app.auth.signOut();
    expect(await read(await add(id, "x"))).toEqual({ status: 401, body: { error: "unauthorized", message: "Please sign in." } });
    expect(await titles(id)).toEqual([]);
  });

  it("refuses a body that is too large or not the right shape", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { id } = await seedEvent(app.db, alice, STUDY);
    expect((await read(await addTodo(postJson(`/api/events/${id}/todos`, { title: 5 }), app.deps, id))).status).toBe(400);
    expect((await read(await addTodo(postJson(`/api/events/${id}/todos`, "x".repeat(20_000)), app.deps, id))).status).toBe(413);
    expect(await titles(id)).toEqual([]);
  });
});

describe("rename_todo, tick_todo, move_todo, delete_todo", () => {
  async function three() {
    const alice = await app.signedInAs("alice@example.com");
    const event = await seedEvent(app.db, alice, STUDY);
    await seedTodos(alice, event.id, 3);
    const ids = (await app.db.admin<{ id: string }>("select id from app.event_todos order by position")).map((r) => r.id);
    return { alice, event, ids };
  }

  it("rename: a new title, trimmed; an empty one is refused and nothing changes", async () => {
    const { event, ids } = await three();
    expect((await read(await rename(ids[1], "  Summary  "))).body).toMatchObject({ message: "To-do saved.", todos: [{}, { title: "Summary" }, {}] });
    const before = await app.snapshot();
    expect(await read(await rename(ids[1], ""))).toEqual({
      status: 400,
      body: { error: "todo_title_length", message: "A to-do needs a title of 1 to 100 characters" },
    });
    expect(await app.snapshot()).toEqual(before);
    expect(await titles(event.id)).toEqual(["To-do 1", "Summary", "To-do 3"]);
  });

  it("tick: done, and not done again; the answer carries the numbers ('1/3'); twice the same is fine", async () => {
    const { ids } = await three();
    expect(await listed(await tick(ids[0], true))).toMatchObject({ todoCount: 3, todosDone: 1, todos: [{ done: true }, { done: false }, { done: false }] });
    expect(await listed(await tick(ids[0], true))).toMatchObject({ todosDone: 1 });
    expect(await listed(await tick(ids[0], false))).toMatchObject({ todosDone: 0 });
    expect((await read(await tickTodo(postJson(`/api/todos/${ids[0]}/done`, { done: "yes" }), app.deps, ids[0]))).status).toBe(400);
  });

  it("move: to another place, the others close up; a place past the end means the end; a bad place is refused", async () => {
    const { event, ids } = await three();
    await read(await move(ids[2], 0));
    expect(await titles(event.id)).toEqual(["To-do 3", "To-do 1", "To-do 2"]);
    await read(await move(ids[2], 1));
    expect(await titles(event.id)).toEqual(["To-do 1", "To-do 3", "To-do 2"]);
    expect((await read(await move(ids[0], 50))).body).toMatchObject({ message: "To-do moved." });
    expect(await titles(event.id)).toEqual(["To-do 3", "To-do 2", "To-do 1"]);
    expect(await positions(event.id)).toEqual([0, 1, 2]);
    const before = await app.snapshot();
    for (const bad of [-1, 1.5, "1", null, 100]) {
      expect((await read(await move(ids[0], bad))).status, JSON.stringify(bad)).toBe(400);
    }
    expect(await app.snapshot()).toEqual(before);
  });

  it("delete: always allowed; the later ones move up", async () => {
    const { event, ids } = await three();
    expect((await read(await remove(ids[0]))).body).toMatchObject({ message: "To-do deleted.", todoCount: 2 });
    expect(await titles(event.id)).toEqual(["To-do 2", "To-do 3"]);
    expect(await positions(event.id)).toEqual([0, 1]);
  });

  it("another user's to-do, a missing one and a malformed id: the same 'Not found' for all four actions; nothing changes (R3)", async () => {
    const { ids } = await three();
    await app.signedInAs("bob@example.com");
    const before = await app.snapshot();
    for (const id of [ids[0], "00000000-0000-4000-8000-000000000000", "nope"]) {
      for (const response of [rename(id, "Mine"), tick(id, true), move(id, 0), remove(id)]) {
        expect(await read(await response), id).toEqual({ status: 404, body: { error: "not_found", message: "Not found" } });
      }
    }
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("reading an event's to-dos (for its editor)", () => {
  it("lists the user's event's to-dos in order; an Outlook event has none", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { id } = await seedEvent(app.db, alice, STUDY);
    await seedTodos(alice, id, 2);
    expect(await listed(await list(id))).toMatchObject({ todos: [{ title: "To-do 1" }, { title: "To-do 2" }], todoCount: 2, todosDone: 0 });
    expect(await listed(await list(await seedOutlookEvent(alice)))).toMatchObject({ todos: [], todoCount: 0 });
  });

  it("'Not found' for another user's event (R3); 403 from another site; 401 signed out", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const bobs = await seedEvent(app.db, bob, STUDY);
    await seedTodos(bob, bobs.id, 2);
    await app.signedInAs("alice@example.com");
    expect(await read(await list(bobs.id))).toEqual({ status: 404, body: { error: "not_found", message: "Not found" } });
    expect((await read(await list(bobs.id, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    await app.auth.signOut();
    expect((await read(await list(bobs.id))).status).toBe(401);
  });
});

describe("create_event with to-dos", () => {
  const send = (body: unknown) => createEvent(postJson("/api/events", body), app.deps);
  const EVENT = { title: "Study", start: "2026-11-17T12:00", end: "2026-11-17T13:00" };

  it("one event: its to-dos in order, trimmed, done ones done; the answer carries the numbers", async () => {
    await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const answer = await read(await send({ ...EVENT, todos: [{ title: " Read " }, { title: "Exercises", done: true }] }));
    expect(answer.status).toBe(201);
    expect(answer.body).toMatchObject({ event: { title: "Study", todoCount: 2, todosDone: 1 } });
    const id = (answer.body.event as { id: string }).id;
    expect(await app.db.admin("select title, done, position from app.event_todos where event_id = $1 order by position", [id])).toEqual([
      { title: "Read", done: false, position: 0 },
      { title: "Exercises", done: true, position: 1 },
    ]);
  });

  it("a series gets them on every event; an all-day event takes them too; none is fine", async () => {
    await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const series = await read(
      await send({ ...EVENT, repeat: { frequency: "daily", until: "2026-11-19" }, todos: [{ title: "Read" }, { title: "Summarise" }] }),
    );
    expect(series.body).toMatchObject({ count: 3, event: { todoCount: 2 } });
    expect((await app.db.admin<{ n: number }>("select count(*)::int as n from app.event_todos"))[0].n).toBe(6);
    expect((await read(await send({ title: "Exam week", allDay: true, firstDay: "2026-11-23", lastDay: "2026-11-27", todos: [{ title: "Pack" }] }))).status).toBe(201);
    expect((await read(await send({ ...EVENT, todos: [] }))).body).toMatchObject({ event: { todoCount: 0, todosDone: 0 } });
  });

  it("21 to-dos or a bad title: the ontology's message, no event and no to-do saved (R1)", async () => {
    await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const before = await app.snapshot();
    const many = Array.from({ length: 21 }, (_, i) => ({ title: `To-do ${i}` }));
    expect(await read(await send({ ...EVENT, todos: many }))).toEqual({
      status: 409,
      body: { error: "too_many_todos", message: "An event can have at most 20 to-dos" },
    });
    expect(await read(await send({ ...EVENT, todos: [{ title: "Fine" }, { title: "" }] }))).toEqual({
      status: 400,
      body: { error: "todo_title_length", message: "A to-do needs a title of 1 to 100 characters" },
    });
    expect((await read(await send({ ...EVENT, todos: [{ title: "x", extra: 1 }] }))).status).toBe(400);
    expect(await app.snapshot()).toEqual(before);
    expect((await read(await send({ ...EVENT, todos: Array.from({ length: 20 }, (_, i) => ({ title: `To-do ${i}` })) }))).status).toBe(201);
  });
});

describe("delete_event and the calendar's undo (R38)", () => {
  it("answers with the deleted event's to-dos; create_event with them brings the event back with its list", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const event = await seedEvent(app.db, alice, STUDY);
    await app.db.admin(
      "insert into app.event_todos (user_id, event_id, title, done, position) values ($1, $2, 'Read', true, 0), ($1, $2, 'Summarise', false, 1)",
      [alice, event.id],
    );
    const deleted = await read(await deleteEvent(postJson(`/api/events/${event.id}/delete`, { updatedAt: event.updatedAt }), app.deps, event.id));
    expect(deleted.body).toEqual({
      message: "Event deleted.",
      todos: [
        { title: "Read", done: true },
        { title: "Summarise", done: false },
      ],
    });
    expect(await app.db.admin("select * from app.event_todos")).toEqual([]);

    const back = await read(
      await createEvent(postJson("/api/events", { title: "Study", start: "2026-11-17T12:00", end: "2026-11-17T13:00", todos: deleted.body.todos }), app.deps),
    );
    expect(back.body).toMatchObject({ event: { todoCount: 2, todosDone: 1 } });
  });
});

describe("the calendar's two numbers", () => {
  it("every event of the week carries how many to-dos it has and how many are done, read with the events", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const study = await seedEvent(app.db, alice, STUDY);
    await seedEvent(app.db, alice, { ...STUDY, title: "Gym", start: "2026-11-17T17:00:00Z", end: "2026-11-17T18:00:00Z" });
    const exam = await seedAllDay(app.db, alice, { firstDay: "2026-11-16", lastDay: "2026-11-20" });
    await seedTodos(alice, study.id, 3);
    await seedTodos(alice, exam.id, 1);
    await app.db.admin("update app.event_todos set done = true where position = 0");

    const week = await loadWeek(app.deps, alice, "2026-11-16");
    const tuesday = week.days.find((d) => d.date === "2026-11-17")!;
    expect(tuesday.events.map((e) => [e.title, e.todoCount, e.todosDone])).toEqual([
      ["Study", 3, 1],
      ["Gym", 0, 0],
    ]);
    expect(tuesday.allDay.map((e) => [e.title, e.todoCount, e.todosDone])).toEqual([["Exam week", 1, 1]]);
  });
});
