// Tests for supabase/migrations/*_shares.sql (spec 29): a share belongs to an owner and one of their
// contacts and hangs on the contact row (R47); a shared calendar gives only the reduced shape of its
// level and never demo events (R48); a shared focus chart gives only weekly and daily totals in the
// owner's time zone (R49); nobody writes anything of the owner's (R50). "Not found" alike for no share,
// no contact and no such user.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./harness";

let db: TestDb;
let ana: string;
let ben: string;
let carl: string;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db.close();
});

const as = <T extends Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) =>
  db.withUser(user, (q) => q<T>(sql, params));

/** Makes two users contacts the way the app does: one invites, the other accepts. Returns the contact row's id. */
async function connect(a: string, b: string, bEmail: string): Promise<string> {
  await as(a, "select app.invite_contact($1)", [bEmail]);
  const [inv] = await as<{ id: string }>(b, "select id from app.contact_cards() where kind = 'received'");
  await as(b, "select app.answer_invitation($1::uuid, $2::boolean)", [inv.id, true]);
  const [c] = await as<{ id: string }>(a, "select id from app.contacts");
  return c.id;
}

const share = (user: string, contactId: string, calendar: string, focus: boolean) =>
  as(user, "select app.set_share($1::uuid, $2::text, $3::boolean)", [contactId, calendar, focus]);

type CalRow = {
  level: string;
  all_day: boolean;
  start_at: Date | null;
  end_at: Date | null;
  first_day: string | null;
  last_day: string | null;
  title: string | null;
  location: string | null;
};
const calendarOf = (viewer: string, owner: string, from = "2026-11-16T00:00:00Z", to = "2026-11-23T00:00:00Z") =>
  as<CalRow>(
    viewer,
    `select level, all_day, start_at, end_at, first_day::text as first_day, last_day::text as last_day, title, location
       from app.shared_calendar($1::uuid, $2::timestamptz, $3::timestamptz)`,
    [owner, from, to],
  );
const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

async function seedTimed(user: string, title: string, start: string, end: string, extra: { location?: string; notes?: string; guests?: string[]; demo?: boolean; mayOverlap?: boolean } = {}) {
  const [row] = await db.admin<{ id: string }>(
    `insert into app.events (user_id, title, start_at, end_at, location, notes, guests, demo, may_overlap)
     values ($1, $2, $3::timestamptz, $4::timestamptz, $5, $6, $7::text[], $8, $9) returning id`,
    [user, title, start, end, extra.location ?? null, extra.notes ?? null, extra.guests ?? null, extra.demo ?? false, extra.mayOverlap ?? false],
  );
  return row.id;
}

async function seedAllDay(user: string, title: string, first: string, last: string, demo = false) {
  await db.admin("insert into app.events (user_id, title, all_day, first_day, last_day, demo) values ($1, $2, true, $3::date, $4::date, $5)", [user, title, first, last, demo]);
}

/** Every row of every table, to prove that something changed nothing. */
const everything = () =>
  Promise.all(["shares", "contacts", "events", "focus_sessions", "event_todos"].map((t) => db.admin(`select * from app.${t} order by 1`)));

let contact: string;

beforeEach(async () => {
  await db.admin("delete from auth.users");
  ana = await db.createUser("ana@example.com", { confirmed: true, timeZone: "Europe/Lisbon" });
  ben = await db.createUser("ben@example.com", { confirmed: true });
  carl = await db.createUser("carl@example.com", { confirmed: true });
  contact = await connect(ana, ben, "ben@example.com");
});

describe("set_share and the table (R47)", () => {
  it("the owner sets what one contact sees; the viewer reads it; sharing is one-directional", async () => {
    await share(ana, contact, "busy", true);
    const own = await as(ana, "select owner, viewer, calendar, focus from app.shares");
    expect(own).toEqual([{ owner: ana, viewer: ben, calendar: "busy", focus: true }]);
    expect(await as(ben, "select owner, viewer, calendar, focus from app.shares")).toEqual(own);
    // Ben shares nothing back by this.
    expect(await as(ben, "select direction, user_id, calendar, focus from app.shares_overview()")).toEqual([
      { direction: "in", user_id: ana, calendar: "busy", focus: true },
    ]);
    expect(await as(ana, "select direction, contact_id, user_id from app.shares_overview()")).toEqual([{ direction: "out", contact_id: contact, user_id: ben }]);
    // Changing it replaces the row; sharing nothing removes it.
    await share(ana, contact, "details", false);
    expect(await as(ana, "select calendar, focus from app.shares")).toEqual([{ calendar: "details", focus: false }]);
    await share(ana, contact, "none", false);
    expect(await db.admin("select * from app.shares")).toEqual([]);
  });

  it("both directions are separate rows on the same contact", async () => {
    await share(ana, contact, "busy", false);
    await share(ben, contact, "details", true);
    const rows = await db.admin<{ owner: string; calendar: string }>("select owner, calendar from app.shares order by calendar");
    expect(rows).toEqual([{ owner: ana, calendar: "busy" }, { owner: ben, calendar: "details" }]);
  });

  it("a third user, an unknown contact row and a bad level are refused; nothing changes", async () => {
    await share(ana, contact, "busy", false);
    const before = await everything();
    await expect(share(carl, contact, "details", true)).rejects.toThrow("Not found");
    await expect(as(carl, "select app.set_share(gen_random_uuid(), 'busy', true)")).rejects.toThrow("Not found");
    await expect(share(ana, contact, "everything", true)).rejects.toThrow("Choose what to share");
    await expect(as(ana, "select app.set_share($1::uuid, null, true)", [contact])).rejects.toThrow("Choose what to share");
    expect(await everything()).toEqual(before);
    expect(await as(carl, "select * from app.shares")).toEqual([]);
    expect(await as(carl, "select * from app.shares_overview()")).toEqual([]);
  });

  it("the viewer cannot write a share for themselves, and nobody writes the table directly", async () => {
    await share(ana, contact, "none", true);
    // Ben calling set_share on the same contact sets only what HE shares with Ana.
    await share(ben, contact, "details", true);
    expect(await db.admin("select calendar from app.shares where owner = $1", [ana])).toEqual([{ calendar: "none" }]);
    await expect(as(ben, "update app.shares set calendar = 'details' where owner = $1", [ana])).rejects.toThrow(/permission denied/);
    await expect(
      as(ben, "insert into app.shares (contact_id, owner, viewer, calendar) values ($1, $2, $3, 'details')", [contact, ana, ben]),
    ).rejects.toThrow(/permission denied/);
    await expect(as(ana, "delete from app.shares")).rejects.toThrow(/permission denied/);
  });

  it("the table refuses a share between people who are not the contact's two, and a share with oneself", async () => {
    await expect(
      db.admin("insert into app.shares (contact_id, owner, viewer, calendar) values ($1, $2, $3, 'busy')", [contact, ana, carl]),
    ).rejects.toThrow(/belongs to the two people of its contact/);
    await expect(
      db.admin("insert into app.shares (contact_id, owner, viewer, calendar) values ($1, $2, $2, 'busy')", [contact, ana]),
    ).rejects.toThrow();
    await expect(
      db.admin("insert into app.shares (contact_id, owner, viewer, calendar) values ($1, $2, $3, 'all')", [contact, ana, ben]),
    ).rejects.toThrow(/shares_calendar/);
  });

  it("removing the contact (either side) ends every share between the two at once", async () => {
    await share(ana, contact, "details", true);
    await share(ben, contact, "busy", true);
    await seedTimed(ana, "Lecture", "2026-11-17T09:00:00Z", "2026-11-17T10:00:00Z");
    expect(await calendarOf(ben, ana)).toHaveLength(1);
    await as(ben, "select app.remove_contact($1::uuid)", [contact]);
    expect(await db.admin("select * from app.shares")).toEqual([]);
    await expect(calendarOf(ben, ana)).rejects.toThrow("Not found");
    await expect(as(ben, "select * from app.shared_focus($1::uuid)", [ana])).rejects.toThrow("Not found");
    await expect(calendarOf(ana, ben)).rejects.toThrow("Not found");
  });

  it("deleting an account removes its shares in both directions", async () => {
    await share(ana, contact, "details", true);
    await share(ben, contact, "busy", false);
    await db.admin("delete from auth.users where id = $1", [ana]);
    expect(await db.admin("select * from app.shares")).toEqual([]);
  });
});

describe("shared_calendar (R48)", () => {
  beforeEach(async () => {
    await seedTimed(ana, "Statistics exam", "2026-11-17T09:00:00Z", "2026-11-17T11:00:00Z", {
      location: "Nova SBE, Carcavelos",
      notes: "Bring the calculator",
      guests: ["lea@example.com"],
    });
    await seedTimed(ana, "Study group", "2026-11-17T10:30:00Z", "2026-11-17T12:00:00Z", { mayOverlap: true });
    await seedTimed(ana, "Gym", "2026-11-18T18:00:00Z", "2026-11-18T19:00:00Z");
    await seedAllDay(ana, "Exam week", "2026-11-16", "2026-11-18");
    await seedTimed(ana, "Demo run", "2026-11-19T08:00:00Z", "2026-11-19T09:00:00Z", { demo: true });
    await seedAllDay(ana, "Demo trip", "2026-11-20", "2026-11-20", true);
    // Outside the window.
    await seedTimed(ana, "Later", "2026-12-01T09:00:00Z", "2026-12-01T10:00:00Z");
    const [ev] = await db.admin<{ id: string }>("select id from app.events where title = 'Statistics exam'");
    await db.admin("insert into app.event_todos (user_id, event_id, title, position) values ($1, $2, 'Read chapter 3', 0)", [ana, ev.id]);
  });

  it("busy: only times, overlapping blocks merged; never a title, place or anything else, even when the event has them", async () => {
    await share(ana, contact, "busy", false);
    const rows = await calendarOf(ben, ana);
    expect(rows.map((r) => ({ ...r, start_at: iso(r.start_at), end_at: iso(r.end_at) }))).toEqual([
      { level: "busy", all_day: false, start_at: "2026-11-17T09:00:00.000Z", end_at: "2026-11-17T12:00:00.000Z", first_day: null, last_day: null, title: null, location: null },
      { level: "busy", all_day: false, start_at: "2026-11-18T18:00:00.000Z", end_at: "2026-11-18T19:00:00.000Z", first_day: null, last_day: null, title: null, location: null },
      { level: "busy", all_day: true, start_at: null, end_at: null, first_day: "2026-11-16", last_day: "2026-11-18", title: null, location: null },
    ]);
    // The function's shape is fixed: nothing else can come out of it.
    const columns = await db.admin<{ name: string }>(
      `select unnest(proargnames[4:]) as name from pg_proc where proname = 'shared_calendar'`,
    );
    expect(columns.map((c) => c.name)).toEqual(["level", "all_day", "start_at", "end_at", "first_day", "last_day", "title", "location"]);
  });

  it("details: also title and place, each event on its own; never notes, guests, to-dos; never demo events", async () => {
    await share(ana, contact, "details", false);
    const rows = await calendarOf(ben, ana);
    expect(rows.map((r) => [r.level, r.title, r.location, r.all_day])).toEqual([
      ["details", "Statistics exam", "Nova SBE, Carcavelos", false],
      ["details", "Study group", null, false],
      ["details", "Gym", null, false],
      ["details", "Exam week", null, true],
    ]);
    const text = JSON.stringify(rows);
    for (const secret of ["Bring the calculator", "lea@example.com", "Read chapter 3", "Demo", "Later"]) expect(text).not.toContain(secret);
  });

  it("a third user, a contact without a share, a calendar of 'none' and an unknown id: the same 'Not found'", async () => {
    await expect(calendarOf(ben, ana)).rejects.toThrow("Not found");
    await share(ana, contact, "none", true);
    await expect(calendarOf(ben, ana)).rejects.toThrow("Not found");
    await share(ana, contact, "details", false);
    await expect(calendarOf(carl, ana)).rejects.toThrow("Not found");
    await expect(calendarOf(ben, carl)).rejects.toThrow("Not found");
    await expect(calendarOf(ben, "00000000-0000-4000-8000-000000000000")).rejects.toThrow("Not found");
    // The owner's own calendar through this function is not a share either.
    await expect(calendarOf(ana, ana)).rejects.toThrow("Not found");
  });

  it("refuses a window over 62 days or backwards; 62 days is fine", async () => {
    await share(ana, contact, "busy", false);
    await expect(calendarOf(ben, ana, "2026-11-01T00:00:00Z", "2027-01-02T00:00:01Z")).rejects.toThrow("Choose at most 62 days");
    await expect(calendarOf(ben, ana, "2026-11-20T00:00:00Z", "2026-11-19T00:00:00Z")).rejects.toThrow("Choose at most 62 days");
    expect(await calendarOf(ben, ana, "2026-11-01T00:00:00Z", "2027-01-02T00:00:00Z")).toHaveLength(4);
  });

  it("withdrawing stops it from the next request on; changes of the owner's events show at once", async () => {
    await share(ana, contact, "details", false);
    await db.admin("update app.events set title = 'Exam (moved)' where title = 'Gym'");
    expect((await calendarOf(ben, ana)).map((r) => r.title)).toContain("Exam (moved)");
    await share(ana, contact, "none", false);
    await expect(calendarOf(ben, ana)).rejects.toThrow("Not found");
  });

  it("the viewer still cannot read, change or delete the owner's rows directly (policies unchanged)", async () => {
    await share(ana, contact, "details", true);
    expect(await as(ben, "select id from app.events")).toEqual([]);
    expect(await as(ben, "select id from app.event_todos")).toEqual([]);
    const before = await everything();
    await as(ben, "update app.events set title = 'Hacked'");
    await as(ben, "delete from app.events");
    expect(await everything()).toEqual(before);
  });
});

describe("shared_focus (R49)", () => {
  async function seedSession(user: string, started: string, ended: string | null, planned = 60, paused = 0, status = "finished") {
    await db.admin(
      `insert into app.focus_sessions (user_id, planned_minutes, status, started_at, ended_at, paused_seconds, rating)
       values ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6, $7)`,
      [user, planned, status, started, ended, paused, status === "finished" ? 4 : null],
    );
  }
  type Bar = { kind: string; day: string; focused_minutes: number; sessions: number };
  const chartAt = (owner: string, now: string) =>
    db.admin<Bar>("select kind, day::text as day, focused_minutes, sessions from app.focus_chart_of($1::uuid, $2::timestamptz)", [owner, now]);

  it("8 weeks and this week's days, in the owner's time zone from Monday, with R13's focused minutes", async () => {
    // Ana is in Lisbon (UTC in November). Wednesday 18 Nov 2026, 12:00.
    await seedSession(ana, "2026-11-16T09:00:00Z", "2026-11-16T09:45:30Z", 60, 600); // 45.5 − 10 min → 35
    await seedSession(ana, "2026-11-18T08:00:00Z", "2026-11-18T08:30:00Z", 30); // 30
    await seedSession(ana, "2026-11-18T06:00:00Z", null, 30, 0, "running"); // past its planned end: finished by itself, 30
    await seedSession(ana, "2026-11-15T23:30:00Z", "2026-11-16T00:30:00Z", 60); // Sunday: last week, 60
    await seedSession(ana, "2026-09-28T10:00:00Z", "2026-09-28T11:00:00Z", 60); // Monday 7 weeks back: the oldest bar
    await seedSession(ana, "2026-09-27T10:00:00Z", "2026-09-27T11:00:00Z", 60); // the Sunday before it: too old
    const bars = await chartAt(ana, "2026-11-18T12:00:00Z");
    const weeks = bars.filter((b) => b.kind === "week");
    const days = bars.filter((b) => b.kind === "day");
    // The current week and the 7 before, oldest first; the session of 28 Sep is 7 weeks back, so counted.
    expect(weeks.map((w) => w.day)).toEqual(["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16"]);
    expect(weeks[0]).toEqual({ kind: "week", day: "2026-09-28", focused_minutes: 60, sessions: 1 });
    expect(weeks.find((w) => w.day === "2026-11-16")).toEqual({ kind: "week", day: "2026-11-16", focused_minutes: 95, sessions: 3 });
    expect(weeks.find((w) => w.day === "2026-11-09")).toEqual({ kind: "week", day: "2026-11-09", focused_minutes: 60, sessions: 1 });
    expect(days.map((d) => [d.day, d.focused_minutes, d.sessions])).toEqual([
      ["2026-11-16", 35, 1],
      ["2026-11-17", 0, 0],
      ["2026-11-18", 60, 2],
      ["2026-11-19", 0, 0],
      ["2026-11-20", 0, 0],
      ["2026-11-21", 0, 0],
      ["2026-11-22", 0, 0],
    ]);
  });

  it("leaves out a session that is still running or paused", async () => {
    await seedSession(ana, "2026-11-18T11:30:00Z", null, 60, 0, "running");
    const bars = await chartAt(ana, "2026-11-18T12:00:00Z");
    expect(bars.every((b) => b.focused_minutes === 0 && b.sessions === 0)).toBe(true);
  });

  it("cuts days in the owner's zone, not the viewer's", async () => {
    await db.admin("update app.settings set time_zone = 'America/New_York' where user_id = $1", [ana]);
    // Tuesday 17 Nov 02:00 UTC is Monday 16 Nov 21:00 in New York.
    await seedSession(ana, "2026-11-17T02:00:00Z", "2026-11-17T02:20:00Z", 30);
    const days = (await chartAt(ana, "2026-11-18T12:00:00Z")).filter((b) => b.kind === "day");
    expect(days.find((d) => d.focused_minutes > 0)).toEqual({ kind: "day", day: "2026-11-16", focused_minutes: 20, sessions: 1 });
  });

  it("is given only to a contact the owner shares it with; the same 'Not found' otherwise; only totals come out", async () => {
    await seedSession(ana, new Date(Date.now() - 3 * 3600_000).toISOString(), new Date(Date.now() - 2 * 3600_000).toISOString(), 60);
    const read = (viewer: string, owner: string) => as<Bar>(viewer, "select kind, day::text as day, focused_minutes, sessions from app.shared_focus($1::uuid)", [owner]);
    await expect(read(ben, ana)).rejects.toThrow("Not found");
    await share(ana, contact, "details", false);
    await expect(read(ben, ana)).rejects.toThrow("Not found");
    await share(ana, contact, "none", true);
    const bars = await read(ben, ana);
    expect(bars).toHaveLength(15);
    expect(Object.keys(bars[0]).sort()).toEqual(["day", "focused_minutes", "kind", "sessions"]);
    expect(bars.filter((b) => b.kind === "week").reduce((sum, b) => sum + b.sessions, 0)).toBe(1);
    await expect(read(carl, ana)).rejects.toThrow("Not found");
    await expect(read(ana, ben)).rejects.toThrow("Not found");
    await expect(read(ben, "00000000-0000-4000-8000-000000000000")).rejects.toThrow("Not found");
    // The viewer still reads none of the owner's sessions directly.
    expect(await as(ben, "select id from app.focus_sessions")).toEqual([]);
  });
});

describe("rights", () => {
  it("anon and public get nothing; internal functions are not callable by users", async () => {
    const [table] = await db.admin<{ yes: boolean }>("select has_table_privilege('anon', 'app.shares', 'select') as yes");
    expect(table.yes).toBe(false);
    for (const fn of ["app.set_share(uuid, text, boolean)", "app.shares_overview()", "app.shared_calendar(uuid, timestamptz, timestamptz)", "app.shared_focus(uuid)"]) {
      const [row] = await db.admin<{ anon: boolean; user: boolean }>(
        "select has_function_privilege('anon', $1, 'execute') as anon, has_function_privilege('authenticated', $1, 'execute') as user",
        [fn],
      );
      expect(row).toEqual({ anon: false, user: true });
    }
    for (const fn of ["app.focus_chart_of(uuid, timestamptz)", "app.calendar_level(uuid)", "app.check_share_contact()"]) {
      const [row] = await db.admin<{ yes: boolean }>("select has_function_privilege('authenticated', $1, 'execute') as yes", [fn]);
      expect(row.yes).toBe(false);
    }
    // Every function is security definer with an empty search path.
    const defs = await db.admin<{ name: string; definer: boolean; config: string[] | null }>(
      `select proname as name, prosecdef as definer, proconfig as config from pg_proc
        where proname in ('set_share', 'shares_overview', 'shared_calendar', 'shared_focus', 'focus_chart_of', 'calendar_level')`,
    );
    expect(defs).toHaveLength(6);
    for (const d of defs) {
      expect(d.definer).toBe(true);
      expect(d.config).toEqual(['search_path=""']);
    }
  });

  it("every function refuses a missing user", async () => {
    await expect(db.admin("select app.set_share($1::uuid, 'busy', true)", [contact])).rejects.toThrow("not signed in");
    await expect(db.admin("select * from app.shared_calendar($1::uuid, now(), now() + interval '1 day')", [ana])).rejects.toThrow("not signed in");
    await expect(db.admin("select * from app.shared_focus($1::uuid)", [ana])).rejects.toThrow("not signed in");
    expect(await db.admin("select * from app.shares_overview()")).toEqual([]);
  });

  it("the existing policies of events, sessions and settings are unchanged", async () => {
    const policies = await db.admin<{ tablename: string; qual: string }>(
      "select tablename, qual from pg_policies where schemaname = 'app' and tablename in ('events', 'focus_sessions', 'settings') and cmd = 'SELECT'",
    );
    expect(policies.length).toBeGreaterThan(0);
    for (const p of policies) expect(p.qual).toMatch(/^\(user_id = \( SELECT auth\.uid\(\) AS uid\)\)$/);
  });
});
