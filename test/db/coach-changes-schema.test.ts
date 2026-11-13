// Tests for supabase/migrations/*_coach_changes.sql (spec 20): a draft's changes and what the user's
// role may write of them, the loosened limits (a draft of changes only; the status "undone"),
// app.chat_apply_draft (moves and deletes of the user's own events, checked again by the database, and
// the undo data it takes from the rows), app.chat_undo_draft (only while nothing changed since, only
// once), the old accept function refusing a draft with changes, and that nobody can forge undo data.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedAllDay, seedEvent } from "@test/support/events";
import { seedGoal } from "@test/support/goals";
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

const NEW = [{ title: "Study", start_at: "2026-12-01T08:00:00Z", end_at: "2026-12-01T10:00:00Z", goal_id: null }];

type Event = { id: string; updatedAt: string };

const move = (event: Event, start: string, end: string, more: Record<string, unknown> = {}) => ({
  kind: "move",
  event_id: event.id,
  updated_at: event.updatedAt,
  title: "Statistics revision",
  goal_id: null,
  old_start_at: "2026-12-01T14:00:00Z",
  old_end_at: "2026-12-01T15:00:00Z",
  start_at: start,
  end_at: end,
  ...more,
});

const remove = (event: Event, more: Record<string, unknown> = {}) => ({
  kind: "delete",
  event_id: event.id,
  updated_at: event.updatedAt,
  title: "Gym",
  goal_id: null,
  old_start_at: "2026-12-01T17:00:00Z",
  old_end_at: "2026-12-01T18:00:00Z",
  start_at: null,
  end_at: null,
  ...more,
});

/** An assistant message with a draft, written as the user (the way send_message saves it). */
async function draftAs(userId: string, events: unknown, changes: unknown): Promise<string> {
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

const eventsOf = (userId: string) =>
  db.admin<{ title: string; start_at: string; end_at: string; status: string; source: string; goal_id: string | null }>(
    `select title, to_char(start_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI') as start_at,
            to_char(end_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI') as end_at, status, source, goal_id
       from app.events where user_id = $1 order by start_at, title`,
    [userId],
  );
const statusOf = async (draftId: string) => (await db.admin<{ status: string }>("select status from app.draft_plans where id = $1", [draftId]))[0].status;

describe("a draft's changes", () => {
  it("a user may save a draft of changes only (no new events); still 1 to 30 things in all", async () => {
    const lecture = await seedEvent(db, alice, { start: "2026-12-01T14:00:00Z", end: "2026-12-01T15:00:00Z" });
    await draftAs(alice, [], [remove(lecture)]);
    await db.admin("update app.draft_plans set status = 'replaced'");
    // Nothing at all, or 31 together, is still refused.
    await expect(draftAs(alice, [], [])).rejects.toThrow(/draft_plans_events_list/);
    const many = Array.from({ length: 30 }, () => NEW[0]);
    await expect(draftAs(alice, many, [remove(lecture)])).rejects.toThrow(/draft_plans_events_list/);
    await draftAs(alice, many, []);
    await expect(draftAs(alice, NEW, { kind: "delete" })).rejects.toThrow(/draft_plans_events_list/);
  });

  it("a user can never change a draft's changes or write its undo data", async () => {
    const lecture = await seedEvent(db, alice, { start: "2026-12-01T14:00:00Z", end: "2026-12-01T15:00:00Z" });
    const draftId = await draftAs(alice, NEW, [remove(lecture)]);
    for (const sql of [
      `update app.draft_plans set changes = '[]'::jsonb where id = '${draftId}'`,
      `update app.draft_plans set undo = '{}'::jsonb where id = '${draftId}'`,
      `insert into app.draft_plans (message_id, proposed_events, undo) select message_id, proposed_events, '{}'::jsonb from app.draft_plans`,
    ]) {
      await expect(db.withUser(alice, (q) => q(sql)), sql).rejects.toThrow(/permission denied/);
    }
  });

  it("only the server's undo path reaches 'undone': never a user's own update, never from open", async () => {
    const draftId = await draftAs(alice, NEW, []);
    await expect(db.withUser(alice, (q) => q("update app.draft_plans set status = 'undone' where id = $1", [draftId]))).rejects.toThrow(
      /Only an accepted draft/,
    );
    await apply(alice, draftId);
    await expect(db.withUser(alice, (q) => q("update app.draft_plans set status = 'undone' where id = $1", [draftId]))).rejects.toThrow(
      /Only undo_draft/,
    );
    expect(await statusOf(draftId)).toBe("accepted");
  });

  it("gives visitors who are not signed in no right to the new functions", async () => {
    for (const fn of ["app.chat_apply_draft(uuid)", "app.chat_undo_draft(uuid)"]) {
      const [row] = await db.admin<{ anon: boolean; user: boolean }>(
        `select has_function_privilege('anon', '${fn}', 'execute') as anon, has_function_privilege('authenticated', '${fn}', 'execute') as user`,
      );
      expect(row, fn).toEqual({ anon: false, user: true });
    }
  });
});

describe("app.chat_apply_draft", () => {
  it("moves, deletes and creates in one step and remembers how to undo it", async () => {
    const lecture = await seedEvent(db, alice, { title: "Statistics revision", start: "2026-12-01T14:00:00Z", end: "2026-12-01T15:00:00Z" });
    const gym = await seedEvent(db, alice, { title: "Gym", start: "2026-12-01T17:00:00Z", end: "2026-12-01T18:00:00Z", status: "done" });
    const draftId = await draftAs(alice, NEW, [move(lecture, "2026-12-01T16:00:00Z", "2026-12-01T17:30:00Z"), remove(gym)]);

    const created = await apply(alice, draftId);

    expect(created).toHaveLength(1);
    expect(await eventsOf(alice)).toEqual([
      { title: "Study", start_at: "2026-12-01T08:00", end_at: "2026-12-01T10:00", status: "planned", source: "assistant", goal_id: null },
      { title: "Statistics revision", start_at: "2026-12-01T16:00", end_at: "2026-12-01T17:30", status: "planned", source: "app", goal_id: null },
    ]);
    const [draft] = await db.admin<{ status: string; undo: { created: unknown[]; moved: { id: string; old_start_at: string }[]; deleted: { title: string; status: string }[] } }>(
      "select status, undo from app.draft_plans where id = $1",
      [draftId],
    );
    expect(draft.status).toBe("accepted");
    expect(draft.undo.created).toHaveLength(1);
    expect(draft.undo.moved.map((m) => [m.id, new Date(m.old_start_at).toISOString()])).toEqual([[lecture.id, "2026-12-01T14:00:00.000Z"]]);
    expect(draft.undo.deleted).toMatchObject([{ title: "Gym", status: "done", source: "app" }]);
  });

  it("refuses an event changed since the draft saw it (R4); nothing changes, the draft stays open", async () => {
    const lecture = await seedEvent(db, alice, { start: "2026-12-01T14:00:00Z", end: "2026-12-01T15:00:00Z" });
    const draftId = await draftAs(alice, NEW, [move(lecture, "2026-12-01T16:00:00Z", "2026-12-01T17:00:00Z")]);
    await db.admin("update app.events set title = 'Changed elsewhere' where id = $1", [lecture.id]);
    const before = await eventsOf(alice);
    await expect(apply(alice, draftId)).rejects.toThrow(/out of date/);
    expect(await eventsOf(alice)).toEqual(before);
    expect(await statusOf(draftId)).toBe("open");
  });

  it("refuses another user's event, an Outlook event, an all-day event, an event of a series and the same event twice", async () => {
    const bobs = await seedEvent(db, bob, { start: "2026-12-01T14:00:00Z", end: "2026-12-01T15:00:00Z" });
    const outlook = await seedEvent(db, alice, { start: "2026-12-02T14:00:00Z", end: "2026-12-02T15:00:00Z" });
    await db.admin("update app.events set source = 'outlook', outlook_id = 'o-1' where id = $1", [outlook.id]);
    const outlookNow = (await db.admin<{ updated_at: Date }>("select updated_at from app.events where id = $1", [outlook.id]))[0];
    const allDay = await seedAllDay(db, alice, { firstDay: "2026-12-03", lastDay: "2026-12-03" });
    const series = await seedEvent(db, alice, { start: "2026-12-04T14:00:00Z", end: "2026-12-04T15:00:00Z" });
    await db.admin("update app.events set series_id = gen_random_uuid() where id = $1", [series.id]);
    const seriesNow = (await db.admin<{ updated_at: Date }>("select updated_at from app.events where id = $1", [series.id]))[0];
    const mine = await seedEvent(db, alice, { start: "2026-12-05T14:00:00Z", end: "2026-12-05T15:00:00Z" });

    const cases: [unknown[], RegExp][] = [
      [[remove(bobs)], /out of date/],
      [[remove({ id: outlook.id, updatedAt: new Date(outlookNow.updated_at).toISOString() })], /cannot change this event/],
      [[remove(allDay)], /cannot change this event/],
      [[remove({ id: series.id, updatedAt: new Date(seriesNow.updated_at).toISOString() })], /cannot change this event/],
      [[remove(mine), move(mine, "2026-12-05T16:00:00Z", "2026-12-05T17:00:00Z")], /at most once/],
      [[{ ...move(mine, "x", "y"), start_at: null }], /malformed/],
      [[{ ...remove(mine), kind: "rename" }], /malformed/],
      [[move(mine, "2026-12-05T16:00:00Z", "2026-12-06T16:01:00Z")], /events_at_most_24_hours/],
      [[move(mine, "2026-12-05T16:00:00Z", "2026-12-05T15:00:00Z")], /events_end_after_start|events_timed_or_all_day/],
    ];
    for (const [changes, error] of cases) {
      await db.admin("delete from app.chat_messages");
      const before = await db.admin("select * from app.events order by id");
      const draftId = await draftAs(alice, NEW, changes);
      await expect(apply(alice, draftId), String(error)).rejects.toThrow(error);
      expect(await db.admin("select * from app.events order by id")).toEqual(before);
      expect(await statusOf(draftId)).toBe("open");
    }
  });

  it("refuses another user's draft and a draft that is not open", async () => {
    const draftId = await draftAs(bob, NEW, []);
    await expect(apply(alice, draftId)).rejects.toThrow(/Not found/);
    await apply(bob, draftId);
    await expect(apply(bob, draftId)).rejects.toThrow(/no longer open/);
  });

  it("the old accept function refuses a draft with changes (the code of 19-coach cannot drop them), and still accepts one without", async () => {
    const lecture = await seedEvent(db, alice, { start: "2026-12-01T14:00:00Z", end: "2026-12-01T15:00:00Z" });
    const withChanges = await draftAs(alice, NEW, [remove(lecture)]);
    await expect(db.withUser(alice, (q) => q("select app.chat_accept_draft($1)", [withChanges]))).rejects.toThrow(/out of date/);
    expect(await statusOf(withChanges)).toBe("open");
    await db.admin("update app.draft_plans set status = 'replaced'");
    const plain = await draftAs(alice, NEW, []);
    await db.withUser(alice, (q) => q("select app.chat_accept_draft($1)", [plain]));
    expect(await statusOf(plain)).toBe("accepted");
  });
});

describe("app.chat_undo_draft", () => {
  async function applied() {
    const goal = await seedGoal(db, alice, { deadline: "2027-03-14", rules: [{ kind: "hours", target: 4 }] });
    const lecture = await seedEvent(db, alice, { title: "Statistics revision", start: "2026-12-01T14:00:00Z", end: "2026-12-01T15:00:00Z" });
    const gym = await seedEvent(db, alice, { title: "Gym", start: "2026-12-01T17:00:00Z", end: "2026-12-01T18:00:00Z", status: "done", goalId: goal.id });
    await db.admin("update app.events set location = 'Gym street 1', may_overlap = true where id = $1", [gym.id]);
    const gymNow = (await db.admin<{ updated_at: Date }>("select updated_at from app.events where id = $1", [gym.id]))[0];
    const before = await eventsOf(alice);
    const draftId = await draftAs(alice, NEW, [
      move(lecture, "2026-12-01T16:00:00Z", "2026-12-01T17:30:00Z"),
      remove({ id: gym.id, updatedAt: new Date(gymNow.updated_at).toISOString() }),
    ]);
    const [created] = await apply(alice, draftId);
    return { goal, lecture, gym, draftId, before, created: created.id };
  }

  it("puts everything back: created deleted, moved back, deleted created again with its fields (done again); the draft 'undone'", async () => {
    const { draftId, before, gym } = await applied();

    await undo(alice, draftId);

    expect(await eventsOf(alice)).toEqual(before);
    const [again] = await db.admin<{ id: string; location: string; may_overlap: boolean }>(
      "select id, location, may_overlap from app.events where title = 'Gym'",
    );
    expect(again).toMatchObject({ location: "Gym street 1", may_overlap: true });
    expect(again.id).not.toBe(gym.id);
    expect(await statusOf(draftId)).toBe("undone");
    // Only once.
    await expect(undo(alice, draftId)).rejects.toThrow(/can no longer be undone/);
  });

  it("leaves out a goal deleted since", async () => {
    const { draftId, goal } = await applied();
    await db.admin("delete from app.goals where id = $1", [goal.id]);
    await undo(alice, draftId);
    expect((await eventsOf(alice)).find((e) => e.title === "Gym")).toMatchObject({ goal_id: null, status: "done" });
  });

  it("refuses once a created or moved event was changed or deleted since; nothing changes", async () => {
    for (const spoil of [
      (ids: { created: string; lecture: string }) => db.admin("update app.events set status = 'done' where id = $1", [ids.created]),
      (ids: { created: string; lecture: string }) => db.admin("delete from app.events where id = $1", [ids.created]),
      (ids: { created: string; lecture: string }) => db.admin("update app.events set title = 'Renamed' where id = $1", [ids.lecture]),
    ]) {
      await db.admin("delete from auth.users where id = $1", [alice]);
      alice = await db.createUser("alice@example.com", { confirmed: true });
      const { draftId, created, lecture } = await applied();
      await spoil({ created, lecture: lecture.id });
      const before = await db.admin("select * from app.events order by id");
      await expect(undo(alice, draftId)).rejects.toThrow(/can no longer be undone/);
      expect(await db.admin("select * from app.events order by id")).toEqual(before);
      expect(await statusOf(draftId)).toBe("accepted");
    }
  });

  it("refuses another user's draft, an open draft and a draft accepted by the old function (no undo data)", async () => {
    const { draftId } = await applied();
    await expect(undo(bob, draftId)).rejects.toThrow(/Not found/);
    const open = await draftAs(bob, NEW, []);
    await expect(undo(bob, open)).rejects.toThrow(/can no longer be undone/);
    await db.withUser(bob, (q) => q("select app.chat_accept_draft($1)", [open]));
    await expect(undo(bob, open)).rejects.toThrow(/can no longer be undone/);
  });

  it("cannot be tricked: undo data comes from the rows, so a forged change cannot make it create an Outlook or another user's event", async () => {
    // A forged change naming Bob's event with his version is refused when applying (row-level filter on the
    // user), so there is never undo data for it; and the undo column itself is not writable (see above).
    const bobs = await seedEvent(db, bob, { start: "2026-12-01T14:00:00Z", end: "2026-12-01T15:00:00Z" });
    const draftId = await draftAs(alice, [], [remove(bobs)]);
    await expect(apply(alice, draftId)).rejects.toThrow(/out of date/);
    expect(await db.admin("select count(*)::int as n from app.events where user_id = $1", [bob])).toEqual([{ n: 1 }]);
  });
});
