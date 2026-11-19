// Tests for the calendar's views on the server (spec 14): which days a view reads, where previous and
// next go, the default view from the settings, and that every event shows on each day it touches.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { withEventChange } from "@/lib/events/week-view";
import { loadCalendarPage } from "@/lib/server/pages/load";
import { loadSettingsPage } from "@/lib/server/settings-page";
import { createTestApp, type TestApp } from "@test/support/app";
import { countingWithUser } from "@test/support/counting";
import { seedAllDay, seedEvent } from "@test/support/events";
import { EVENT_COLUMNS, toEventDto, type EventRow } from "./rows";
import { loadCalendar, loadWeek } from "./week";

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.reset(); // Monday 16 November 2026, 09:00 UTC
});

const LISBON = { timeZone: "Europe/Lisbon" }; // UTC+0 in November: local times read as UTC

describe("which days a view reads", () => {
  it("day: one day, previous and next one day apart; today when the address names none", async () => {
    const alice = await app.signedInAs("alice@example.com", LISBON);
    const day = await loadCalendar(app.deps, alice, "day", "2026-11-18");
    expect(day.days.map((d) => d.date)).toEqual(["2026-11-18"]);
    expect([day.view, day.date, day.previous, day.next, day.monday, day.today]).toEqual([
      "day", "2026-11-18", "2026-11-17", "2026-11-19", "2026-11-16", "2026-11-16",
    ]);
    const today = await loadCalendar(app.deps, alice, "day");
    expect(today.days.map((d) => [d.date, d.isToday])).toEqual([["2026-11-16", true]]);
  });

  it("week: Monday to Sunday, moving by its Monday, as before", async () => {
    const alice = await app.signedInAs("alice@example.com", LISBON);
    const week = await loadCalendar(app.deps, alice, "week", "2026-11-25");
    expect(week).toEqual(await loadWeek(app.deps, alice, "2026-11-25"));
    expect(week.days.map((d) => d.date)).toEqual(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"]);
    expect([week.view, week.previous, week.next]).toEqual(["week", "2026-11-16", "2026-11-30"]);
  });

  it("month: the 6 × 7 grid from the Monday before the 1st; previous and next one month apart, kept inside the month", async () => {
    const alice = await app.signedInAs("alice@example.com", LISBON);
    const month = await loadCalendar(app.deps, alice, "month", "2026-11-18");
    expect(month.days).toHaveLength(42);
    expect([month.days[0].date, month.days[41].date]).toEqual(["2026-10-26", "2026-12-06"]);
    expect([month.previous, month.next]).toEqual(["2026-10-18", "2026-12-18"]);
    const january = await loadCalendar(app.deps, alice, "month", "2027-01-31");
    expect(january.next).toBe("2027-02-28");
  });

  it("falls back to today for a day that is not a date", async () => {
    const alice = await app.signedInAs("alice@example.com", LISBON);
    expect((await loadCalendar(app.deps, alice, "day", "2026-02-30")).date).toBe("2026-11-16");
    expect((await loadCalendar(app.deps, alice, "month", "'; drop table app.events; --")).date).toBe("2026-11-16");
  });

  it("reads only the signed-in user's events (R3)", async () => {
    const bob = await app.signedInAs("bob@example.com", LISBON);
    await seedEvent(app.db, bob, { title: "Bob's", start: "2026-11-18T09:00:00Z", end: "2026-11-18T10:00:00Z" });
    const alice = await app.signedInAs("alice@example.com", LISBON);
    await seedEvent(app.db, alice, { title: "Alice's", start: "2026-11-18T09:00:00Z", end: "2026-11-18T10:00:00Z" });
    const month = await loadCalendar(app.deps, alice, "month", "2026-11-01");
    expect(month.days.flatMap((d) => d.events.map((e) => e.title))).toEqual(["Alice's"]);
  });
});

describe("every event on each day it touches", () => {
  it("a day shows an event of the day before that runs past midnight into it, apart from its own events (R2)", async () => {
    const alice = await app.signedInAs("alice@example.com", LISBON);
    await seedEvent(app.db, alice, { title: "Night shift", start: "2026-11-17T22:00:00Z", end: "2026-11-18T02:00:00Z" });
    await seedEvent(app.db, alice, { title: "Ends at midnight", start: "2026-11-17T22:00:00Z", end: "2026-11-18T00:00:00Z" });
    await seedEvent(app.db, alice, { title: "Lecture", start: "2026-11-18T09:00:00Z", end: "2026-11-18T10:00:00Z" });
    const day = await loadCalendar(app.deps, alice, "day", "2026-11-18");
    expect(day.days[0].events.map((e) => e.title)).toEqual(["Lecture"]);
    expect(day.lead.map((e) => [e.title, e.endLocal])).toEqual([["Night shift", "2026-11-18T02:00"]]);
    // The day before has it as its own event, and nothing running into it.
    const before = await loadCalendar(app.deps, alice, "day", "2026-11-17");
    expect(before.days[0].events.map((e) => e.title)).toEqual(["Ends at midnight", "Night shift"]);
    expect(before.lead).toEqual([]);
  });

  it("the week and the month have the Sunday-night event of the week before on their first Monday", async () => {
    const alice = await app.signedInAs("alice@example.com", LISBON);
    await seedEvent(app.db, alice, { title: "Late film", start: "2026-11-15T23:00:00Z", end: "2026-11-16T01:00:00Z" });
    expect((await loadWeek(app.deps, alice)).lead.map((e) => e.title)).toEqual(["Late film"]);
    // In the month grid (from Oct 26) it is an ordinary event of Sunday the 15th.
    const month = await loadCalendar(app.deps, alice, "month", "2026-11-16");
    expect(month.lead).toEqual([]);
    expect(month.days.find((d) => d.date === "2026-11-15")?.events.map((e) => e.title)).toEqual(["Late film"]);
  });

  it("an all-day event is on every day of the view it covers, also when it starts before the view", async () => {
    const alice = await app.signedInAs("alice@example.com", LISBON);
    await seedAllDay(app.db, alice, { title: "Trip", firstDay: "2026-10-30", lastDay: "2026-11-02" });
    const month = await loadCalendar(app.deps, alice, "month", "2026-11-10");
    expect(month.days.filter((d) => d.allDay.length > 0).map((d) => d.date)).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    const day = await loadCalendar(app.deps, alice, "day", "2026-11-01");
    expect(day.days[0].allDay.map((e) => e.title)).toEqual(["Trip"]);
    // Outside the grid: not read.
    expect((await loadCalendar(app.deps, alice, "month", "2026-12-10")).days.flatMap((d) => d.allDay)).toEqual([]);
  });

  it("shows a change to an event running into the first day at once, as the next read will (withEventChange)", async () => {
    const alice = await app.signedInAs("alice@example.com", LISBON);
    const night = await seedEvent(app.db, alice, { title: "Night shift", start: "2026-11-17T22:00:00Z", end: "2026-11-18T02:00:00Z" });
    const before = await loadCalendar(app.deps, alice, "day", "2026-11-18");
    await app.db.admin("update app.events set end_at = '2026-11-18T03:00:00Z' where id = $1", [night.id]);
    const [row] = await app.db.admin<EventRow>(`select ${EVENT_COLUMNS} from app.events where id = $1`, [night.id]);
    const after = await loadCalendar(app.deps, alice, "day", "2026-11-18");
    expect(withEventChange(before, { event: toEventDto(row) })).toEqual(after);
    expect(after.lead.map((e) => e.endLocal)).toEqual(["2026-11-18T03:00"]);
    expect(withEventChange(after, { removed: night.id }).lead).toEqual([]);
  });
});

describe("the calendar page's view", () => {
  it("opens the default view from the settings when the address names none, and the address's view otherwise", async () => {
    const alice = await app.signedInAs("alice@example.com", LISBON);
    expect((await loadCalendarPage(app.deps, alice)).week.view).toBe("week");
    await app.db.admin("update app.settings set default_view = 'month' where user_id = $1", [alice]);
    const page = await loadCalendarPage(app.deps, alice);
    expect([page.week.view, page.week.days.length]).toEqual(["month", 42]);
    const day = await loadCalendarPage(app.deps, alice, "2026-11-20", "day");
    expect([day.week.view, day.week.days.map((d) => d.date)]).toEqual(["day", ["2026-11-20"]]);
    expect(day.week).toEqual(await loadCalendar(app.deps, alice, "day", "2026-11-20"));
  });

  it("the settings page shows the saved default view", async () => {
    const alice = await app.signedInAs("alice@example.com", LISBON);
    expect((await loadSettingsPage(app.deps, alice)).defaultView).toBe("week");
    await app.db.admin("update app.settings set default_view = 'day' where user_id = $1", [alice]);
    expect((await loadSettingsPage(app.deps, alice)).defaultView).toBe("day");
  });

  it("reads a month in the same 2 transactions as a week", async () => {
    const alice = await app.signedInAs("alice@example.com", LISBON);
    await app.db.admin("update app.settings set default_view = 'month' where user_id = $1", [alice]);
    const { withUser, transactions } = countingWithUser(app.db);
    const page = await loadCalendarPage({ withUser, now: app.deps.now }, alice);
    expect(page.week.view).toBe("month");
    expect(transactions).toHaveLength(2);
  });
});

describe("the day view's all-day row", () => {
  it("day: also reads the all-day events of its whole week, but lists on the day only those covering it", async () => {
    const alice = await app.signedInAs("alice@example.com", LISBON);
    await seedAllDay(app.db, alice, { title: "Tuesday trip", firstDay: "2026-11-17", lastDay: "2026-11-17" });
    await seedAllDay(app.db, alice, { title: "Exam week", firstDay: "2026-11-18", lastDay: "2026-11-20" });
    await seedAllDay(app.db, alice, { title: "Next week", firstDay: "2026-11-23", lastDay: "2026-11-23" });
    const day = await loadCalendar(app.deps, alice, "day", "2026-11-19");
    expect(day.weekAllDay?.map((e) => e.title)).toEqual(["Tuesday trip", "Exam week"]);
    expect(day.days[0].allDay.map((e) => e.title)).toEqual(["Exam week"]);
  });

  it("week and month: no extra list, their days already hold them", async () => {
    const alice = await app.signedInAs("alice@example.com", LISBON);
    await seedAllDay(app.db, alice, { title: "Exam week", firstDay: "2026-11-18", lastDay: "2026-11-20" });
    expect((await loadCalendar(app.deps, alice, "week", "2026-11-19")).weekAllDay).toBeUndefined();
    expect((await loadCalendar(app.deps, alice, "month", "2026-11-19")).weekAllDay).toBeUndefined();
  });
});
