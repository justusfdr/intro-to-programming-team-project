// Tests for the week view's data (spec 02: week view, R2, R10, R3).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "@test/support/app";
import { seedEvent } from "@test/support/events";
import { loadWeek } from "./week";

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.reset(); // the fake clock stands at Monday 16 November 2026, 09:00 UTC
});

function titlesByDay(week: Awaited<ReturnType<typeof loadWeek>>) {
  return Object.fromEntries(week.days.map((d) => [d.date, d.events.map((e) => e.title)]));
}

describe("which week", () => {
  it("opens on the current week, Monday to Sunday, with today marked", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const week = await loadWeek(app.deps, alice);
    expect(week.monday).toBe("2026-11-16");
    expect(week.days.map((d) => d.label)).toEqual([
      "Mon 16 Nov", "Tue 17 Nov", "Wed 18 Nov", "Thu 19 Nov", "Fri 20 Nov", "Sat 21 Nov", "Sun 22 Nov",
    ]);
    expect(week.days.filter((d) => d.isToday).map((d) => d.date)).toEqual(["2026-11-16"]);
    expect(week.thisWeek).toBe("2026-11-16");
  });

  it("moves a week with previous and next, from any day of the requested week", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const week = await loadWeek(app.deps, alice, "2026-11-25");
    expect([week.previous, week.monday, week.next]).toEqual(["2026-11-16", "2026-11-23", "2026-11-30"]);
    expect(week.days.some((d) => d.isToday)).toBe(false);
  });

  it("falls back to the current week for a value that is not a date", async () => {
    const alice = await app.signedInAs("alice@example.com");
    expect((await loadWeek(app.deps, alice, "'; drop table app.events; --")).monday).toBe("2026-11-16");
  });

  it("uses the user's time zone for 'today': Monday 03:00 UTC is still Sunday in New York", async () => {
    app.advance(-6 * 3_600_000); // Monday 16 November, 03:00 UTC = Sunday 22:00 in New York
    const nora = await app.signedInAs("nora@example.com", { timeZone: "America/New_York" });
    const lisa = await app.signedInAs("lisa@example.com", { timeZone: "Europe/Lisbon" });
    expect((await loadWeek(app.deps, nora)).monday).toBe("2026-11-09");
    expect((await loadWeek(app.deps, lisa)).monday).toBe("2026-11-16");
  });
});

describe("events of the week", () => {
  it("shows an event on the day it starts: Sunday 23:30 to Monday 00:30 is Sunday, this week (R2)", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    await seedEvent(app.db, alice, { title: "Late", start: "2026-11-22T23:30:00Z", end: "2026-11-23T00:30:00Z" });

    const thisWeek = await loadWeek(app.deps, alice);
    const nextWeek = await loadWeek(app.deps, alice, "2026-11-23");

    expect(titlesByDay(thisWeek)["2026-11-22"]).toEqual(["Late"]);
    const late = thisWeek.days[6].events[0];
    expect(late).toMatchObject({ startTime: "23:30", endTime: "00:30", endDay: "2026-11-23" });
    expect(nextWeek.days.flatMap((d) => d.events)).toEqual([]);
  });

  it("shows times in the user's time zone", async () => {
    const nora = await app.signedInAs("nora@example.com", { timeZone: "America/New_York" });
    await seedEvent(app.db, nora, { title: "Lecture", start: "2026-11-17T14:00:00Z", end: "2026-11-17T15:30:00Z" });
    const [lecture] = (await loadWeek(app.deps, nora)).days[1].events;
    expect(lecture).toMatchObject({ startTime: "09:00", endTime: "10:30", startLocal: "2026-11-17T09:00", endDay: null });
  });

  it("puts an evening event on its local day even when it is already the next day in UTC", async () => {
    const nora = await app.signedInAs("nora@example.com", { timeZone: "America/New_York" });
    await seedEvent(app.db, nora, { title: "Dinner", start: "2026-11-17T01:00:00Z", end: "2026-11-17T02:00:00Z" });
    const week = await loadWeek(app.deps, nora);
    expect(titlesByDay(week)["2026-11-16"]).toEqual(["Dinner"]); // Monday 20:00 in New York
    expect(titlesByDay(week)["2026-11-17"]).toEqual([]);
  });

  it("marks overlapping events with a conflict, but not 09:00–10:00 and 10:00–11:00 (R10)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedEvent(app.db, alice, { title: "A", start: "2026-11-17T09:00:00Z", end: "2026-11-17T10:00:00Z" });
    await seedEvent(app.db, alice, { title: "B", start: "2026-11-17T10:00:00Z", end: "2026-11-17T11:00:00Z" });
    await seedEvent(app.db, alice, { title: "C", start: "2026-11-17T10:30:00Z", end: "2026-11-17T12:00:00Z", mayOverlap: true });

    const conflicts = (await loadWeek(app.deps, alice)).days[1].events.map((e) => [e.title, e.conflict]);
    expect(conflicts).toEqual([["A", false], ["B", true], ["C", true]]);
  });

  it("marks a conflict with an event of the next week (Sunday night running into Monday)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedEvent(app.db, alice, { title: "Night", start: "2026-11-22T23:00:00Z", end: "2026-11-23T01:00:00Z" });
    await seedEvent(app.db, alice, { title: "Early", start: "2026-11-23T00:30:00Z", end: "2026-11-23T02:00:00Z" });
    const [night] = (await loadWeek(app.deps, alice)).days[6].events;
    expect(night).toMatchObject({ title: "Night", conflict: true });
  });

  it("shows only the signed-in user's events (R3)", async () => {
    const bob = await app.signedInAs("bob@example.com");
    await seedEvent(app.db, bob, { title: "Bob's", start: "2026-11-17T09:00:00Z", end: "2026-11-17T10:00:00Z" });
    const alice = await app.signedInAs("alice@example.com");
    await seedEvent(app.db, alice, { title: "Alice's", start: "2026-11-17T09:00:00Z", end: "2026-11-17T10:00:00Z" });

    const week = await loadWeek(app.deps, alice);
    expect(week.days.flatMap((d) => d.events.map((e) => [e.title, e.conflict]))).toEqual([["Alice's", false]]);
  });
});
