// Tests for supabase/migrations/*_events.sql: row-level security (R3), the columns users may not
// write, the checks the database enforces itself, and how updated_at is set (R4).
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

const NINE = "2026-11-16T09:00:00Z";
const ELEVEN = "2026-11-16T11:00:00Z";

function insertAs(userId: string, title: string, start = NINE, end = ELEVEN) {
  return db.withUser(userId, (q) =>
    q<{ id: string; user_id: string; status: string; source: string; may_overlap: boolean }>(
      `insert into app.events (title, start_at, end_at) values ($1, $2, $3)
       returning id, user_id, status, source, may_overlap`,
      [title, start, end],
    ),
  );
}

describe("a new event", () => {
  it("belongs to the signed-in user and starts planned, from the app, may_overlap false", async () => {
    const [row] = await insertAs(alice, "Statistics revision");
    expect(row).toMatchObject({ user_id: alice, status: "planned", source: "app", may_overlap: false });
  });

  it("cannot be created for another user", async () => {
    await expect(
      db.withUser(alice, (q) =>
        q("insert into app.events (user_id, title, start_at, end_at) values ($1, 'x', $2, $3)", [bob, NINE, ELEVEN]),
      ),
    ).rejects.toThrow(/permission denied/);
    expect(await db.admin("select 1 from app.events")).toEqual([]);
  });

  it("cannot set the columns the server owns (source, updated_at, id)", async () => {
    for (const column of ["source", "updated_at", "id"]) {
      await expect(
        db.withUser(alice, (q) =>
          q(`insert into app.events (title, start_at, end_at, ${column}) values ('x', $1, $2, default)`, [NINE, ELEVEN]),
        ),
        column,
      ).rejects.toThrow(/permission denied/);
    }
  });
});

describe("another user's event does not exist for you (R3, A8)", () => {
  it("is not returned, not changed and not deleted; it stays exactly as it was", async () => {
    const event = await seedEvent(db, bob, { start: NINE, end: ELEVEN });
    const before = await db.admin("select * from app.events where id = $1", [event.id]);

    const read = await db.withUser(alice, (q) => q("select * from app.events where id = $1", [event.id]));
    const changed = await db.withUser(alice, (q) =>
      q("update app.events set title = 'Hacked' where id = $1 returning id", [event.id]),
    );
    const deleted = await db.withUser(alice, (q) => q("delete from app.events where id = $1 returning id", [event.id]));

    expect(read).toEqual([]);
    expect(changed).toEqual([]);
    expect(deleted).toEqual([]);
    expect(await db.admin("select * from app.events where id = $1", [event.id])).toEqual(before);
  });

  it("cannot be taken over by moving your own event to another user", async () => {
    const [own] = await insertAs(alice, "Mine");
    await expect(
      db.withUser(alice, (q) => q("update app.events set user_id = $2 where id = $1", [own.id, bob])),
    ).rejects.toThrow(/permission denied/);
  });

  it("lets the owner read, change and delete their own event", async () => {
    const [own] = await insertAs(alice, "Mine");
    expect(await db.withUser(alice, (q) => q("select title from app.events"))).toEqual([{ title: "Mine" }]);
    await db.withUser(alice, (q) => q("update app.events set status = 'done' where id = $1", [own.id]));
    await db.withUser(alice, (q) => q("delete from app.events where id = $1", [own.id]));
    expect(await db.admin("select 1 from app.events")).toEqual([]);
  });

  it("does not let a user change the columns the server owns", async () => {
    const [own] = await insertAs(alice, "Mine");
    for (const assignment of ["source = 'outlook'", "updated_at = now()", "id = gen_random_uuid()"]) {
      await expect(
        db.withUser(alice, (q) => q(`update app.events set ${assignment} where id = $1`, [own.id])),
        assignment,
      ).rejects.toThrow(/permission denied/);
    }
  });
});

describe("checks the database enforces itself", () => {
  it.each([
    ["an empty title", "", NINE, ELEVEN, /events_title_length/],
    ["a 101-character title", "x".repeat(101), NINE, ELEVEN, /events_title_length/],
    ["an end before the start (14:00 to 13:00)", "x", "2026-11-16T14:00:00Z", "2026-11-16T13:00:00Z", /events_end_after_start/],
    ["an end equal to the start", "x", NINE, NINE, /events_end_after_start/],
    ["25 hours", "x", NINE, "2026-11-17T10:00:00Z", /events_at_most_24_hours/],
  ])("rejects %s", async (_case, title, start, end, constraint) => {
    await expect(insertAs(alice, title, start, end)).rejects.toThrow(constraint);
    expect(await db.admin("select 1 from app.events")).toEqual([]);
  });

  it("accepts 100 characters and exactly 24 hours", async () => {
    await insertAs(alice, "x".repeat(100), NINE, "2026-11-17T09:00:00Z");
    expect(await db.admin("select count(*)::int as n from app.events")).toEqual([{ n: 1 }]);
  });

  it("rejects an unknown status", async () => {
    const [own] = await insertAs(alice, "Mine");
    await expect(
      db.withUser(alice, (q) => q("update app.events set status = 'skipped' where id = $1", [own.id])),
    ).rejects.toThrow(/events_status/);
  });
});

describe("updated_at (R4)", () => {
  it("is set by the database in whole milliseconds and grows with every change, even within one millisecond", async () => {
    const [own] = await insertAs(alice, "Mine");
    const stamps: number[] = [];
    for (let i = 0; i < 5; i++) {
      const [row] = await db.withUser(alice, (q) =>
        q<{ updated_at: Date }>("update app.events set title = $2 where id = $1 returning updated_at", [own.id, `T${i}`]),
      );
      stamps.push(new Date(row.updated_at).getTime());
    }
    for (let i = 1; i < stamps.length; i++) expect(stamps[i]).toBeGreaterThan(stamps[i - 1]);
    const [{ micro }] = await db.admin<{ micro: number }>(
      "select extract(microseconds from updated_at)::int % 1000 as micro from app.events where id = $1",
      [own.id],
    );
    expect(micro).toBe(0);
  });
});
