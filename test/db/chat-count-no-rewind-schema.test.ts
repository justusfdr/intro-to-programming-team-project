// Tests for supabase/migrations/20261201000000_chat_count_no_rewind.sql: the coach's day counter (R21)
// starts again only on a later day. Moving the time zone back to an earlier day never gives new messages.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./harness";

let db: TestDb;
let alice: string;
let bob: string;

// The zone furthest east (UTC+14) and the one furthest west (UTC-12): their dates differ by a day or two.
const EAST = "Pacific/Kiritimati";
const WEST = "Etc/GMT+12";

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.admin("delete from auth.users");
  alice = await db.createUser("alice@example.com", { confirmed: true, timeZone: WEST });
  bob = await db.createUser("bob@example.com", { confirmed: true, timeZone: WEST });
});

const count = (userId: string) =>
  db.withUser(userId, async (q) => (await q<{ ok: boolean }>("select app.chat_count_message() as ok"))[0].ok);

const profile = async (userId: string) =>
  (await db.admin<{ chat_count: number; chat_count_date: string | null }>(
    "select chat_count, chat_count_date::text as chat_count_date from app.profiles where id = $1",
    [userId],
  ))[0];

/** Today in a time zone, on the database's clock. */
const todayIn = async (zone: string) =>
  (await db.admin<{ d: string }>("select ((now() at time zone $1::text)::date)::text as d", [zone]))[0].d;

/** The user changes their time zone (as update_settings would). */
const moveZone = (userId: string, zone: string) =>
  db.admin("update app.settings set time_zone = $2 where user_id = $1", [userId, zone]);

const fill = async (userId: string, times: number) => {
  for (let i = 1; i <= times; i++) expect(await count(userId), `message ${i}`).toBe(true);
};

describe("the day counter cannot be wound back by the time zone (R21)", () => {
  it("starts again at 1 on the next day", async () => {
    await db.admin("update app.profiles set chat_count = 20, chat_count_date = $2::date - 1 where id = $1", [alice, await todayIn(WEST)]);
    expect(await count(alice)).toBe(true);
    expect(await profile(alice)).toEqual({ chat_count: 1, chat_count_date: await todayIn(WEST) });
  });

  it("counts the first message ever as 1", async () => {
    expect(await profile(alice)).toEqual({ chat_count: 0, chat_count_date: null });
    expect(await count(alice)).toBe(true);
    expect(await profile(alice)).toEqual({ chat_count: 1, chat_count_date: await todayIn(WEST) });
  });

  it("allows 20 messages, then refuses without changing anything", async () => {
    await fill(alice, 20);
    expect(await count(alice)).toBe(false);
    expect(await profile(alice)).toEqual({ chat_count: 20, chat_count_date: await todayIn(WEST) });
    expect(await count(bob)).toBe(true);
  });

  it("does not start again when the zone moves to an earlier date", async () => {
    await moveZone(alice, EAST);
    await fill(alice, 20);
    const eastDay = await todayIn(EAST);
    await moveZone(alice, WEST);
    expect(await todayIn(WEST) < eastDay).toBe(true);
    expect(await count(alice)).toBe(false);
    expect(await profile(alice)).toEqual({ chat_count: 20, chat_count_date: eastDay });
  });

  it("an earlier date still counts against the stored day's messages", async () => {
    await moveZone(alice, EAST);
    await fill(alice, 5);
    const eastDay = await todayIn(EAST);
    await moveZone(alice, WEST);
    await fill(alice, 15);
    expect(await profile(alice)).toEqual({ chat_count: 20, chat_count_date: eastDay });
    expect(await count(alice)).toBe(false);
  });

  it("moving forward starts again once; moving back and forward again does not", async () => {
    await fill(alice, 20);
    expect(await count(alice)).toBe(false);

    await moveZone(alice, EAST);
    expect(await count(alice)).toBe(true);
    expect(await profile(alice)).toEqual({ chat_count: 1, chat_count_date: await todayIn(EAST) });
    await fill(alice, 19);
    expect(await count(alice)).toBe(false);

    await moveZone(alice, WEST);
    expect(await count(alice)).toBe(false);
    await moveZone(alice, EAST);
    expect(await count(alice)).toBe(false);
    expect(await profile(alice)).toEqual({ chat_count: 20, chat_count_date: await todayIn(EAST) });
  });

  it("two calls at the same moment at 19 after moving back: only one gets the 20th message", async () => {
    await moveZone(alice, EAST);
    await fill(alice, 19);
    await moveZone(alice, WEST);
    const results = await Promise.all([count(alice), count(alice)]);
    expect(results.sort()).toEqual([false, true]);
    expect((await profile(alice)).chat_count).toBe(20);
  });
});
