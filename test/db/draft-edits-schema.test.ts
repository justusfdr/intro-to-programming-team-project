// Tests for supabase/migrations/*_draft_edits.sql (spec 22): a draft's version, that the user's role
// still cannot write a draft's content itself, and app.chat_edit_draft: only the user's own open draft,
// only with the version last seen (R4), only the times of one new event or one move, within the
// draft's own limits; everything else of the draft stays. Each rule with an accepted and a refused case.
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

const NEW = [
  { title: "Study", start_at: "2026-12-01T08:00:00.000Z", end_at: "2026-12-01T10:00:00.000Z", goal_id: null, todos: ["Read chapter 3"] },
  { title: "Run", start_at: "2026-12-01T18:00:00.000Z", end_at: "2026-12-01T19:00:00.000Z", goal_id: null },
];

type Event = { id: string; updatedAt: string };

const move = (event: Event) => ({
  kind: "move",
  event_id: event.id,
  updated_at: event.updatedAt,
  title: "Lecture",
  goal_id: null,
  old_start_at: "2026-12-01T14:00:00.000Z",
  old_end_at: "2026-12-01T15:00:00.000Z",
  start_at: "2026-12-01T16:00:00.000Z",
  end_at: "2026-12-01T17:00:00.000Z",
});

const remove = (event: Event) => ({ ...move(event), kind: "delete", start_at: null, end_at: null });

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

type Edit = { version?: number; index?: number | null; eventId?: string | null; start: string; end: string };

const edit = (userId: string, draftId: string, e: Edit) =>
  db.withUser(userId, async (q) => {
    const [row] = await q<{ version: number }>("select app.chat_edit_draft($1, $2, $3, $4, $5::timestamptz, $6::timestamptz) as version", [
      draftId,
      e.version ?? 0,
      e.index ?? null,
      e.eventId ?? null,
      e.start,
      e.end,
    ]);
    return row.version;
  });

const draftOf = async (draftId: string) =>
  (
    await db.admin<{ version: number; status: string; proposed_events: unknown; changes: unknown }>(
      "select version, status, proposed_events, changes from app.draft_plans where id = $1",
      [draftId],
    )
  )[0];

describe("a draft's version", () => {
  it("is 0 for a draft as the assistant wrote it", async () => {
    const draftId = await draftAs(alice, NEW);
    expect((await draftOf(draftId)).version).toBe(0);
  });

  it("the user's role still cannot write a draft's events, changes or version itself", async () => {
    const draftId = await draftAs(alice, NEW);
    for (const sql of [
      `update app.draft_plans set proposed_events = '[]'::jsonb where id = '${draftId}'`,
      `update app.draft_plans set changes = '[]'::jsonb where id = '${draftId}'`,
      `update app.draft_plans set version = 1 where id = '${draftId}'`,
      `insert into app.draft_plans (message_id, proposed_events, version) select message_id, proposed_events, 5 from app.draft_plans`,
    ]) {
      await expect(db.withUser(alice, (q) => q(sql)), sql).rejects.toThrow(/permission denied/);
    }
    expect(await draftOf(draftId)).toMatchObject({ version: 0, proposed_events: NEW });
  });

  it("the content of a draft that is not open never changes, and the version moves on by exactly one", async () => {
    const draftId = await draftAs(alice, NEW);
    await expect(db.admin("update app.draft_plans set version = 3 where id = $1", [draftId])).rejects.toThrow(/version on by one/);
    await db.admin("update app.draft_plans set version = 1 where id = $1", [draftId]);
    await db.admin("update app.draft_plans set status = 'rejected' where id = $1", [draftId]);
    await expect(db.admin("update app.draft_plans set proposed_events = '[]'::jsonb, version = 2 where id = $1", [draftId])).rejects.toThrow(
      /no longer open/,
    );
  });

  it("gives visitors who are not signed in no right to the new function", async () => {
    const fn = "app.chat_edit_draft(uuid, integer, integer, uuid, timestamptz, timestamptz)";
    const [row] = await db.admin<{ anon: boolean; user: boolean }>(
      `select has_function_privilege('anon', '${fn}', 'execute') as anon, has_function_privilege('authenticated', '${fn}', 'execute') as user`,
    );
    expect(row).toEqual({ anon: false, user: true });
  });
});

describe("app.chat_edit_draft on a new event", () => {
  it("sets the new times of that one event, keeps everything else and moves the version on", async () => {
    const draftId = await draftAs(alice, NEW);

    expect(await edit(alice, draftId, { index: 0, start: "2026-12-01T09:00:00Z", end: "2026-12-01T11:30:00Z" })).toBe(1);

    const draft = await draftOf(draftId);
    expect(draft.version).toBe(1);
    expect(draft.status).toBe("open");
    expect(draft.proposed_events).toEqual([
      { title: "Study", start_at: "2026-12-01T09:00:00.000Z", end_at: "2026-12-01T11:30:00.000Z", goal_id: null, todos: ["Read chapter 3"] },
      NEW[1],
    ]);
    // The next change carries the new version.
    expect(await edit(alice, draftId, { version: 1, index: 1, start: "2026-12-01T19:00:00Z", end: "2026-12-01T20:00:00Z" })).toBe(2);
  });

  it("refuses an older version (another device changed the draft first) and changes nothing", async () => {
    const draftId = await draftAs(alice, NEW);
    await edit(alice, draftId, { index: 0, start: "2026-12-01T09:00:00Z", end: "2026-12-01T10:00:00Z" });
    await expect(edit(alice, draftId, { version: 0, index: 1, start: "2026-12-01T19:00:00Z", end: "2026-12-01T20:00:00Z" })).rejects.toThrow(
      /draft_plans_stale|Changed on another device/,
    );
    expect((await draftOf(draftId)).version).toBe(1);
  });

  it("keeps the draft's limits: 15 minutes to 8 hours, end after start", async () => {
    const draftId = await draftAs(alice, NEW);
    for (const [start, end] of [
      ["2026-12-01T09:00:00Z", "2026-12-01T09:10:00Z"],
      ["2026-12-01T09:00:00Z", "2026-12-01T17:15:00Z"],
      ["2026-12-01T09:00:00Z", "2026-12-01T09:00:00Z"],
    ]) {
      await expect(edit(alice, draftId, { index: 0, start, end }), `${start} ${end}`).rejects.toThrow(/15 minutes to 8 hours|End must be after start/);
    }
    expect(await edit(alice, draftId, { index: 0, start: "2026-12-01T09:00:00Z", end: "2026-12-01T17:00:00Z" })).toBe(1);
    expect(await draftOf(draftId)).toMatchObject({ version: 1 });
  });

  it("refuses a place that is not in the list, or both or neither of the two ways to name a block", async () => {
    const lecture = await seedEvent(db, alice, { start: "2026-12-01T14:00:00Z", end: "2026-12-01T15:00:00Z" });
    const draftId = await draftAs(alice, NEW, [move(lecture)]);
    for (const index of [-1, 2]) {
      await expect(edit(alice, draftId, { index, start: "2026-12-01T09:00:00Z", end: "2026-12-01T10:00:00Z" })).rejects.toThrow(/Not found/);
    }
    await expect(edit(alice, draftId, { index: 0, eventId: lecture.id, start: "2026-12-01T09:00:00Z", end: "2026-12-01T10:00:00Z" })).rejects.toThrow(
      /either a new event or a move/,
    );
    await expect(edit(alice, draftId, { start: "2026-12-01T09:00:00Z", end: "2026-12-01T10:00:00Z" })).rejects.toThrow(/either a new event or a move/);
    expect((await draftOf(draftId)).version).toBe(0);
  });
});

describe("app.chat_edit_draft on a move", () => {
  it("sets the move's new times; the event, the version it saw and its old times stay", async () => {
    const lecture = await seedEvent(db, alice, { start: "2026-12-01T14:00:00Z", end: "2026-12-01T15:00:00Z" });
    const draftId = await draftAs(alice, NEW, [move(lecture)]);

    expect(await edit(alice, draftId, { eventId: lecture.id, start: "2026-12-01T20:00:00Z", end: "2026-12-01T21:15:00Z" })).toBe(1);

    expect((await draftOf(draftId)).changes).toEqual([{ ...move(lecture), start_at: "2026-12-01T20:00:00.000Z", end_at: "2026-12-01T21:15:00.000Z" }]);
  });

  it("refuses a delete (it has no new time), an event the draft does not move, and more than 24 hours", async () => {
    const lecture = await seedEvent(db, alice, { start: "2026-12-01T14:00:00Z", end: "2026-12-01T15:00:00Z" });
    const gym = await seedEvent(db, alice, { start: "2026-12-01T17:00:00Z", end: "2026-12-01T18:00:00Z" });
    const other = await seedEvent(db, alice, { start: "2026-12-02T17:00:00Z", end: "2026-12-02T18:00:00Z" });
    const draftId = await draftAs(alice, [], [move(lecture), remove(gym)]);
    for (const eventId of [gym.id, other.id]) {
      await expect(edit(alice, draftId, { eventId, start: "2026-12-01T09:00:00Z", end: "2026-12-01T10:00:00Z" })).rejects.toThrow(/Not found/);
    }
    await expect(edit(alice, draftId, { eventId: lecture.id, start: "2026-12-01T09:00:00Z", end: "2026-12-02T09:15:00Z" })).rejects.toThrow(
      /at most 24 hours/,
    );
    expect(await edit(alice, draftId, { eventId: lecture.id, start: "2026-12-01T09:00:00Z", end: "2026-12-02T09:00:00Z" })).toBe(1);
  });
});

describe("whose draft, and which status", () => {
  it("another user's draft is Not found and stays as it was", async () => {
    const draftId = await draftAs(alice, NEW);
    await expect(edit(bob, draftId, { index: 0, start: "2026-12-01T09:00:00Z", end: "2026-12-01T10:00:00Z" })).rejects.toThrow(/Not found/);
    expect(await draftOf(draftId)).toMatchObject({ version: 0, proposed_events: NEW });
  });

  it("only an open draft: accepted, rejected or replaced drafts keep their content", async () => {
    for (const status of ["accepted", "rejected", "replaced"]) {
      await db.admin("delete from app.chat_messages");
      const draftId = await draftAs(alice, NEW);
      if (status === "accepted") await db.withUser(alice, (q) => q("select app.chat_apply_draft($1)", [draftId]));
      else await db.admin("update app.draft_plans set status = $2 where id = $1", [draftId, status]);
      await expect(edit(alice, draftId, { index: 0, start: "2026-12-01T09:00:00Z", end: "2026-12-01T10:00:00Z" }), status).rejects.toThrow(
        /no longer open/,
      );
      expect(await draftOf(draftId), status).toMatchObject({ version: 0, proposed_events: NEW });
    }
  });

  it("an edited draft is applied as the person left it", async () => {
    const draftId = await draftAs(alice, NEW);
    await edit(alice, draftId, { index: 1, start: "2026-12-01T20:00:00Z", end: "2026-12-01T21:00:00Z" });
    await db.withUser(alice, (q) => q("select app.chat_apply_draft($1)", [draftId]));
    const rows = await db.admin<{ title: string; start_at: Date }>("select title, start_at from app.events where user_id = $1 order by start_at", [alice]);
    expect(rows.map((r) => [r.title, new Date(r.start_at).toISOString()])).toEqual([
      ["Study", "2026-12-01T08:00:00.000Z"],
      ["Run", "2026-12-01T20:00:00.000Z"],
    ]);
  });
});
