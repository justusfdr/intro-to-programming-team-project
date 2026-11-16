// Tests for supabase/migrations/20261212000000_saved_places.sql: the user's own places (at most 10, each
// name once, only their own, R3) and where the trip to an event starts (travel_from).
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
const addPlace = (user: string, name: string, address = "Rua Augusta 1, Lisboa") =>
  as<{ id: string }>(user, "insert into app.places (name, address) values ($1, $2) returning id", [name, address]);
const TIMES = { start: "2026-12-01T12:30:00Z", end: "2026-12-01T13:30:00Z" };

describe("app.places", () => {
  it("each user sees, changes and deletes only their own places (R3)", async () => {
    const [{ id }] = await addPlace(alice, "Uni");
    expect(await as(bob, "select * from app.places")).toEqual([]);
    expect(await as(bob, "update app.places set name = 'X' returning id")).toEqual([]);
    expect(await as(bob, "delete from app.places returning id")).toEqual([]);
    await as(alice, "update app.places set name = 'University', address = 'Campus 2' where id = $1", [id]);
    expect(await as(alice, "select name, address from app.places")).toEqual([{ name: "University", address: "Campus 2" }]);
    expect(await as(alice, "delete from app.places where id = $1 returning id", [id])).toHaveLength(1);
  });

  it("refuses an empty or too long name or address, and spaces at the ends", async () => {
    for (const name of ["", " Uni", "x".repeat(41)]) await expect(addPlace(alice, name)).rejects.toThrow(/places_name_form/);
    for (const address of ["", "Street ", "x".repeat(301)]) await expect(addPlace(alice, "Gym", address)).rejects.toThrow(/places_address_form/);
  });

  it("takes each name once per user, and at most 10 places", async () => {
    await addPlace(alice, "Gym");
    await expect(addPlace(alice, "Gym")).rejects.toThrow(/places_once_per_user/);
    await addPlace(bob, "Gym");
    for (let i = 1; i < 10; i++) await addPlace(alice, `Place ${i}`);
    await expect(addPlace(alice, "Eleven")).rejects.toThrow(/at most 10 places/);
  });

  it("does not let the user write user_id", async () => {
    await expect(as(alice, "insert into app.places (user_id, name, address) values ($1, 'Uni', 'Campus')", [bob])).rejects.toThrow();
  });
});

describe("app.events.travel_from", () => {
  it("takes the standard (null), home, last, a place id or an address, and nothing else", async () => {
    const insert = (from: string | null) =>
      as(alice, "insert into app.events (title, start_at, end_at, travel_from) values ('Lunch', $1, $2, $3) returning id", [TIMES.start, TIMES.end, from]);
    for (const from of [null, "home", "last", "place:0b1e2c3d-1111-4222-8333-944455556666", "address:Rua Augusta 1"]) await insert(from);
    for (const from of ["", "work", "place:nope", "address:", `address:${"x".repeat(301)}`]) await expect(insert(from)).rejects.toThrow(/events_travel_from_form/);
  });

  it("app.set_event_travel_from changes only the user's own app events", async () => {
    const { id } = await seedEvent(db, alice, TIMES);
    await as(alice, "select app.set_event_travel_from($1, 'home')", [id]);
    expect((await db.admin<{ travel_from: string }>("select travel_from from app.events where id = $1", [id]))[0].travel_from).toBe("home");
    await expect(as(bob, "select app.set_event_travel_from($1, 'last')", [id])).rejects.toThrow(/Not found/);
    await as(alice, "select app.set_event_travel_from($1, null)", [id]);
    expect((await db.admin<{ travel_from: string | null }>("select travel_from from app.events where id = $1", [id]))[0].travel_from).toBeNull();
  });
});
