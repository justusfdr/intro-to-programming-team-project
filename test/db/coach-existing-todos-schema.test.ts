// Tests for supabase/migrations/*_coach_existing_todos.sql (spec 23): a draft's to-dos for events that
// are already in the calendar. The user's role adds them only with the draft and never changes them;
// app.chat_apply_draft_todos writes them at the end of the event's list, only on the user's own events
// that are not from Outlook and have room, and keeps their ids for undo; the earlier functions refuse
// such a draft and otherwise work as before; app.chat_undo_draft removes exactly the to-dos the draft
// added. Each rule with an accepted and a refused case.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedEvent } from "@test/support/events";
import { createTestDb, type TestDb } from "./harness";

let db: TestDb;
let alice: string;
let bob: string;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.admin("delete from auth.users");
  alice = await db.createUser("alice@example.com", { confirmed: true });
  bob = await db.createUser("bob@example.com", { confirmed: true });
});

const STUDY = { title: "Study", start_at: "2026-12-01T08:00:00.000Z", end_at: "2026-12-01T10:00:00.000Z", goal_id: null };

/** An entry of added_todos as our server writes it. */
const addTo = (eventId: string, todos: unknown, title = "Lernblock") => ({
  event_id: eventId,
  title,
  all_day: false,
  start_at: "2026-12-01T14:00:00.000Z",
  end_at: "2026-12-01T16:00:00.000Z",
  first_day: null,
  last_day: null,
  todos,
});

/** An assistant message with a draft, written as the user (the way send_message saves it). */
async function draftAs(userId: string, events: unknown, changes: unknown = [], added: unknown = []): Promise<string> {
  return db.withUser(userId, async (q) => {
    // One open draft per user: the new one replaces it, as send_message does.
    await q("update app.draft_plans set status = 'replaced' where status = 'open'");
    const [m] = await q<{ id: string }>("insert into app.chat_messages (role, text) values ('assistant', 'Here is a plan') returning id");
    const [d] = await q<{ id: string }>(
      `insert into app.draft_plans (message_id, proposed_events, changes, added_todos)
       values ($1::uuid, $2::text::jsonb, $3::text::jsonb, $4::text::jsonb) returning id`,
      [m.id, JSON.stringify(events), JSON.stringify(changes), JSON.stringify(added)],
    );
    return d.id;
  });
}

const applyTodos = (userId: string, draftId: string) =>
  db.withUser(userId, (q) => q<{ id: string }>("select id from app.chat_apply_draft_todos($1::uuid) as id", [draftId]));
const applyOld = (userId: string, draftId: string) =>
  db.withUser(userId, (q) => q<{ id: string }>("select id from app.chat_apply_draft($1) as id", [draftId]));
const acceptOld = (userId: string, draftId: string) =>
  db.withUser(userId, (q) => q<{ id: string }>("select id from app.chat_accept_draft($1) as id", [draftId]));
const undo = (userId: string, draftId: string) => db.withUser(userId, (q) => q("select app.chat_undo_draft($1)", [draftId]));

const lernblock = (userId = alice) => seedEvent(db, userId, { title: "Lernblock", start: "2026-12-01T14:00:00Z", end: "2026-12-01T16:00:00Z" });

async function withTodos(userId: string, eventId: string, titles: string[]): Promise<void> {
  for (const [i, title] of titles.entries()) {
    await db.admin("insert into app.event_todos (user_id, event_id, title, position) values ($1, $2, $3, $4)", [userId, eventId, title, i]);
  }
}

const todosOf = (eventId: string) =>
  db.admin<{ title: string; done: boolean; position: number }>(
    "select title, done, position from app.event_todos where event_id = $1 order by position",
    [eventId],
  );

const draftOf = async (draftId: string) =>
  (await db.admin<{ status: string; undo: { todos?: string[] } | null; added_todos: unknown }>("select status, undo, added_todos from app.draft_plans where id = $1", [draftId]))[0];

describe("a draft's to-dos for existing events", () => {
  it("are an empty list by default (every draft the earlier code writes)", async () => {
    const draftId = await db.withUser(alice, async (q) => {
      const [m] = await q<{ id: string }>("insert into app.chat_messages (role, text) values ('assistant', 'x') returning id");
      const [d] = await q<{ id: string }>("insert into app.draft_plans (message_id, proposed_events) values ($1, $2::text::jsonb) returning id", [
        m.id,
        JSON.stringify([STUDY]),
      ]);
      return d.id;
    });
    expect((await draftOf(draftId)).added_todos).toEqual([]);
  });

  it("may make up a whole draft alone; 1 to 30 things in all, the new kind counted too", async () => {
    const event = await lernblock();
    await expect(draftAs(alice, [], [], [addTo(event.id, ["Do the investment exercises"])])).resolves.toBeTruthy();
    await expect(draftAs(alice, [], [], [])).rejects.toThrow(/draft_plans_events_list/);
    const thirty = Array.from({ length: 29 }, () => STUDY);
    await expect(draftAs(alice, thirty, [], [addTo(event.id, ["One"])])).resolves.toBeTruthy();
    await expect(draftAs(alice, [...thirty, STUDY], [], [addTo(event.id, ["One"])])).rejects.toThrow(/draft_plans_events_list/);
    await expect(draftAs(alice, [STUDY], [], { not: "a list" })).rejects.toThrow(/draft_plans_added_todos_list|draft_plans_events_list/);
  });

  it("the user's role adds them with the draft but never changes them; the database refuses any change", async () => {
    const event = await lernblock();
    const draftId = await draftAs(alice, [], [], [addTo(event.id, ["Watch the lecture"])]);
    await expect(db.withUser(alice, (q) => q(`update app.draft_plans set added_todos = '[]'::jsonb where id = '${draftId}'`))).rejects.toThrow(
      /permission denied/,
    );
    await expect(db.withUser(alice, (q) => q(`update app.draft_plans set undo = '{}'::jsonb where id = '${draftId}'`))).rejects.toThrow(
      /permission denied/,
    );
    await expect(db.admin("update app.draft_plans set added_todos = '[]'::jsonb where id = $1", [draftId])).rejects.toThrow(
      /do not change/,
    );
    expect((await draftOf(draftId)).added_todos).toEqual([addTo(event.id, ["Watch the lecture"])]);
  });

  it("gives visitors who are not signed in no right to the new function", async () => {
    const fn = "app.chat_apply_draft_todos(uuid)";
    const [row] = await db.admin<{ anon: boolean; user: boolean }>(
      `select has_function_privilege('anon', '${fn}', 'execute') as anon, has_function_privilege('authenticated', '${fn}', 'execute') as user`,
    );
    expect(row).toEqual({ anon: false, user: true });
  });
});

describe("app.chat_apply_draft_todos", () => {
  it("writes the to-dos at the end of the event's list, not done, in order, and keeps their ids for undo", async () => {
    const event = await lernblock();
    await withTodos(alice, event.id, ["Read the slides", "Make notes"]);
    const draftId = await draftAs(alice, [STUDY], [], [addTo(event.id, ["Do the investment exercises", "Watch the investment lecture"])]);

    const created = await applyTodos(alice, draftId);

    expect(created).toHaveLength(1);
    expect(await todosOf(event.id)).toEqual([
      { title: "Read the slides", done: false, position: 0 },
      { title: "Make notes", done: false, position: 1 },
      { title: "Do the investment exercises", done: false, position: 2 },
      { title: "Watch the investment lecture", done: false, position: 3 },
    ]);
    const draft = await draftOf(draftId);
    expect(draft.status).toBe("accepted");
    const ids = await db.admin<{ id: string }>("select id from app.event_todos where event_id = $1 and position >= 2 order by position", [event.id]);
    expect(draft.undo!.todos).toEqual(ids.map((r) => r.id));
    // The event itself is not changed (R40: to-dos do not move its updated_at).
    const [row] = await db.admin<{ updated_at: Date }>("select updated_at from app.events where id = $1", [event.id]);
    expect(new Date(row.updated_at).toISOString()).toBe(event.updatedAt);
  });

  it("works on an event of a series, an all-day event and one that has started; the event need not be unchanged", async () => {
    const [series] = await db.admin<{ id: string }>(
      `insert into app.events (user_id, title, start_at, end_at, series_id)
       values ($1, 'Lecture', '2026-12-02T09:00:00Z', '2026-12-02T10:00:00Z', gen_random_uuid()) returning id`,
      [alice],
    );
    const [allDay] = await db.admin<{ id: string }>(
      "insert into app.events (user_id, title, all_day, first_day, last_day) values ($1, 'Exam week', true, '2026-12-01', '2026-12-04') returning id",
      [alice],
    );
    const started = await seedEvent(db, alice, { title: "Started", start: "2020-01-01T09:00:00Z", end: "2020-01-01T10:00:00Z" });
    const event = await lernblock();
    const draftId = await draftAs(alice, [], [], [addTo(series.id, ["A"]), addTo(allDay.id, ["B"]), addTo(started.id, ["C"]), addTo(event.id, ["D"])]);
    // Changed after the draft was written.
    await db.admin("update app.events set title = 'Lernblock (moved)', start_at = start_at + interval '1 hour', end_at = end_at + interval '1 hour' where id = $1", [event.id]);

    await applyTodos(alice, draftId);

    for (const [id, title] of [[series.id, "A"], [allDay.id, "B"], [started.id, "C"], [event.id, "D"]]) {
      expect(await todosOf(id)).toEqual([{ title, done: false, position: 0 }]);
    }
  });

  it("an event the draft moves may get to-dos too; both happen", async () => {
    const event = await lernblock();
    const move = {
      kind: "move",
      event_id: event.id,
      updated_at: event.updatedAt,
      title: "Lernblock",
      goal_id: null,
      old_start_at: "2026-12-01T14:00:00.000Z",
      old_end_at: "2026-12-01T16:00:00.000Z",
      start_at: "2026-12-01T17:00:00.000Z",
      end_at: "2026-12-01T19:00:00.000Z",
    };
    const draftId = await draftAs(alice, [], [move], [addTo(event.id, ["Exercises"])]);
    await applyTodos(alice, draftId);
    const [row] = await db.admin<{ start_at: Date }>("select start_at from app.events where id = $1", [event.id]);
    expect(new Date(row.start_at).toISOString()).toBe("2026-12-01T17:00:00.000Z");
    expect(await todosOf(event.id)).toEqual([{ title: "Exercises", done: false, position: 0 }]);
  });

  it("refuses an Outlook event, another user's event, a missing one and one the same draft deletes; nothing is saved", async () => {
    const [outlook] = await db.admin<{ id: string }>(
      `insert into app.events (user_id, title, start_at, end_at, source, outlook_id)
       values ($1, 'Team call', '2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z', 'outlook', 'AAMk-1') returning id`,
      [alice],
    );
    const bobs = await lernblock(bob);
    const gone = await lernblock();
    await db.admin("delete from app.events where id = $1", [gone.id]);
    const deleted = await lernblock();
    const remove = {
      kind: "delete",
      event_id: deleted.id,
      updated_at: deleted.updatedAt,
      title: "Lernblock",
      goal_id: null,
      old_start_at: "2026-12-01T14:00:00.000Z",
      old_end_at: "2026-12-01T16:00:00.000Z",
      start_at: null,
      end_at: null,
    };
    for (const [target, changes] of [
      [outlook.id, []],
      [bobs.id, []],
      [gone.id, []],
      [deleted.id, [remove]],
    ] as const) {
      const draftId = await draftAs(alice, [STUDY], changes, [addTo(target, ["Exercises"])]);
      await expect(applyTodos(alice, draftId), target).rejects.toThrow(/This draft is out of date/);
      expect((await draftOf(draftId)).status).toBe("open");
    }
    expect(await db.admin("select id from app.events where user_id = $1 and source = 'assistant'", [alice])).toEqual([]);
    expect(await db.admin("select id from app.events where id = $1", [deleted.id])).toHaveLength(1);
    expect(await db.admin("select * from app.event_todos")).toEqual([]);
  });

  it("refuses when the list would get longer than 20: 18 + 2 is fine, 19 + 2 is not", async () => {
    const full = await lernblock();
    await withTodos(alice, full.id, Array.from({ length: 19 }, (_, i) => `Old ${i}`));
    const refused = await draftAs(alice, [], [], [addTo(full.id, ["One", "Two"])]);
    await expect(applyTodos(alice, refused)).rejects.toThrow(/This draft is out of date/);
    expect(await todosOf(full.id)).toHaveLength(19);

    const room = await lernblock();
    await withTodos(alice, room.id, Array.from({ length: 18 }, (_, i) => `Old ${i}`));
    const accepted = await draftAs(alice, [], [], [addTo(room.id, ["One", "Two"])]);
    await applyTodos(alice, accepted);
    expect(await todosOf(room.id)).toHaveLength(20);
  });

  it("refuses a malformed entry and the same event twice", async () => {
    const event = await lernblock();
    for (const entry of [
      { ...addTo(event.id, []) },
      { ...addTo(event.id, Array.from({ length: 21 }, (_, i) => `T${i}`)) },
      { ...addTo(event.id, [5]) },
      { ...addTo(event.id, "Read") },
      { title: "No event", todos: ["A"] },
      { ...addTo("not-a-uuid", ["A"]) },
      "just text",
    ]) {
      const draftId = await draftAs(alice, [STUDY], [], [entry]);
      await expect(applyTodos(alice, draftId), JSON.stringify(entry)).rejects.toThrow(/A to-do of the draft is malformed/);
    }
    const twice = await draftAs(alice, [], [], [addTo(event.id, ["A"]), addTo(event.id, ["B"])]);
    await expect(applyTodos(alice, twice)).rejects.toThrow(/at most once/);
    // A title the table does not take (spaces around it) fails there.
    const spaced = await draftAs(alice, [], [], [addTo(event.id, [" A "])]);
    await expect(applyTodos(alice, spaced)).rejects.toThrow(/event_todos_title_length/);
    expect(await todosOf(event.id)).toEqual([]);
  });

  it("works only on the user's own draft", async () => {
    const event = await lernblock();
    const draftId = await draftAs(alice, [], [], [addTo(event.id, ["A"])]);
    await expect(applyTodos(bob, draftId)).rejects.toThrow(/Not found/);
    expect((await draftOf(draftId)).status).toBe("open");
  });
});

describe("the earlier functions", () => {
  it("app.chat_apply_draft and app.chat_accept_draft refuse a draft with to-dos for existing events and change nothing", async () => {
    const event = await lernblock();
    const draftId = await draftAs(alice, [STUDY], [], [addTo(event.id, ["A"])]);
    await expect(applyOld(alice, draftId)).rejects.toThrow(/This draft is out of date/);
    await expect(acceptOld(alice, draftId)).rejects.toThrow(/This draft is out of date/);
    expect((await draftOf(draftId)).status).toBe("open");
    expect(await todosOf(event.id)).toEqual([]);
  });

  it("app.chat_apply_draft still applies every draft the earlier code writes, and undo still puts it back", async () => {
    const draftId = await draftAs(alice, [{ ...STUDY, todos: ["Read chapter 3"] }]);
    const [created] = await applyOld(alice, draftId);
    expect(await todosOf(created.id)).toEqual([{ title: "Read chapter 3", done: false, position: 0 }]);
    expect((await draftOf(draftId)).undo).toMatchObject({ todos: [] });
    await undo(alice, draftId);
    expect(await db.admin("select id from app.events")).toEqual([]);
    expect((await draftOf(draftId)).status).toBe("undone");
  });

  it("app.chat_accept_draft still accepts a plain draft of new events", async () => {
    const draftId = await draftAs(alice, [STUDY]);
    expect(await acceptOld(alice, draftId)).toHaveLength(1);
    expect((await draftOf(draftId)).status).toBe("accepted");
  });

  it("undo data written before this file (no to-dos key) is undone as before", async () => {
    const draftId = await draftAs(alice, [STUDY]);
    const [created] = await applyOld(alice, draftId);
    await db.admin("update app.draft_plans set undo = undo - 'todos' where id = $1", [draftId]);
    await undo(alice, draftId);
    expect(await db.admin("select id from app.events where id = $1", [created.id])).toEqual([]);
  });
});

describe("app.chat_undo_draft with to-dos for existing events", () => {
  it("removes exactly the to-dos the draft added, also ticked or renamed ones, and closes the gaps", async () => {
    const event = await lernblock();
    await withTodos(alice, event.id, ["Read the slides"]);
    const draftId = await draftAs(alice, [], [], [addTo(event.id, ["Exercises", "Lecture"])]);
    await applyTodos(alice, draftId);
    // Afterwards the person ticks one, renames the other and adds one more by hand.
    await db.admin("update app.event_todos set done = true where title = 'Exercises'");
    await db.admin("update app.event_todos set title = 'Watch the lecture' where title = 'Lecture'");
    await db.admin("insert into app.event_todos (user_id, event_id, title, position) values ($1, $2, 'By hand', 3)", [alice, event.id]);

    await undo(alice, draftId);

    expect(await todosOf(event.id)).toEqual([
      { title: "Read the slides", done: false, position: 0 },
      { title: "By hand", done: false, position: 1 },
    ]);
    expect((await draftOf(draftId)).status).toBe("undone");
    await expect(undo(alice, draftId)).rejects.toThrow(/This can no longer be undone/);
  });

  it("an event deleted since is no obstacle; the rest of the draft is undone", async () => {
    const event = await lernblock();
    const draftId = await draftAs(alice, [STUDY], [], [addTo(event.id, ["Exercises"])]);
    await applyTodos(alice, draftId);
    await db.admin("delete from app.events where id = $1", [event.id]);
    await undo(alice, draftId);
    expect(await db.admin("select id from app.events")).toEqual([]);
    expect((await draftOf(draftId)).status).toBe("undone");
  });

  it("still refuses when an event the draft created was changed since, and then removes no to-do", async () => {
    const event = await lernblock();
    const draftId = await draftAs(alice, [STUDY], [], [addTo(event.id, ["Exercises"])]);
    const [created] = await applyTodos(alice, draftId);
    await db.admin("update app.events set title = 'Changed' where id = $1", [created.id]);
    await expect(undo(alice, draftId)).rejects.toThrow(/This can no longer be undone/);
    expect(await todosOf(event.id)).toEqual([{ title: "Exercises", done: false, position: 0 }]);
  });

  it("never removes another user's to-do, even if its id were in the undo data", async () => {
    const event = await lernblock();
    const draftId = await draftAs(alice, [], [], [addTo(event.id, ["Exercises"])]);
    await applyTodos(alice, draftId);
    const bobsEvent = await lernblock(bob);
    await withTodos(bob, bobsEvent.id, ["Bob's"]);
    const [bobsTodo] = await db.admin<{ id: string }>("select id from app.event_todos where user_id = $1", [bob]);
    await db.admin("update app.draft_plans set undo = jsonb_set(undo, '{todos}', undo -> 'todos' || to_jsonb($2::text)) where id = $1", [
      draftId,
      bobsTodo.id,
    ]);
    await undo(alice, draftId);
    expect(await todosOf(bobsEvent.id)).toEqual([{ title: "Bob's", done: false, position: 0 }]);
    expect(await todosOf(event.id)).toEqual([]);
  });
});
