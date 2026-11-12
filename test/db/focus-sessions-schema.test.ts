// Tests for supabase/migrations/*_focus_sessions.sql: one active session per user (R4), the checks
// for R12 and R14, row-level security (R3), links only to the user's own events.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedEvent } from "@test/support/events";
import { seedSession } from "@test/support/sessions";
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

const NINE = "2026-11-16T09:00:00Z";

function startAs(userId: string, minutes: number, eventId: string | null = null) {
  return db.withUser(userId, (q) =>
    q<{ id: string; user_id: string; status: string }>(
      "insert into app.focus_sessions (planned_minutes, started_at, event_id) values ($1, $2, $3) returning id, user_id, status",
      [minutes, NINE, eventId],
    ),
  );
}

describe("one running or paused session per user (R4)", () => {
  it("refuses a second running session, and a running one while another is paused", async () => {
    await startAs(alice, 60);
    await expect(startAs(alice, 30)).rejects.toThrow(/focus_sessions_one_active/);
    await db.admin("update app.focus_sessions set status = 'paused', paused_at = $1", [NINE]);
    await expect(startAs(alice, 30)).rejects.toThrow(/focus_sessions_one_active/);
  });

  it("allows a new session after the last one finished, and another user's at the same time", async () => {
    await seedSession(db, alice, { status: "finished", startedAt: NINE, endedAt: "2026-11-16T10:00:00Z" });
    await startAs(alice, 60);
    await startAs(bob, 60);
    expect(await db.admin("select count(*)::int as n from app.focus_sessions where status = 'running'")).toEqual([{ n: 2 }]);
  });
});

describe("checks the database enforces itself", () => {
  it.each([0, -5, 241, 600])("refuses a length of %i minutes (R12)", async (minutes) => {
    await expect(startAs(alice, minutes)).rejects.toThrow(/focus_sessions_length/);
  });

  it.each([1, 25, 61, 180, 240])("accepts a length of %i minutes (R12)", async (minutes) => {
    const [row] = await startAs(alice, minutes);
    expect(row.status).toBe("running");
  });

  it("refuses a rating outside 0 to 5 and a rating on a session that is not finished (R14)", async () => {
    const finished = await seedSession(db, alice, { status: "finished", startedAt: NINE, endedAt: "2026-11-16T10:00:00Z" });
    await db.withUser(alice, (q) => q("update app.focus_sessions set rating = 0 where id = $1", [finished]));
    await expect(db.withUser(alice, (q) => q("update app.focus_sessions set rating = 6 where id = $1", [finished]))).rejects.toThrow(
      /focus_sessions_rating/,
    );
    const [running] = await startAs(alice, 60);
    await expect(db.withUser(alice, (q) => q("update app.focus_sessions set rating = 3 where id = $1", [running.id]))).rejects.toThrow(
      /focus_sessions_rating/,
    );
  });

  it("refuses times that do not fit the status", async () => {
    const [running] = await startAs(alice, 60);
    for (const [assignment, constraint] of [
      ["status = 'paused'", /focus_sessions_paused_at/],
      ["status = 'finished'", /focus_sessions_ended_at/],
      ["paused_seconds = -1", /focus_sessions_paused_seconds/],
      ["status = 'finished', ended_at = '2026-11-16T08:00:00Z'", /focus_sessions_order/],
    ] as const) {
      await expect(db.withUser(alice, (q) => q(`update app.focus_sessions set ${assignment} where id = $1`, [running.id])), assignment).rejects.toThrow(
        constraint,
      );
    }
  });
});

describe("sessions belong to their user (R3)", () => {
  it("hides another user's session: not returned, not changed, not deleted", async () => {
    const bobs = await seedSession(db, bob, { startedAt: NINE });
    expect(await db.withUser(alice, (q) => q("select * from app.focus_sessions"))).toEqual([]);
    expect(await db.withUser(alice, (q) => q("update app.focus_sessions set status = 'paused', paused_at = now() where id = $1 returning id", [bobs]))).toEqual([]);
    expect(await db.withUser(alice, (q) => q("delete from app.focus_sessions where id = $1 returning id", [bobs]))).toEqual([]);
    expect(await db.admin("select status from app.focus_sessions where id = $1", [bobs])).toEqual([{ status: "running" }]);
  });

  it("links a session only to the user's own event, and keeps it when the event is deleted", async () => {
    const bobsEvent = await seedEvent(db, bob, { start: NINE, end: "2026-11-16T10:00:00Z" });
    await expect(startAs(alice, 60, bobsEvent.id)).rejects.toThrow(/focus_sessions_event_of_same_user/);
    const own = await seedEvent(db, alice, { start: NINE, end: "2026-11-16T10:00:00Z" });
    const [session] = await startAs(alice, 60, own.id);
    await db.admin("delete from app.events where id = $1", [own.id]);
    expect(await db.admin("select user_id, event_id from app.focus_sessions where id = $1", [session.id])).toEqual([{ user_id: alice, event_id: null }]);
  });

  it("does not let a user change the owner, the event, the length or the start of a session", async () => {
    const [own] = await startAs(alice, 60);
    for (const assignment of ["user_id = user_id", "event_id = null", "planned_minutes = 30", "started_at = now()"]) {
      await expect(db.withUser(alice, (q) => q(`update app.focus_sessions set ${assignment} where id = $1`, [own.id])), assignment).rejects.toThrow(
        /permission denied/,
      );
    }
  });
});
