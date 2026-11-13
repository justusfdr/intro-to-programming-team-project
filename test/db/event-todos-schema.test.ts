// Tests for supabase/migrations/*_event_todos.sql (spec 21): to-dos belong to one event of the same
// user (R3) and go with it, which columns a user may write, the checks (title, place), at most 20 per
// event (also for a list written at once and for two requests at the same moment), never on an Outlook
// event (R11), and the coach: a draft's new events get their to-dos when it is applied, an event the
// coach deletes comes back with its to-dos on undo, the old accept function refuses a draft with to-dos.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedAllDay, seedEvent } from "@test/support/events";
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

const STUDY = { title: "Study", start: "2026-12-01T12:00:00Z", end: "2026-12-01T13:00:00Z" };

/** A to-do added as the user, the way add_todo writes it. */
function addAs(userId: string, eventId: string, title = "Read chapter 3", position = 0) {
  return db.withUser(userId, (q) =>
    q<{ id: string }>("insert into app.event_todos (event_id, title, position) values ($1, $2, $3) returning id", [eventId, title, position]),
  );
}

const todosOf = (eventId: string) =>
  db.admin<{ title: string; done: boolean; position: number }>(
    "select title, done, position from app.event_todos where event_id = $1 order by position",
    [eventId],
  );

async function seedTodos(userId: string, eventId: string, count: number) {
  await db.admin(
    "insert into app.event_todos (user_id, event_id, title, position) select $1, $2, 'To-do ' || n, n - 1 from generate_series(1, $3::int) n",
    [userId, eventId, count],
  );
}

async function seedOutlookEvent(userId: string) {
  const [row] = await db.admin<{ id: string }>(
    `insert into app.events (user_id, title, start_at, end_at, source, outlook_id)
     values ($1, 'Team call', '2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z', 'outlook', 'AAMk-1') returning id`,
    [userId],
  );
  return row.id;
}

describe("to-dos belong to one event of their user (R3)", () => {
  it("lets a user add a to-do to their own event; the database fills in the owner, done and created_at", async () => {
    const { id: eventId } = await seedEvent(db, alice, STUDY);
    const [{ id }] = await addAs(alice, eventId);
    const [row] = await db.admin("select user_id, event_id, title, done, position, created_at is not null as created from app.event_todos where id = $1", [id]);
    expect(row).toEqual({ user_id: alice, event_id: eventId, title: "Read chapter 3", done: false, position: 0, created: true });
  });

  it("refuses a to-do on another user's event, also with its id; nothing is saved", async () => {
    const { id: bobs } = await seedEvent(db, bob, STUDY);
    await expect(addAs(alice, bobs)).rejects.toThrow(/event_todos_event_of_same_user/);
    expect(await todosOf(bobs)).toEqual([]);
  });

  it("hides another user's to-dos: not returned, not changed, not deleted", async () => {
    const { id: bobs } = await seedEvent(db, bob, STUDY);
    await seedTodos(bob, bobs, 2);
    const before = await todosOf(bobs);
    expect(await db.withUser(alice, (q) => q("select * from app.event_todos"))).toEqual([]);
    expect(await db.withUser(alice, (q) => q("update app.event_todos set done = true returning id"))).toEqual([]);
    expect(await db.withUser(alice, (q) => q("delete from app.event_todos returning id"))).toEqual([]);
    expect(await todosOf(bobs)).toEqual(before);
  });

  it("deletes the to-dos with their event, and with the user", async () => {
    const one = await seedEvent(db, alice, STUDY);
    const two = await seedEvent(db, alice, { ...STUDY, title: "Gym" });
    await seedTodos(alice, one.id, 2);
    await seedTodos(alice, two.id, 2);
    await db.withUser(alice, (q) => q("delete from app.events where id = $1", [one.id]));
    expect(await todosOf(one.id)).toEqual([]);
    expect(await todosOf(two.id)).toHaveLength(2);
    await db.admin("delete from auth.users where id = $1", [alice]);
    expect(await db.admin("select * from app.event_todos")).toEqual([]);
  });

  it("allows to-dos on all-day events", async () => {
    const { id } = await seedAllDay(db, alice, { firstDay: "2026-12-01", lastDay: "2026-12-04" });
    await addAs(alice, id, "Pack");
    expect(await todosOf(id)).toEqual([{ title: "Pack", done: false, position: 0 }]);
  });

  it("does not change the event's updated_at (ticking a to-do is no change of the event, R4)", async () => {
    const event = await seedEvent(db, alice, STUDY);
    const [{ id }] = await addAs(alice, event.id);
    await db.withUser(alice, (q) => q("update app.event_todos set done = true, title = 'Read chapter 4' where id = $1", [id]));
    const [row] = await db.admin<{ updated_at: Date }>("select updated_at from app.events where id = $1", [event.id]);
    expect(new Date(row.updated_at).toISOString()).toBe(event.updatedAt);
  });
});

describe("only title, done and place are writable", () => {
  it("accepts a change of title, done and place", async () => {
    const { id: eventId } = await seedEvent(db, alice, STUDY);
    const [{ id }] = await addAs(alice, eventId);
    await db.withUser(alice, (q) => q("update app.event_todos set title = 'Exercises', done = true, position = 4 where id = $1", [id]));
    expect(await todosOf(eventId)).toEqual([{ title: "Exercises", done: true, position: 4 }]);
  });

  it("refuses the columns the database owns, and moving a to-do to another event; nothing changes", async () => {
    const { id: eventId } = await seedEvent(db, alice, STUDY);
    const other = await seedEvent(db, alice, { ...STUDY, title: "Gym" });
    const [{ id }] = await addAs(alice, eventId);
    const before = await todosOf(eventId);
    for (const sql of [
      `insert into app.event_todos (id, event_id, title, position) values (gen_random_uuid(), '${eventId}', 'x', 1)`,
      `insert into app.event_todos (user_id, event_id, title, position) values ('${alice}', '${eventId}', 'x', 1)`,
      `insert into app.event_todos (event_id, title, position, created_at) values ('${eventId}', 'x', 1, now())`,
      `update app.event_todos set event_id = '${other.id}' where id = '${id}'`,
      `update app.event_todos set user_id = '${bob}' where id = '${id}'`,
      `update app.event_todos set created_at = now() where id = '${id}'`,
    ]) {
      await expect(db.withUser(alice, (q) => q(sql)), sql).rejects.toThrow(/permission denied/);
    }
    expect(await todosOf(eventId)).toEqual(before);
  });
});

describe("the checks", () => {
  it("a title of 1 to 100 characters without spaces around it", async () => {
    const { id: eventId } = await seedEvent(db, alice, STUDY);
    await addAs(alice, eventId, "x".repeat(100), 0);
    await addAs(alice, eventId, "y", 1);
    for (const title of ["", "x".repeat(101), " padded", "padded "]) {
      await expect(addAs(alice, eventId, title, 2), JSON.stringify(title)).rejects.toThrow(/event_todos_title_length/);
    }
    expect(await todosOf(eventId)).toHaveLength(2);
  });

  it("one to-do per place, never below 0; two places can be swapped in one statement", async () => {
    const { id: eventId } = await seedEvent(db, alice, STUDY);
    await addAs(alice, eventId, "First", 0);
    await addAs(alice, eventId, "Second", 1);
    await expect(addAs(alice, eventId, "Again", 1)).rejects.toThrow(/event_todos_one_per_position/);
    await expect(addAs(alice, eventId, "Below", -1)).rejects.toThrow(/event_todos_position/);
    await db.withUser(alice, (q) =>
      q("update app.event_todos set position = case position when 0 then 1 else 0 end where event_id = $1", [eventId]),
    );
    expect((await todosOf(eventId)).map((t) => t.title)).toEqual(["Second", "First"]);
  });
});

describe("at most 20 to-dos per event", () => {
  it("accepts the 20th and refuses the 21st with the ontology's words; other events are not counted", async () => {
    const { id: eventId } = await seedEvent(db, alice, STUDY);
    const other = await seedEvent(db, alice, { ...STUDY, title: "Gym" });
    await seedTodos(alice, other.id, 20);
    await seedTodos(alice, eventId, 19);
    await addAs(alice, eventId, "Twentieth", 19);
    await expect(addAs(alice, eventId, "Too many", 20)).rejects.toThrow(/An event can have at most 20 to-dos/);
    expect(await todosOf(eventId)).toHaveLength(20);
  });

  it("counts the rows of one statement: 21 at once are refused, nothing saved", async () => {
    const { id: eventId } = await seedEvent(db, alice, STUDY);
    const insert = (count: number) =>
      db.withUser(alice, (q) =>
        q("insert into app.event_todos (event_id, title, position) select $1, 'To-do ' || n, n - 1 from generate_series(1, $2::int) n", [
          eventId,
          count,
        ]),
      );
    await expect(insert(21)).rejects.toThrow(/at most 20 to-dos/);
    expect(await todosOf(eventId)).toEqual([]);
    await insert(20);
    expect(await todosOf(eventId)).toHaveLength(20);
  });

  it("takes a lock per event before counting, and two additions at the same moment at 19: exactly one is saved", async () => {
    const { id: eventId } = await seedEvent(db, alice, STUDY);
    const locks = await db.withUser(alice, async (q) => {
      await q("insert into app.event_todos (event_id, title, position) values ($1, 'Locked', 0)", [eventId]);
      return q<{ n: number }>("select count(*)::int as n from pg_locks where locktype = 'advisory' and granted");
    });
    expect(locks[0].n).toBeGreaterThanOrEqual(1);
    await db.admin("delete from app.event_todos");
    await seedTodos(alice, eventId, 19);
    const results = await Promise.allSettled([addAs(alice, eventId, "First", 19), addAs(alice, eventId, "Second", 20)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await todosOf(eventId)).toHaveLength(20);
  });
});

describe("never on an Outlook event (R11)", () => {
  it("refuses a to-do on an Outlook event, also through the coach's functions; an app event takes one", async () => {
    const outlook = await seedOutlookEvent(alice);
    await expect(addAs(alice, outlook)).rejects.toThrow(/To-dos cannot be added to Outlook events/);
    expect(await todosOf(outlook)).toEqual([]);
    const { id } = await seedEvent(db, alice, STUDY);
    await addAs(alice, id);
    expect(await todosOf(id)).toHaveLength(1);
  });
});

// ---------- The coach ----------

type Stored = { title: string; start_at: string; end_at: string; goal_id: null; todos?: unknown };
const proposal = (todos?: unknown, title = "Study"): Stored => ({
  title,
  start_at: "2026-12-01T12:00:00Z",
  end_at: "2026-12-01T13:00:00Z",
  goal_id: null,
  ...(todos === undefined ? {} : { todos }),
});

/** An assistant message with a draft, written as the user (the way send_message saves it). */
async function draftAs(userId: string, events: unknown, changes: unknown = []): Promise<string> {
  return db.withUser(userId, async (q) => {
    const [m] = await q<{ id: string }>("insert into app.chat_messages (role, text) values ('assistant', 'Here is a plan') returning id");
    const [d] = await q<{ id: string }>(
      "insert into app.draft_plans (message_id, proposed_events, changes) values ($1, $2::text::jsonb, $3::text::jsonb) returning id",
      [m.id, JSON.stringify(events), JSON.stringify(changes)],
    );
    return d.id;
  });
}

const apply = (userId: string, draftId: string) =>
  db.withUser(userId, (q) => q<{ id: string }>("select id from app.chat_apply_draft($1) as id", [draftId]));
const undo = (userId: string, draftId: string) => db.withUser(userId, (q) => q("select app.chat_undo_draft($1)", [draftId]));
const statusOf = async (draftId: string) => (await db.admin<{ status: string }>("select status from app.draft_plans where id = $1", [draftId]))[0].status;
const allTodos = () =>
  db.admin<{ event: string; title: string; done: boolean; position: number }>(
    "select e.title as event, t.title, t.done, t.position from app.event_todos t join app.events e on e.id = t.event_id order by e.title, t.position",
  );

describe("applying a draft creates its events with their to-dos", () => {
  it("each new event gets its to-dos in order, open; an event without to-dos gets none", async () => {
    const draftId = await draftAs(alice, [proposal(["Read chapter 3", "Exercises 1-4"]), proposal(undefined, "Call")]);
    const created = await apply(alice, draftId);
    expect(created).toHaveLength(2);
    expect(await allTodos()).toEqual([
      { event: "Study", title: "Read chapter 3", done: false, position: 0 },
      { event: "Study", title: "Exercises 1-4", done: false, position: 1 },
    ]);
    expect(await statusOf(draftId)).toBe("accepted");
  });

  it("a to-do that is not a text, a list that is not a list, a bad title or 21 to-dos: nothing is created, the draft stays open", async () => {
    for (const todos of [[5], "Read", ["x".repeat(101)], [""], Array.from({ length: 21 }, (_, i) => `To-do ${i}`)]) {
      await db.admin("delete from app.chat_messages");
      const draftId = await draftAs(alice, [proposal(["Fine"], "Call"), proposal(todos)]);
      await expect(apply(alice, draftId), JSON.stringify(todos)).rejects.toThrow(/A to-do of the draft is malformed|event_todos_title_length|at most 20 to-dos/);
      expect(await statusOf(draftId)).toBe("open");
      expect(await db.admin("select * from app.events")).toEqual([]);
      expect(await allTodos()).toEqual([]);
    }
  });

  it("undo deletes the created events with their to-dos, even ticked ones", async () => {
    const draftId = await draftAs(alice, [proposal(["Read chapter 3"])]);
    await apply(alice, draftId);
    await db.withUser(alice, (q) => q("update app.event_todos set done = true"));
    await undo(alice, draftId);
    expect(await db.admin("select * from app.events")).toEqual([]);
    expect(await allTodos()).toEqual([]);
    expect(await statusOf(draftId)).toBe("undone");
  });

  it("an event the draft deletes comes back on undo with its to-dos, done ones done again, in order", async () => {
    const gym = await seedEvent(db, alice, { title: "Gym", start: "2026-12-01T17:00:00Z", end: "2026-12-01T18:00:00Z" });
    await db.admin(
      "insert into app.event_todos (user_id, event_id, title, done, position) values ($1, $2, 'Warm up', true, 0), ($1, $2, 'Squats', false, 1)",
      [alice, gym.id],
    );
    const remove = {
      kind: "delete",
      event_id: gym.id,
      updated_at: gym.updatedAt,
      title: "Gym",
      goal_id: null,
      old_start_at: "2026-12-01T17:00:00Z",
      old_end_at: "2026-12-01T18:00:00Z",
      start_at: null,
      end_at: null,
    };
    const draftId = await draftAs(alice, [], [remove]);
    await apply(alice, draftId);
    expect(await allTodos()).toEqual([]);
    const [{ undo: data }] = await db.admin<{ undo: { deleted: { todos: unknown }[] } }>("select undo from app.draft_plans where id = $1", [draftId]);
    expect(data.deleted[0].todos).toEqual([
      { title: "Warm up", done: true },
      { title: "Squats", done: false },
    ]);
    await undo(alice, draftId);
    expect(await allTodos()).toEqual([
      { event: "Gym", title: "Warm up", done: true, position: 0 },
      { event: "Gym", title: "Squats", done: false, position: 1 },
    ]);
  });

  it("undo data written before this file (no to-dos) still undoes: the event comes back without to-dos", async () => {
    const draftId = await draftAs(alice, [proposal()]);
    await db.admin(
      `update app.draft_plans set status = 'accepted', undo = jsonb_build_object('created', '[]'::jsonb, 'moved', '[]'::jsonb,
         'deleted', jsonb_build_array(jsonb_build_object('title', 'Gym', 'start_at', '2026-12-02T17:00:00Z', 'end_at', '2026-12-02T18:00:00Z',
           'may_overlap', false, 'status', 'planned', 'goal_id', null, 'source', 'app', 'location', null, 'demo', false)))
       where id = $1`,
      [draftId],
    );
    await undo(alice, draftId);
    expect((await db.admin<{ title: string }>("select title from app.events")).map((e) => e.title)).toEqual(["Gym"]);
    expect(await allTodos()).toEqual([]);
  });

  it("another user's draft is 'Not found'; a user cannot forge to-dos onto someone else's event", async () => {
    const draftId = await draftAs(alice, [proposal(["Read"])]);
    await expect(apply(bob, draftId)).rejects.toThrow(/Not found/);
    expect(await statusOf(draftId)).toBe("open");
    expect(await allTodos()).toEqual([]);
  });
});

describe("the old accept function (spec 19)", () => {
  it("refuses a draft whose new events carry to-dos (it would drop them); nothing changes", async () => {
    const draftId = await draftAs(alice, [proposal(["Read chapter 3"])]);
    await expect(db.withUser(alice, (q) => q("select app.chat_accept_draft($1)", [draftId]))).rejects.toThrow(/out of date/);
    expect(await statusOf(draftId)).toBe("open");
    expect(await db.admin("select * from app.events")).toEqual([]);
  });

  it("still accepts every draft the old code writes: without to-dos, or with an empty list", async () => {
    const draftId = await draftAs(alice, [proposal(), proposal([], "Call")]);
    const created = await db.withUser(alice, (q) => q("select app.chat_accept_draft($1) as id", [draftId]));
    expect(created).toHaveLength(2);
    expect(await statusOf(draftId)).toBe("accepted");
  });
});
