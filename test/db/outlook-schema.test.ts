// Tests for supabase/migrations/*_outlook.sql: the stored access is unreadable to users, `source` and
// `outlook_id` are written only by the narrow functions, R11 holds in the database, and every function
// works on the signed-in user's own rows only.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedEvent } from "@test/support/events";
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

const as = <T extends Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) =>
  db.withUser(user, (q) => q<T>(sql, params));

const LECTURE = { outlook_id: "AAMk-1", title: "Lecture", all_day: false, start_at: "2026-11-17T09:00:00Z", end_at: "2026-11-17T10:00:00Z", location: "Room 2" };
const HOLIDAY = { outlook_id: "AAMk-2", title: "Holiday", all_day: true, first_day: "2026-11-20", last_day: "2026-11-22" };
const WINDOW = ["2026-11-09T09:00:00Z", "2027-01-15T09:00:00Z"];

const importAs = (user: string, events: unknown[], window = WINDOW) =>
  as(user, "select app.outlook_import($1, $2, $3::jsonb)", [...window, JSON.stringify(events)]);

const outlookRows = (user: string) =>
  db.admin<{ outlook_id: string; title: string; all_day: boolean; first_day: string | null; location: string | null }>(
    "select outlook_id, title, all_day, first_day::text as first_day, location from app.events where user_id = $1 and source = 'outlook' order by outlook_id",
    [user],
  );

describe("the connection row", () => {
  it("users read status and last sync, never the token, and cannot write the row", async () => {
    await as(alice, "select app.outlook_connect('v1.nonce.cipher')");
    expect(await as(alice, "select status, last_synced_at from app.calendar_connections")).toEqual([{ status: "connected", last_synced_at: null }]);
    await expect(as(alice, "select token_encrypted from app.calendar_connections")).rejects.toThrow(/permission denied/);
    await expect(as(alice, "update app.calendar_connections set status = 'connected'")).rejects.toThrow(/permission denied/);
    await expect(as(alice, "insert into app.calendar_connections (token_encrypted) values ('v1.x')")).rejects.toThrow(/permission denied/);
    await expect(as(alice, "delete from app.calendar_connections")).rejects.toThrow(/permission denied/);
  });

  it("outlook_token returns the user's own ciphertext only, and nothing once Microsoft refused it", async () => {
    await as(alice, "select app.outlook_connect('v1.alice.token')");
    expect(await as(alice, "select app.outlook_token() as t")).toEqual([{ t: "v1.alice.token" }]);
    expect(await as(bob, "select app.outlook_token() as t")).toEqual([{ t: null }]);
    expect(await as(bob, "select status from app.calendar_connections")).toEqual([]);
    await as(alice, "select app.outlook_needs_reconnect()");
    expect(await as(alice, "select app.outlook_token() as t")).toEqual([{ t: null }]);
    expect(await as(alice, "select app.outlook_begin_sync() as ok")).toEqual([{ ok: false }]);
  });

  it("refuses a token that is not our ciphertext format", async () => {
    await expect(as(alice, "select app.outlook_connect('plain-refresh-token')")).rejects.toThrow(/calendar_connections_token_shape/);
  });

  it("lets a sync start at most every 5 minutes", async () => {
    expect(await as(alice, "select app.outlook_begin_sync() as ok")).toEqual([{ ok: false }]); // not connected
    await as(alice, "select app.outlook_connect('v1.a.b')");
    expect(await as(alice, "select app.outlook_begin_sync() as ok")).toEqual([{ ok: true }]);
    expect(await as(alice, "select app.outlook_begin_sync() as ok")).toEqual([{ ok: false }]);
    await db.admin("update app.calendar_connections set sync_started_at = now() - interval '4 minutes 59 seconds'");
    expect(await as(alice, "select app.outlook_begin_sync() as ok")).toEqual([{ ok: false }]);
    await db.admin("update app.calendar_connections set sync_started_at = now() - interval '5 minutes'");
    expect(await as(alice, "select app.outlook_begin_sync() as ok")).toEqual([{ ok: true }]);
  });
});

describe("source and outlook_id", () => {
  it("are not writable by users", async () => {
    await expect(
      as(alice, "insert into app.events (title, start_at, end_at, source) values ('x', '2026-11-17T09:00Z', '2026-11-17T10:00Z', 'outlook')"),
    ).rejects.toThrow(/permission denied/);
    const { id } = await seedEvent(db, alice, { start: "2026-11-17T09:00:00Z", end: "2026-11-17T10:00:00Z" });
    await expect(as(alice, "update app.events set outlook_id = 'x' where id = $1", [id])).rejects.toThrow(/permission denied/);
    await expect(as(alice, "update app.events set location = 'Room' where id = $1", [id])).rejects.toThrow(/permission denied/);
  });
});

describe("outlook_import (R26)", () => {
  it("adds Outlook's events as source 'outlook', timed and all-day, for the signed-in user only", async () => {
    await importAs(alice, [LECTURE, HOLIDAY]);
    expect(await outlookRows(alice)).toEqual([
      { outlook_id: "AAMk-1", title: "Lecture", all_day: false, first_day: null, location: "Room 2" },
      { outlook_id: "AAMk-2", title: "Holiday", all_day: true, first_day: "2026-11-20", location: null },
    ]);
    expect(await outlookRows(bob)).toEqual([]);
  });

  it("updates changed events, keeps unchanged ones as they are (updated_at), and removes events Outlook no longer lists", async () => {
    await importAs(alice, [LECTURE, HOLIDAY]);
    const [before] = await db.admin<{ updated_at: Date }>("select updated_at from app.events where outlook_id = 'AAMk-1'");
    await importAs(alice, [LECTURE, { ...HOLIDAY, title: "Holidays" }]);
    const [after] = await db.admin<{ updated_at: Date }>("select updated_at from app.events where outlook_id = 'AAMk-1'");
    expect(after.updated_at).toEqual(before.updated_at);
    expect((await outlookRows(alice)).map((e) => e.title)).toEqual(["Lecture", "Holidays"]);

    await importAs(alice, [HOLIDAY]);
    expect((await outlookRows(alice)).map((e) => e.outlook_id)).toEqual(["AAMk-2"]);
  });

  it("keeps imported events outside the window", async () => {
    await importAs(alice, [LECTURE]);
    await importAs(alice, [], ["2026-12-01T00:00:00Z", "2027-01-30T00:00:00Z"]);
    expect(await outlookRows(alice)).toHaveLength(1);
  });

  it("does not import the app's own events again, and links a lost create by its transaction id", async () => {
    const sent = await seedEvent(db, alice, { title: "Revision", start: "2026-11-18T09:00:00Z", end: "2026-11-18T10:00:00Z" });
    const lost = await seedEvent(db, alice, { title: "Run", start: "2026-11-19T07:00:00Z", end: "2026-11-19T08:00:00Z" });
    await as(alice, "select app.outlook_mark_sent($1::jsonb)", [JSON.stringify([{ event_id: sent.id, version: sent.updatedAt, outlook_id: "AAMk-own" }])]);
    await importAs(alice, [
      { ...LECTURE, outlook_id: "AAMk-own", title: "Revision" },
      { ...LECTURE, outlook_id: "AAMk-lost", title: "Run", transaction_id: lost.id },
    ]);
    expect(await outlookRows(alice)).toEqual([]);
    expect(await db.admin("select outlook_id from app.events where id = $1", [lost.id])).toEqual([{ outlook_id: "AAMk-lost" }]);
  });

  it("never touches another user's rows, even with the same Outlook id", async () => {
    await importAs(bob, [LECTURE]);
    await importAs(alice, [{ ...LECTURE, title: "Alice's lecture" }]);
    await importAs(alice, []);
    expect((await outlookRows(bob)).map((e) => e.title)).toEqual(["Lecture"]);
  });
});

describe("R11 in the database", () => {
  async function imported() {
    await importAs(alice, [LECTURE]);
    const [row] = await db.admin<{ id: string }>("select id from app.events where outlook_id = 'AAMk-1'");
    return row.id;
  }

  it.each([
    ["the title", "title = 'Renamed'"],
    ["the times", "start_at = start_at + interval '1 hour', end_at = end_at + interval '1 hour'"],
    ["may_overlap", "may_overlap = true"],
  ])("refuses a change of %s: 'Change this event in Outlook'", async (_what, set) => {
    const id = await imported();
    await expect(as(alice, `update app.events set ${set} where id = $1`, [id])).rejects.toThrow("Change this event in Outlook");
  });

  it("allows the goal and the status, and refuses a delete", async () => {
    const id = await imported();
    const goal = await seedGoal(db, alice, { deadline: "2027-03-14", rules: [{ kind: "count", target: 2 }] });
    await as(alice, "update app.events set goal_id = $2, status = 'done' where id = $1", [id, goal.id]);
    expect(await db.admin("select goal_id, status from app.events where id = $1", [id])).toEqual([{ goal_id: goal.id, status: "done" }]);
    await expect(as(alice, "delete from app.events where id = $1", [id])).rejects.toThrow("Change this event in Outlook");
  });
});

describe("sending app events", () => {
  it("outlook_mark_sent records the copy without moving updated_at, for the user's own app events only", async () => {
    const mine = await seedEvent(db, alice, { start: "2026-11-18T09:00:00Z", end: "2026-11-18T10:00:00Z" });
    const bobs = await seedEvent(db, bob, { start: "2026-11-18T09:00:00Z", end: "2026-11-18T10:00:00Z" });
    const results = [mine, bobs].map((e, i) => ({ event_id: e.id, version: e.updatedAt, outlook_id: `AAMk-${i}` }));
    await as(alice, "select app.outlook_mark_sent($1::jsonb)", [JSON.stringify(results)]);
    const rows = await db.admin<{ id: string; outlook_id: string | null; updated_at: Date; outlook_sent_version: Date | null }>(
      "select id, outlook_id, updated_at, outlook_sent_version from app.events order by outlook_id nulls last",
    );
    expect(rows.find((r) => r.id === mine.id)).toMatchObject({ outlook_id: "AAMk-0" });
    expect(new Date(rows.find((r) => r.id === mine.id)!.updated_at).toISOString()).toBe(mine.updatedAt);
    expect(new Date(rows.find((r) => r.id === mine.id)!.outlook_sent_version!).toISOString()).toBe(mine.updatedAt);
    expect(rows.find((r) => r.id === bobs.id)).toMatchObject({ outlook_id: null });
  });

  it("remembers a sent app event that the user deletes, until outlook_forget_deletions", async () => {
    const e = await seedEvent(db, alice, { start: "2026-11-18T09:00:00Z", end: "2026-11-18T10:00:00Z" });
    await as(alice, "select app.outlook_mark_sent($1::jsonb)", [JSON.stringify([{ event_id: e.id, version: e.updatedAt, outlook_id: "AAMk-9" }])]);
    await as(alice, "delete from app.events where id = $1", [e.id]);
    expect(await as(alice, "select outlook_id from app.outlook_deletions")).toEqual([{ outlook_id: "AAMk-9" }]);
    expect(await as(bob, "select outlook_id from app.outlook_deletions")).toEqual([]);
    await as(bob, "select app.outlook_forget_deletions($1)", [["AAMk-9"]]);
    expect(await db.admin("select count(*)::int as n from app.outlook_deletions")).toEqual([{ n: 1 }]);
    await as(alice, "select app.outlook_forget_deletions($1)", [["AAMk-9"]]);
    expect(await db.admin("select count(*)::int as n from app.outlook_deletions")).toEqual([{ n: 0 }]);
  });
});

describe("outlook_disconnect (R26)", () => {
  it("deletes the connection and the imported events; app events stay; the other user is untouched", async () => {
    for (const user of [alice, bob]) {
      await as(user, "select app.outlook_connect('v1.a.b')");
      await importAs(user, [LECTURE]);
    }
    await seedEvent(db, alice, { title: "Revision", start: "2026-11-18T09:00:00Z", end: "2026-11-18T10:00:00Z" });
    await as(alice, "select app.outlook_disconnect()");
    expect(await db.admin("select title, source from app.events where user_id = $1", [alice])).toEqual([{ title: "Revision", source: "app" }]);
    expect(await as(alice, "select 1 from app.calendar_connections")).toEqual([]);
    expect(await outlookRows(bob)).toHaveLength(1);
    expect(await as(bob, "select status from app.calendar_connections")).toEqual([{ status: "connected" }]);
  });
});
