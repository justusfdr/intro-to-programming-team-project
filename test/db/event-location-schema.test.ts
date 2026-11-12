// Tests for supabase/migrations/*_event_location.sql: a new app event may carry a location; a location
// is changed only through app.set_event_location, on the signed-in user's own app events (R3), never on
// an Outlook event (R11); the length check (1 to 200) still holds; updated_at moves on (R4).
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

const TIMES = { start: "2026-11-17T09:00:00Z", end: "2026-11-17T10:00:00Z" };

const locationOf = async (id: string) =>
  (await db.admin<{ location: string | null }>("select location from app.events where id = $1", [id]))[0]?.location;

const setLocation = (user: string, id: string, location: string | null) =>
  as(user, "select app.set_event_location($1, $2)", [id, location]);

describe("a new app event", () => {
  it("may be written with a location", async () => {
    const [row] = await as<{ location: string }>(
      alice,
      "insert into app.events (title, start_at, end_at, location) values ('Lunch', $1, $2, 'Nova SBE, Carcavelos') returning location",
      [TIMES.start, TIMES.end],
    );
    expect(row).toEqual({ location: "Nova SBE, Carcavelos" });
  });

  it("refuses a location over 200 characters or empty", async () => {
    for (const location of ["x".repeat(201), ""]) {
      await expect(
        as(alice, "insert into app.events (title, start_at, end_at, location) values ('Lunch', $1, $2, $3)", [TIMES.start, TIMES.end, location]),
      ).rejects.toThrow(/events_location_length/);
    }
  });
});

describe("app.set_event_location", () => {
  it("sets, trims and clears the location of the user's own app event; updated_at moves on", async () => {
    const { id, updatedAt } = await seedEvent(db, alice, TIMES);
    await setLocation(alice, id, "  Library, floor 2  ");
    expect(await locationOf(id)).toBe("Library, floor 2");
    const [after] = await db.admin<{ updated_at: Date }>("select updated_at from app.events where id = $1", [id]);
    expect(new Date(after.updated_at).getTime()).toBeGreaterThan(Date.parse(updatedAt));

    await setLocation(alice, id, "   ");
    expect(await locationOf(id)).toBeNull();
    await setLocation(alice, id, "Room 2");
    await setLocation(alice, id, null);
    expect(await locationOf(id)).toBeNull();
  });

  it("changes nothing but the location", async () => {
    const { id } = await seedEvent(db, alice, { ...TIMES, title: "Lunch" });
    const [before] = await db.admin("select title, start_at, end_at, status, source, user_id, goal_id from app.events where id = $1", [id]);
    await setLocation(alice, id, "Cafeteria");
    expect(await db.admin("select title, start_at, end_at, status, source, user_id, goal_id from app.events where id = $1", [id])).toEqual([before]);
  });

  it("does not find another user's event, and leaves it as it was (R3)", async () => {
    const { id } = await seedEvent(db, bob, TIMES);
    await expect(setLocation(alice, id, "Hacked")).rejects.toThrow(/Not found/);
    expect(await locationOf(id)).toBeNull();
  });

  it("refuses an Outlook event's location (R11)", async () => {
    await as(alice, "select app.outlook_import($1, $2, $3::jsonb)", [
      "2026-11-09T09:00:00Z",
      "2027-01-15T09:00:00Z",
      JSON.stringify([{ outlook_id: "AAMk-1", title: "Lecture", all_day: false, start_at: TIMES.start, end_at: TIMES.end, location: "Room 2" }]),
    ]);
    const [{ id }] = await db.admin<{ id: string }>("select id from app.events where outlook_id = 'AAMk-1'");
    await expect(setLocation(alice, id, "Elsewhere")).rejects.toThrow(/Change this event in Outlook/);
    expect(await locationOf(id)).toBe("Room 2");
  });

  it("refuses a location over 200 characters and keeps the old one", async () => {
    const { id } = await seedEvent(db, alice, TIMES);
    await setLocation(alice, id, "Room 2");
    await expect(setLocation(alice, id, "x".repeat(201))).rejects.toThrow(/events_location_length/);
    expect(await locationOf(id)).toBe("Room 2");
  });

  it("cannot be called without signing in", async () => {
    const { id } = await seedEvent(db, alice, TIMES);
    await expect(db.admin("select app.set_event_location($1, 'x')", [id])).rejects.toThrow(/not signed in/);
    expect(await locationOf(id)).toBeNull();
  });

  it("leaves the location column itself not updatable by users (the function is the only way)", async () => {
    const { id } = await seedEvent(db, alice, TIMES);
    await expect(as(alice, "update app.events set location = 'Room' where id = $1", [id])).rejects.toThrow(/permission denied/);
  });
});
