// Tests for supabase/migrations/*_chat.sql (spec 19): row-level security on messages and drafts (R3),
// which columns a user may write, the checks, the day counter (R21) that only the database writes,
// also under two calls at once, one open draft, status only forward, a draft accepted only once (R4),
// the events accept_draft creates (source "assistant"), and deleting an account.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedGoal } from "@test/support/goals";
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

const TUESDAY = [
  { title: "Study", start_at: "2026-12-01T08:00:00Z", end_at: "2026-12-01T13:00:00Z", goal_id: null },
  { title: "Call", start_at: "2026-12-01T13:30:00Z", end_at: "2026-12-01T14:00:00Z", goal_id: null },
];

/** An assistant message with a draft, written as the user (the way send_message saves it). */
async function draftAs(userId: string, events: unknown = TUESDAY): Promise<{ messageId: string; draftId: string }> {
  return db.withUser(userId, async (q) => {
    const [m] = await q<{ id: string }>("insert into app.chat_messages (role, text) values ('assistant', 'Here is a plan') returning id");
    const [d] = await q<{ id: string }>(
      "insert into app.draft_plans (message_id, proposed_events) values ($1, $2::jsonb) returning id",
      [m.id, JSON.stringify(events)],
    );
    return { messageId: m.id, draftId: d.id };
  });
}

const count = (userId: string) =>
  db.withUser(userId, async (q) => (await q<{ ok: boolean }>("select app.chat_count_message() as ok"))[0].ok);

const profile = async (userId: string) =>
  (await db.admin<{ chat_count: number; chat_count_date: string | null }>(
    "select chat_count, chat_count_date::text as chat_count_date from app.profiles where id = $1",
    [userId],
  ))[0];

/** Today in the user's time zone, on the database's clock (what the counter uses). */
const dbToday = async (userId: string) =>
  (await db.admin<{ d: string }>("select ((now() at time zone time_zone)::date)::text as d from app.settings where user_id = $1", [userId]))[0].d;

describe("messages and drafts belong to their user (R3)", () => {
  it("lets a user write messages and a draft; the database fills in owner, order, time and status", async () => {
    const { draftId } = await draftAs(alice);
    const [draft] = await db.admin("select user_id, status from app.draft_plans where id = $1", [draftId]);
    expect(draft).toEqual({ user_id: alice, status: "open" });
    const [message] = await db.admin<{ user_id: string; seq: string }>("select user_id, seq from app.chat_messages");
    expect(message.user_id).toBe(alice);
  });

  it("hides another user's messages and drafts: not returned, not changed, not deleted", async () => {
    const { draftId } = await draftAs(bob);
    const before = await db.admin("select * from app.draft_plans order by id");
    expect(await db.withUser(alice, (q) => q("select * from app.chat_messages"))).toEqual([]);
    expect(await db.withUser(alice, (q) => q("select * from app.draft_plans"))).toEqual([]);
    expect(await db.withUser(alice, (q) => q("update app.draft_plans set status = 'rejected' where id = $1 returning id", [draftId]))).toEqual([]);
    expect(await db.withUser(alice, (q) => q("delete from app.draft_plans returning id"))).toEqual([]);
    expect(await db.withUser(alice, (q) => q("delete from app.chat_messages returning id"))).toEqual([]);
    expect(await db.admin("select * from app.draft_plans order by id")).toEqual(before);
  });

  it("refuses a draft on another user's message, even with its id", async () => {
    const { messageId } = await draftAs(bob);
    await expect(
      db.withUser(alice, (q) =>
        q("insert into app.draft_plans (message_id, proposed_events) values ($1, $2::jsonb)", [messageId, JSON.stringify(TUESDAY)]),
      ),
      // The trigger cannot see Bob's message (row-level security); the two-column link would refuse it next.
    ).rejects.toThrow(/assistant message|draft_plans_message_of_same_user/);
  });

  it("refuses a draft on a user message", async () => {
    await expect(
      db.withUser(alice, async (q) => {
        const [m] = await q<{ id: string }>("insert into app.chat_messages (role, text) values ('user', 'Plan tomorrow') returning id");
        await q("insert into app.draft_plans (message_id, proposed_events) values ($1, $2::jsonb)", [m.id, JSON.stringify(TUESDAY)]);
      }),
    ).rejects.toThrow(/assistant message/);
  });

  it("deletes a user's messages and drafts with the user; deleting a message deletes its draft", async () => {
    await draftAs(alice);
    const { messageId } = await draftAs(bob, TUESDAY.slice(0, 1));
    await db.withUser(bob, (q) => q("delete from app.chat_messages where id = $1", [messageId]));
    expect(await db.admin("select * from app.draft_plans where user_id = $1", [bob])).toEqual([]);

    await db.admin("delete from auth.users where id = $1", [alice]);
    expect(await db.admin("select * from app.chat_messages where user_id = $1", [alice])).toEqual([]);
    expect(await db.admin("select * from app.draft_plans where user_id = $1", [alice])).toEqual([]);
  });

  it("app.delete_account takes the chat rows with it", async () => {
    await draftAs(alice);
    await db.withUser(alice, (q) => q("select app.delete_account()"));
    expect(await db.admin("select count(*)::int as n from app.chat_messages")).toEqual([{ n: 0 }]);
    expect(await db.admin("select count(*)::int as n from app.draft_plans")).toEqual([{ n: 0 }]);
  });
});

describe("only the allowed columns are writable", () => {
  it("refuses the columns the database owns, on insert and update", async () => {
    const { draftId, messageId } = await draftAs(alice);
    for (const sql of [
      "insert into app.chat_messages (role, text, user_id) values ('user', 'x', auth.uid())",
      "insert into app.chat_messages (role, text, created_at) values ('user', 'x', now())",
      "update app.chat_messages set text = 'changed'",
      "update app.chat_messages set user_id = auth.uid()",
      `update app.draft_plans set proposed_events = '[]'::jsonb where id = '${draftId}'`,
      `update app.draft_plans set message_id = '${messageId}' where id = '${draftId}'`,
      `insert into app.draft_plans (message_id, proposed_events, status) values ('${messageId}', '[{}]'::jsonb, 'accepted')`,
    ]) {
      await expect(db.withUser(alice, (q) => q(sql)), sql).rejects.toThrow(/permission denied/);
    }
  });

  it("never lets a user write the day counter or the plan (R6, R21)", async () => {
    for (const assignment of ["chat_count = 0", "chat_count_date = null", "plan = 'pro'"]) {
      await expect(db.withUser(alice, (q) => q(`update app.profiles set ${assignment}`)), assignment).rejects.toThrow(/permission denied/);
    }
  });

  it("gives no rights at all to visitors who are not signed in (anon)", async () => {
    const rows = await db.admin(
      "select privilege_type from information_schema.role_table_grants where table_schema = 'app' and table_name in ('chat_messages', 'draft_plans') and grantee = 'anon'",
    );
    expect(rows).toEqual([]);
    for (const fn of ["app.chat_count_message()", "app.chat_accept_draft(uuid)"]) {
      const [row] = await db.admin<{ ok: boolean }>(`select has_function_privilege('anon', '${fn}', 'execute') as ok`);
      expect(row.ok, fn).toBe(false);
    }
  });
});

describe("checks", () => {
  it("accepts messages of 1 and 4,000 characters and refuses 0, 4,001 and an unknown role", async () => {
    const add = (role: string, text: string) => db.withUser(alice, (q) => q("insert into app.chat_messages (role, text) values ($1, $2)", [role, text]));
    await add("user", "x");
    await add("assistant", "x".repeat(4000));
    await expect(add("user", "")).rejects.toThrow(/chat_messages_text_length/);
    await expect(add("user", "x".repeat(4001))).rejects.toThrow(/chat_messages_text_length/);
    await expect(add("system", "x")).rejects.toThrow(/chat_messages_role/);
  });

  it("accepts 1 to 30 proposed events and refuses none, 31 or something that is not a list", async () => {
    const one = TUESDAY[0];
    await draftAs(alice, Array.from({ length: 30 }, () => one));
    await expect(draftAs(alice, [])).rejects.toThrow(/draft_plans_events_list/);
    await expect(draftAs(alice, Array.from({ length: 31 }, () => one))).rejects.toThrow(/draft_plans_events_list/);
    await expect(draftAs(alice, { title: "x" })).rejects.toThrow(/draft_plans_events_list/);
  });
});

describe("one open draft per user; status only forward", () => {
  it("refuses a second open draft; a replaced one makes room", async () => {
    const first = await draftAs(alice);
    await expect(draftAs(alice)).rejects.toThrow(/draft_plans_one_open/);
    await db.withUser(alice, (q) => q("update app.draft_plans set status = 'replaced' where id = $1", [first.draftId]));
    await draftAs(alice);
    expect(await db.admin("select status from app.draft_plans where user_id = $1 order by created_at, status", [alice])).toHaveLength(2);
  });

  it("allows open -> rejected and open -> replaced, but never back or onward", async () => {
    const { draftId } = await draftAs(alice);
    await db.withUser(alice, (q) => q("update app.draft_plans set status = 'rejected' where id = $1", [draftId]));
    for (const status of ["open", "replaced", "accepted"]) {
      await expect(
        db.withUser(alice, (q) => q("update app.draft_plans set status = $2 where id = $1", [draftId, status])),
        status,
      ).rejects.toThrow(/no longer open|accept_draft/);
    }
    expect(await db.admin("select status from app.draft_plans where id = $1", [draftId])).toEqual([{ status: "rejected" }]);
  });

  it("never lets a user mark a draft accepted directly (only accept_draft, which creates the events)", async () => {
    const { draftId } = await draftAs(alice);
    await expect(db.withUser(alice, (q) => q("update app.draft_plans set status = 'accepted' where id = $1", [draftId]))).rejects.toThrow(
      /Only accept_draft/,
    );
  });
});

describe("app.chat_accept_draft (R1, R4)", () => {
  it("creates every proposed event in one step with source 'assistant', planned, timed, and marks the draft accepted", async () => {
    const goal = await seedGoal(db, alice, { deadline: "2027-03-14", rules: [{ kind: "hours", target: 4 }] });
    const { draftId } = await draftAs(alice, [{ ...TUESDAY[0], goal_id: goal.id }, TUESDAY[1]]);

    const ids = await db.withUser(alice, (q) => q<{ id: string }>("select id from app.chat_accept_draft($1) as id", [draftId]));

    expect(ids).toHaveLength(2);
    const events = await db.admin(
      "select title, source, status, all_day, may_overlap, goal_id, user_id from app.events where user_id = $1 order by start_at",
      [alice],
    );
    expect(events).toEqual([
      { title: "Study", source: "assistant", status: "planned", all_day: false, may_overlap: false, goal_id: goal.id, user_id: alice },
      { title: "Call", source: "assistant", status: "planned", all_day: false, may_overlap: false, goal_id: null, user_id: alice },
    ]);
    expect(await db.admin("select status from app.draft_plans where id = $1", [draftId])).toEqual([{ status: "accepted" }]);
  });

  it("accepts a draft only once: the second call is refused and creates nothing", async () => {
    const { draftId } = await draftAs(alice);
    await db.withUser(alice, (q) => q("select app.chat_accept_draft($1)", [draftId]));
    await expect(db.withUser(alice, (q) => q("select app.chat_accept_draft($1)", [draftId]))).rejects.toThrow(/no longer open/);
    expect(await db.admin("select count(*)::int as n from app.events")).toEqual([{ n: 2 }]);
  });

  it("two devices at the same moment: one creates the events, the other is refused", async () => {
    const { draftId } = await draftAs(alice);
    const results = await Promise.allSettled([
      db.withUser(alice, (q) => q("select app.chat_accept_draft($1)", [draftId])),
      db.withUser(alice, (q) => q("select app.chat_accept_draft($1)", [draftId])),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(await db.admin("select count(*)::int as n from app.events")).toEqual([{ n: 2 }]);
  });

  it("refuses another user's draft, a rejected one and a replaced one; nothing created", async () => {
    const bobs = await draftAs(bob);
    await expect(db.withUser(alice, (q) => q("select app.chat_accept_draft($1)", [bobs.draftId]))).rejects.toThrow(/Not found/);
    const mine = await draftAs(alice);
    await db.withUser(alice, (q) => q("update app.draft_plans set status = 'rejected' where id = $1", [mine.draftId]));
    await expect(db.withUser(alice, (q) => q("select app.chat_accept_draft($1)", [mine.draftId]))).rejects.toThrow(/no longer open/);
    expect(await db.admin("select count(*)::int as n from app.events")).toEqual([{ n: 0 }]);
  });

  it("refuses events of under 15 minutes or over 8 hours, another user's goal, and a bad title; nothing created, draft stays open", async () => {
    const bobsGoal = await seedGoal(db, bob, { deadline: "2027-03-14", rules: [{ kind: "hours", target: 4 }] });
    const cases: [unknown[], RegExp][] = [
      [[{ ...TUESDAY[0], end_at: "2026-12-01T08:10:00Z" }], /15 minutes to 8 hours/],
      [[{ ...TUESDAY[0], end_at: "2026-12-01T16:01:00Z" }], /15 minutes to 8 hours/],
      [[{ ...TUESDAY[0], goal_id: bobsGoal.id }], /events_goal_of_same_user/],
      [[{ ...TUESDAY[0], title: "" }], /events_title_length/],
    ];
    for (const [events, error] of cases) {
      await db.admin("delete from app.chat_messages");
      const { draftId } = await draftAs(alice, events);
      await expect(db.withUser(alice, (q) => q("select app.chat_accept_draft($1)", [draftId])), String(error)).rejects.toThrow(error);
      expect(await db.admin("select status from app.draft_plans where id = $1", [draftId])).toEqual([{ status: "open" }]);
    }
    expect(await db.admin("select count(*)::int as n from app.events")).toEqual([{ n: 0 }]);
  });

  it("assistant events behave like app events: the user may edit and delete them", async () => {
    const { draftId } = await draftAs(alice, TUESDAY.slice(0, 1));
    const [{ id }] = await db.withUser(alice, (q) => q<{ id: string }>("select id from app.chat_accept_draft($1) as id", [draftId]));
    await db.withUser(alice, (q) => q("update app.events set title = 'Revision', status = 'done' where id = $1", [id]));
    expect(await db.admin("select title, status, source from app.events where id = $1", [id])).toEqual([
      { title: "Revision", status: "done", source: "assistant" },
    ]);
    await db.withUser(alice, (q) => q("delete from app.events where id = $1", [id]));
    expect(await db.admin("select count(*)::int as n from app.events")).toEqual([{ n: 0 }]);
  });

  it("a user still cannot write source themselves", async () => {
    await expect(
      db.withUser(alice, (q) =>
        q("insert into app.events (title, start_at, end_at, source) values ('x', now(), now() + interval '1 hour', 'assistant')"),
      ),
    ).rejects.toThrow(/permission denied/);
    // The event of another user is never touched by it.
    await seedEvent(db, bob, { start: "2026-12-01T08:00:00Z", end: "2026-12-01T09:00:00Z" });
    expect(await db.admin("select source from app.events")).toEqual([{ source: "app" }]);
  });
});

describe("the day counter (R21)", () => {
  it("counts up to 20 messages a day, then refuses without changing anything", async () => {
    for (let i = 1; i <= 20; i++) expect(await count(alice), `message ${i}`).toBe(true);
    expect(await profile(alice)).toEqual({ chat_count: 20, chat_count_date: await dbToday(alice) });
    expect(await count(alice)).toBe(false);
    expect(await profile(alice)).toEqual({ chat_count: 20, chat_count_date: await dbToday(alice) });
    // Another user's counter is their own.
    expect(await count(bob)).toBe(true);
    expect((await profile(bob)).chat_count).toBe(1);
  });

  it("starts again at 1 on a new day in the user's time zone", async () => {
    await db.admin("update app.profiles set chat_count = 20, chat_count_date = ((now() at time zone 'Europe/Lisbon')::date - 1) where id = $1", [alice]);
    expect(await count(alice)).toBe(true);
    expect(await profile(alice)).toEqual({ chat_count: 1, chat_count_date: await dbToday(alice) });
  });

  it("two calls at the same moment at 19: only one gets the 20th message", async () => {
    await db.admin("update app.profiles set chat_count = 19, chat_count_date = $2::date where id = $1", [alice, await dbToday(alice)]);
    const results = await Promise.all([count(alice), count(alice)]);
    expect(results.sort()).toEqual([false, true]);
    expect((await profile(alice)).chat_count).toBe(20);
  });

  it("refuses a caller without sign-in", async () => {
    await expect(
      db.driver.transaction(async (run) => {
        await run("set local role authenticated", []);
        return run("select app.chat_count_message()", []);
      }),
    ).rejects.toThrow(/not signed in/);
  });
});
