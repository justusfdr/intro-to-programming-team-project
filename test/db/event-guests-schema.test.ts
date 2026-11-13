// Tests for supabase/migrations/*_event_guests.sql (spec 24): the user writes the guests of their own
// events only (R3), only while Outlook is connected, never on an event of a series or a demo event,
// never on an Outlook event (R11's trigger), and only plain lower-case addresses, each once, at most
// 20; the organizer is never the user's to write; the import takes Outlook's attendees and organizer,
// and an import without them (the code on main) leaves the guests as they are.
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

const connect = (user: string) => as(user, "select app.outlook_connect('v1.nonce.cipher')");

const TIMES = { start: "2026-11-17T09:00:00Z", end: "2026-11-17T10:00:00Z" };
const WINDOW = ["2026-11-09T09:00:00Z", "2027-01-15T09:00:00Z"];
const LECTURE = { outlook_id: "AAMk-1", title: "Lecture", all_day: false, start_at: "2026-11-17T09:00:00Z", end_at: "2026-11-17T10:00:00Z", location: "Room 2" };

const importAs = (user: string, events: unknown[]) =>
  as(user, "select app.outlook_import($1::timestamptz, $2::timestamptz, $3::text::jsonb)", [...WINDOW, JSON.stringify(events)]);

const guestsOf = async (id: string) =>
  (await db.admin<{ guests: string[] | null }>("select guests from app.events where id = $1", [id]))[0]?.guests;

const setGuests = (user: string, id: string, guests: string[] | null) =>
  as(user, "update app.events set guests = $2::text[] where id = $1", [id, guests]);

describe("the user's own events", () => {
  it("may be written with guests and get new ones while Outlook is connected; updated_at moves on (R4)", async () => {
    await connect(alice);
    const [row] = await as<{ id: string; guests: string[] }>(
      alice,
      "insert into app.events (title, start_at, end_at, guests) values ('Study group', $1, $2, $3::text[]) returning id, guests",
      [TIMES.start, TIMES.end, ["lea@example.com"]],
    );
    expect(row.guests).toEqual(["lea@example.com"]);
    const [before] = await db.admin<{ updated_at: Date }>("select updated_at from app.events where id = $1", [row.id]);
    await setGuests(alice, row.id, ["lea@example.com", "tom@uni.example.org"]);
    expect(await guestsOf(row.id)).toEqual(["lea@example.com", "tom@uni.example.org"]);
    const [after] = await db.admin<{ updated_at: Date }>("select updated_at from app.events where id = $1", [row.id]);
    expect(new Date(after.updated_at).getTime()).toBeGreaterThan(new Date(before.updated_at).getTime());
    // Removing all of them leaves an empty list (Outlook then gets an empty list too).
    await setGuests(alice, row.id, []);
    expect(await guestsOf(row.id)).toEqual([]);
  });

  it("has no guests unless the user sets them (the code on main writes events as before)", async () => {
    const { id } = await seedEvent(db, alice, TIMES);
    expect(await guestsOf(id)).toBeNull();
    const [row] = await as<{ guests: string[] | null; organizer: string | null }>(
      alice,
      "insert into app.events (title, start_at, end_at) values ('Lunch', $1, $2) returning guests, organizer",
      [TIMES.start, TIMES.end],
    );
    expect(row).toEqual({ guests: null, organizer: null });
  });

  it("refuses guests without a connected Outlook: 'Connect Outlook to invite guests', also when it needs reconnecting", async () => {
    const { id } = await seedEvent(db, alice, TIMES);
    await expect(setGuests(alice, id, ["lea@example.com"])).rejects.toThrow("Connect Outlook to invite guests");
    await expect(
      as(alice, "insert into app.events (title, start_at, end_at, guests) values ('x', $1, $2, $3::text[])", [TIMES.start, TIMES.end, ["lea@example.com"]]),
    ).rejects.toThrow("Connect Outlook to invite guests");
    await connect(alice);
    await as(alice, "select app.outlook_needs_reconnect()");
    await expect(setGuests(alice, id, ["lea@example.com"])).rejects.toThrow("Connect Outlook to invite guests");
    expect(await guestsOf(id)).toBeNull();
    // Another user's connection does not count.
    await connect(bob);
    await expect(setGuests(alice, id, ["lea@example.com"])).rejects.toThrow("Connect Outlook to invite guests");
  });

  it("does not let a change of other fields trip over the connection", async () => {
    await connect(alice);
    const { id } = await seedEvent(db, alice, TIMES);
    await setGuests(alice, id, ["lea@example.com"]);
    await db.admin("delete from app.calendar_connections");
    await as(alice, "update app.events set title = 'Renamed' where id = $1", [id]);
    expect(await db.admin("select title, guests from app.events where id = $1", [id])).toEqual([{ title: "Renamed", guests: ["lea@example.com"] }]);
  });

  it("does not find another user's event (R3)", async () => {
    await connect(alice);
    const { id } = await seedEvent(db, bob, TIMES);
    expect(await as(alice, "update app.events set guests = $2::text[] where id = $1 returning id", [id, ["eve@example.com"]])).toEqual([]);
    expect(await guestsOf(id)).toBeNull();
  });

  it.each([
    ["21 guests", Array.from({ length: 21 }, (_, i) => `g${i}@example.com`)],
    ["a capital letter", ["Lea@example.com"]],
    ["a name with the address", ["Lea <lea@example.com>"]],
    ["no domain", ["lea@"]],
    ["no dot in the domain", ["lea@localhost"]],
    ["a space", ["lea @example.com"]],
    ["the same address twice", ["lea@example.com", "lea@example.com"]],
    ["an empty entry", [""]],
    ["255 characters", [`${"a".repeat(64)}@${"b".repeat(186)}.com`]],
  ])("refuses %s (events_guests_shape)", async (_what, guests) => {
    await connect(alice);
    const { id } = await seedEvent(db, alice, TIMES);
    await expect(setGuests(alice, id, guests)).rejects.toThrow(/events_guests_shape/);
    expect(await guestsOf(id)).toBeNull();
  });

  it("refuses a missing entry and a list of lists", async () => {
    await connect(alice);
    const { id } = await seedEvent(db, alice, TIMES);
    await expect(as(alice, "update app.events set guests = array['lea@example.com', null] where id = $1", [id])).rejects.toThrow(/events_guests_shape/);
    await expect(as(alice, "update app.events set guests = array[array['a@example.com']] where id = $1", [id])).rejects.toThrow(/events_guests_shape/);
  });

  it("accepts exactly 20 guests and an address of 254 characters", async () => {
    await connect(alice);
    const { id } = await seedEvent(db, alice, TIMES);
    const twenty = Array.from({ length: 20 }, (_, i) => `g${i}@example.com`);
    await setGuests(alice, id, twenty);
    expect(await guestsOf(id)).toEqual(twenty);
    const long = `${"a".repeat(64)}@${"b".repeat(185)}.com`;
    expect(long).toHaveLength(254);
    await setGuests(alice, id, [long]);
    expect(await guestsOf(id)).toEqual([long]);
  });

  it("refuses guests on an event of a series and on a demo event (events_guests_single)", async () => {
    await connect(alice);
    await expect(
      as(alice, "insert into app.events (title, start_at, end_at, series_id, guests) values ('Gym', $1, $2, gen_random_uuid(), $3::text[])", [
        TIMES.start,
        TIMES.end,
        ["lea@example.com"],
      ]),
    ).rejects.toThrow(/events_guests_single/);
    await expect(
      as(alice, "insert into app.events (title, start_at, end_at, demo, guests) values ('Gym', $1, $2, true, $3::text[])", [TIMES.start, TIMES.end, ["lea@example.com"]]),
    ).rejects.toThrow(/events_guests_single/);
  });

  it("never lets the user write the organizer", async () => {
    await connect(alice);
    const { id } = await seedEvent(db, alice, TIMES);
    await expect(as(alice, "update app.events set organizer = 'alice@example.com' where id = $1", [id])).rejects.toThrow(/permission denied/);
    await expect(
      as(alice, "insert into app.events (title, start_at, end_at, organizer) values ('x', $1, $2, 'alice@example.com')", [TIMES.start, TIMES.end]),
    ).rejects.toThrow(/permission denied/);
    // Not even the owner may put an organizer on an app event.
    await expect(db.admin("update app.events set organizer = 'alice@example.com' where id = $1", [id])).rejects.toThrow(/events_organizer_shape/);
  });
});

describe("Outlook events (R11)", () => {
  it("the import takes attendees and organizer: lower-cased, plain addresses, each once, without the organizer", async () => {
    await importAs(alice, [
      {
        ...LECTURE,
        organizer: "Prof@Uni.example.org",
        attendees: ["lea@example.com", "LEA@example.com", "prof@uni.example.org", "Room 2.14", "tom@example.com", 42, null],
      },
    ]);
    expect(await db.admin("select guests, organizer from app.events where outlook_id = 'AAMk-1'")).toEqual([
      { guests: ["lea@example.com", "tom@example.com"], organizer: "prof@uni.example.org" },
    ]);
  });

  it("the user cannot change an Outlook event's guests: 'Change this event in Outlook' (keep_outlook_events)", async () => {
    await connect(alice);
    await importAs(alice, [{ ...LECTURE, organizer: "prof@uni.example.org", attendees: ["lea@example.com"] }]);
    const [row] = await db.admin<{ id: string }>("select id from app.events where outlook_id = 'AAMk-1'");
    for (const guests of [["eve@example.com"], [], null]) {
      await expect(setGuests(alice, row.id, guests)).rejects.toThrow("Change this event in Outlook");
    }
    expect(await guestsOf(row.id)).toEqual(["lea@example.com"]);
  });

  it("keeps at most 100 attendees of an Outlook event", async () => {
    const many = Array.from({ length: 150 }, (_, i) => `s${i}@uni.example.org`);
    await importAs(alice, [{ ...LECTURE, attendees: many }]);
    const [row] = await db.admin<{ guests: string[] }>("select guests from app.events where outlook_id = 'AAMk-1'");
    expect(row.guests).toEqual(many.slice(0, 100));
  });

  it("a new import updates changed attendees and leaves unchanged ones as they are (updated_at)", async () => {
    await importAs(alice, [{ ...LECTURE, attendees: ["lea@example.com"] }]);
    const [before] = await db.admin<{ updated_at: Date }>("select updated_at from app.events where outlook_id = 'AAMk-1'");
    await importAs(alice, [{ ...LECTURE, attendees: ["lea@example.com"] }]);
    const [same] = await db.admin<{ updated_at: Date }>("select updated_at from app.events where outlook_id = 'AAMk-1'");
    expect(same.updated_at).toEqual(before.updated_at);
    await importAs(alice, [{ ...LECTURE, attendees: ["lea@example.com", "tom@example.com"], organizer: "prof@uni.example.org" }]);
    expect(await db.admin("select guests, organizer from app.events where outlook_id = 'AAMk-1'")).toEqual([
      { guests: ["lea@example.com", "tom@example.com"], organizer: "prof@uni.example.org" },
    ]);
    await importAs(alice, [{ ...LECTURE, attendees: [], organizer: null }]);
    expect(await db.admin("select guests, organizer from app.events where outlook_id = 'AAMk-1'")).toEqual([{ guests: null, organizer: null }]);
  });

  it("an import without attendees (the code on main) does everything as before and keeps the guests", async () => {
    await importAs(alice, [{ ...LECTURE, attendees: ["lea@example.com"], organizer: "prof@uni.example.org" }]);
    await importAs(alice, [{ ...LECTURE, title: "Lecture (room 3)" }]);
    expect(await db.admin("select title, guests, organizer from app.events where outlook_id = 'AAMk-1'")).toEqual([
      { title: "Lecture (room 3)", guests: ["lea@example.com"], organizer: "prof@uni.example.org" },
    ]);
    await importAs(alice, [{ ...LECTURE, outlook_id: "AAMk-2", title: "New" }]);
    expect(await db.admin("select outlook_id, guests, organizer from app.events where source = 'outlook' order by outlook_id")).toEqual([
      { outlook_id: "AAMk-2", guests: null, organizer: null },
    ]);
  });

  it("does not import the user's own event with guests again", async () => {
    await connect(alice);
    const { id, updatedAt } = await seedEvent(db, alice, { ...TIMES, title: "Study group" });
    await setGuests(alice, id, ["lea@example.com"]);
    await as(alice, "select app.outlook_mark_sent($1::text::jsonb)", [JSON.stringify([{ event_id: id, version: updatedAt, outlook_id: "AAMk-own" }])]);
    await importAs(alice, [{ ...LECTURE, outlook_id: "AAMk-own", title: "Study group", attendees: ["lea@example.com"], organizer: "alice@example.com" }]);
    expect(await db.admin("select source, guests, organizer from app.events where user_id = $1", [alice])).toEqual([
      { source: "app", guests: ["lea@example.com"], organizer: null },
    ]);
  });

  it("never touches another user's rows", async () => {
    await importAs(bob, [{ ...LECTURE, attendees: ["lea@example.com"] }]);
    await importAs(alice, [{ ...LECTURE, attendees: ["eve@example.com"] }]);
    expect(await db.admin("select guests from app.events where user_id = $1", [bob])).toEqual([{ guests: ["lea@example.com"] }]);
  });
});
