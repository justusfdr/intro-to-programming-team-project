// Tests for supabase/migrations/20261221000000_travel_per_place.sql: how the user gets to each saved place
// and home, and the buffer for it. Empty means "as Other" (the settings' travel_mode and buffer).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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

describe("app.places travel columns", () => {
  it("are empty for a new place, and the user can set and clear them on their own place only", async () => {
    const [place] = await as<{ id: string; travel_mode: string | null; travel_buffer_minutes: number | null }>(
      alice,
      "insert into app.places (name, address) values ('Gym', 'Rua 1') returning id, travel_mode, travel_buffer_minutes",
    );
    expect(place).toMatchObject({ travel_mode: null, travel_buffer_minutes: null });
    await as(alice, "update app.places set travel_mode = 'walking', travel_buffer_minutes = 5 where id = $1", [place.id]);
    expect(await as(alice, "select travel_mode, travel_buffer_minutes from app.places")).toEqual([{ travel_mode: "walking", travel_buffer_minutes: 5 }]);
    expect(await as(bob, "update app.places set travel_mode = 'driving' returning id")).toEqual([]);
    await as(alice, "update app.places set travel_mode = null, travel_buffer_minutes = null where id = $1", [place.id]);
    expect(await as(alice, "select travel_mode, travel_buffer_minutes from app.places")).toEqual([{ travel_mode: null, travel_buffer_minutes: null }]);
  });

  it("refuses an unknown way and a buffer outside 0 to 120", async () => {
    await expect(as(alice, "insert into app.places (name, address, travel_mode) values ('A', 'B', 'flying')")).rejects.toThrow(/places_travel_mode/);
    await expect(as(alice, "insert into app.places (name, address, travel_buffer_minutes) values ('A', 'B', -1)")).rejects.toThrow(/places_travel_buffer/);
    await expect(as(alice, "insert into app.places (name, address, travel_buffer_minutes) values ('A', 'B', 121)")).rejects.toThrow(/places_travel_buffer/);
  });
});

describe("app.settings home travel columns", () => {
  it("are empty at first, and the user can set and clear them on their own row only", async () => {
    expect(await as(alice, "select home_travel_mode, home_travel_buffer_minutes from app.settings")).toEqual([{ home_travel_mode: null, home_travel_buffer_minutes: null }]);
    await as(alice, "update app.settings set home_travel_mode = 'cycling', home_travel_buffer_minutes = 0");
    expect(await as(alice, "select home_travel_mode, home_travel_buffer_minutes from app.settings")).toEqual([{ home_travel_mode: "cycling", home_travel_buffer_minutes: 0 }]);
    expect(await as(bob, "select home_travel_mode from app.settings")).toEqual([{ home_travel_mode: null }]);
    await expect(as(alice, "update app.settings set home_travel_mode = 'flying'")).rejects.toThrow(/settings_home_travel_mode/);
    await expect(as(alice, "update app.settings set home_travel_buffer_minutes = 121")).rejects.toThrow(/settings_home_travel_buffer/);
  });
});
