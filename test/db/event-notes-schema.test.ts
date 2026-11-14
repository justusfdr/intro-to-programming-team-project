// Tests for supabase/migrations/20261202000000_event_notes.sql (issue #5, spec 27): the user writes the
// notes of their own app events (insert and update), 1 to 2,000 characters counted as characters, no
// whitespace at the end; another user's event is not reached (R3); an Outlook event takes none (R11);
// updated_at moves on (R4); the coach's undo of a deleted event brings its notes back, also from undo data
// written before this migration (then none).
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

const as = <T extends Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) =>
  db.withUser(user, (q) => q<T>(sql, params));

const TIMES = { start: "2026-12-01T12:30:00Z", end: "2026-12-01T13:30:00Z" };

const notesOf = async (id: string) => (await db.admin<{ notes: string | null }>("select notes from app.events where id = $1", [id]))[0]?.notes;

const insertWith = (notes: string | null) =>
  as<{ id: string; notes: string | null }>(
    alice,
    "insert into app.events (title, start_at, end_at, notes) values ('Lunch', $1, $2, $3) returning id, notes",
    [TIMES.start, TIMES.end, notes],
  );

describe("the notes column", () => {
  it("a new app event may be written with notes, or without (null)", async () => {
    expect((await insertWith("Bring the slides"))[0].notes).toBe("Bring the slides");
    expect((await insertWith(null))[0].notes).toBeNull();
  });

  it("counts characters, not bytes: 2,000 emoji are taken, 2,001 characters are refused", async () => {
    expect((await insertWith("😀".repeat(2000)))[0].notes).toHaveLength(4000); // 4,000 UTF-16 units, 2,000 characters
    expect((await insertWith("ü".repeat(2000)))[0].notes).toHaveLength(2000);
    for (const notes of ["x".repeat(2001), "😀".repeat(2001)]) await expect(insertWith(notes)).rejects.toThrow(/events_notes_length/);
  });

  it("refuses an empty note and whitespace at the end (the server trims it); lines inside are kept", async () => {
    for (const notes of ["", "Bring the slides ", "Line\n", "Tab\t", "   "]) await expect(insertWith(notes)).rejects.toThrow(/events_notes_length/);
    expect((await insertWith("  Indented\nsecond line"))[0].notes).toBe("  Indented\nsecond line");
  });

  it("the user changes and clears the notes of their own event; updated_at moves on (R4)", async () => {
    const { id, updatedAt } = await seedEvent(db, alice, TIMES);
    await as(alice, "update app.events set notes = 'Ask about the exam' where id = $1", [id]);
    expect(await notesOf(id)).toBe("Ask about the exam");
    const [after] = await db.admin<{ updated_at: Date }>("select updated_at from app.events where id = $1", [id]);
    expect(new Date(after.updated_at).getTime()).toBeGreaterThan(Date.parse(updatedAt));
    await as(alice, "update app.events set notes = null where id = $1", [id]);
    expect(await notesOf(id)).toBeNull();
  });

  it("another user's event is not reached (R3) and keeps its notes", async () => {
    const { id } = await seedEvent(db, bob, TIMES);
    await db.admin("update app.events set notes = 'Bob only' where id = $1", [id]);
    expect(await as(alice, "update app.events set notes = 'Hacked' where id = $1 returning id", [id])).toEqual([]);
    expect(await as(alice, "select notes from app.events where id = $1", [id])).toEqual([]);
    expect(await notesOf(id)).toBe("Bob only");
  });

  it("an Outlook event takes no notes: the user is refused by R11's trigger, and even the owner by the check", async () => {
    const [{ id }] = await db.admin<{ id: string }>(
      "insert into app.events (user_id, source, outlook_id, title, start_at, end_at) values ($1, 'outlook', 'AAMk-1', 'Team call', $2, $3) returning id",
      [alice, TIMES.start, TIMES.end],
    );
    await expect(as(alice, "update app.events set notes = 'Mine' where id = $1", [id])).rejects.toThrow(/Change this event in Outlook/);
    await expect(db.admin("update app.events set notes = 'Mine' where id = $1", [id])).rejects.toThrow(/events_notes_not_outlook/);
    expect(await notesOf(id)).toBeNull();
  });
});

describe("the coach's undo of a deleted event keeps its notes", () => {
  async function deleteDraft(event: { id: string; updatedAt: string }): Promise<string> {
    return db.withUser(alice, async (q) => {
      const [m] = await q<{ id: string }>("insert into app.chat_messages (role, text) values ('assistant', 'Free your afternoon') returning id");
      const [d] = await q<{ id: string }>(
        "insert into app.draft_plans (message_id, proposed_events, changes) values ($1::uuid, $2::text::jsonb, $3::text::jsonb) returning id",
        [m.id, "[]", JSON.stringify([{ kind: "delete", event_id: event.id, updated_at: event.updatedAt }])],
      );
      return d.id;
    });
  }

  const apply = (draftId: string) => db.withUser(alice, (q) => q("select id from app.chat_apply_draft_todos($1::uuid) as id", [draftId]));
  const undo = (draftId: string) => db.withUser(alice, (q) => q("select app.chat_undo_draft($1)", [draftId]));
  const events = () => db.admin<{ title: string; notes: string | null; travel_mode: string | null }>("select title, notes, travel_mode from app.events where user_id = $1", [alice]);

  async function lunchWith(notes: string | null) {
    const event = await seedEvent(db, alice, { title: "Lunch", ...TIMES });
    await db.admin("update app.events set notes = $2, travel_mode = 'walking' where id = $1", [event.id, notes]);
    const [row] = await db.admin<{ updated_at: Date }>("select updated_at from app.events where id = $1", [event.id]);
    return { id: event.id, updatedAt: new Date(row.updated_at).toISOString() };
  }

  it("keeps the notes in the undo data and brings the event back with them (and its travel mode)", async () => {
    const draftId = await deleteDraft(await lunchWith("Table for four"));
    await apply(draftId);
    expect(await events()).toEqual([]);
    const [{ undo: data }] = await db.admin<{ undo: { deleted: { notes: string | null }[] } }>("select undo from app.draft_plans where id = $1", [draftId]);
    expect(data.deleted[0].notes).toBe("Table for four");
    await undo(draftId);
    expect(await events()).toEqual([{ title: "Lunch", notes: "Table for four", travel_mode: "walking" }]);
  });

  it("restores undo data written before this migration (no notes in it) with none", async () => {
    const draftId = await deleteDraft(await lunchWith("Table for four"));
    await apply(draftId);
    await db.admin(
      `update app.draft_plans
          set undo = jsonb_set(undo, '{deleted}', (select jsonb_agg(x.value - 'notes') from jsonb_array_elements(undo -> 'deleted') x))
        where id = $1`,
      [draftId],
    );
    await undo(draftId);
    expect(await events()).toEqual([{ title: "Lunch", notes: null, travel_mode: "walking" }]);
  });

  it("an event without notes comes back without; a second undo is still refused and changes nothing", async () => {
    const draftId = await deleteDraft(await lunchWith(null));
    await apply(draftId);
    await undo(draftId);
    expect(await events()).toEqual([{ title: "Lunch", notes: null, travel_mode: "walking" }]);
    await expect(undo(draftId)).rejects.toThrow(/no longer be undone/);
    expect(await events()).toHaveLength(1);
  });
});
