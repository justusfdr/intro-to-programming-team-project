// Tests for widgets_data (spec 45): signed in only, a user sees only their own rows, which event is
// "next", the trip, the goal rings, the minutes focused today, the free stretch and the layout.
// The clock starts on Monday 16 November 2026, 09:00 UTC (10:00 in Berlin; the visible day is 7:00 to 21:00).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, read, type TestApp } from "@test/support/app";
import { seedEvent } from "@test/support/events";
import { seedGoal } from "@test/support/goals";
import { seedSession } from "@test/support/sessions";
import { DEFAULT_LAYOUT, type WidgetsData } from "@/lib/widgets/types";
import { widgetsData } from "./widgets-data";

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.reset();
});

async function load(): Promise<WidgetsData> {
  const answer = await read(await widgetsData(app.deps));
  expect(answer.status).toBe(200);
  return answer.body as unknown as WidgetsData;
}

const day = (hhmm: string, date = "2026-11-16") => `${date}T${hhmm}:00Z`;
const berlin = () => app.signedInAs("alice@example.com", { timeZone: "Europe/Berlin" });

async function setLocation(id: string, location: string) {
  await app.db.admin("update app.events set location = $2 where id = $1", [id, location]);
}

describe("widgets_data access", () => {
  it("refuses a signed-out request with 401", async () => {
    const answer = await read(await widgetsData(app.deps));
    expect(answer.status).toBe(401);
  });

  it("shows only the user's own events, goals, sessions and layout", async () => {
    const alice = await berlin();
    const bob = await app.signedInAs("bob@example.com", { timeZone: "Europe/Berlin" });
    await seedEvent(app.db, bob, { title: "Bob's dentist", start: day("09:30"), end: day("10:00") });
    await seedGoal(app.db, bob, { title: "Bob's goal", deadline: "2027-03-14", rules: [{ kind: "count", target: 1 }] });
    await seedSession(app.db, bob, { startedAt: day("08:00"), status: "finished", endedAt: day("08:30") });
    await app.db.admin("update app.settings set widgets = '[]'::jsonb where user_id = $1", [bob]);
    await app.auth.signIn({ email: "alice@example.com", password: "test-password" });
    expect(app.auth.session!.userId).toBe(alice);

    const data = await load();
    expect(data.next).toBeNull();
    expect(data.trip).toBeNull();
    expect(data.goals).toEqual([]);
    expect(data.focusMinutes).toBe(0);
    expect(data.layout).toEqual(DEFAULT_LAYOUT);
    expect(data.isDefault).toBe(true);
  });
});

describe("widgets_data layout", () => {
  it("no saved layout: the standard list, marked as the standard", async () => {
    await berlin();
    const data = await load();
    expect(data.layout).toEqual(DEFAULT_LAYOUT);
    expect(data.isDefault).toBe(true);
  });

  it("a saved layout is returned, also the empty list", async () => {
    const alice = await berlin();
    const saved = [{ kind: "focus", size: "1x1" }, { kind: "free", size: "3x1" }];
    await app.db.admin("update app.settings set widgets = $2::jsonb where user_id = $1", [alice, JSON.stringify(saved)]);
    expect(await load()).toMatchObject({ layout: saved, isDefault: false });
    await app.db.admin("update app.settings set widgets = '[]'::jsonb where user_id = $1", [alice]);
    expect(await load()).toMatchObject({ layout: [], isDefault: false });
  });

  it("a saved layout that is no longer valid falls back to the standard list", async () => {
    const alice = await berlin();
    await app.db.admin(`update app.settings set widgets = '[{"kind":"clock","size":"1x1"}]'::jsonb where user_id = $1`, [alice]);
    expect(await load()).toMatchObject({ layout: DEFAULT_LAYOUT, isDefault: true });
  });

  it("sends the time, the time zone and the time format", async () => {
    await berlin();
    expect(await load()).toMatchObject({ now: "2026-11-16T09:00:00.000Z", timeZone: "Europe/Berlin", timeFormat: "12h" });
  });
});

describe("widgets_data next, after and tomorrow", () => {
  it("the event happening now is next (with the time left to show); the one after it is `after`", async () => {
    const alice = await berlin();
    await seedEvent(app.db, alice, { title: "Lecture", start: day("08:30"), end: day("09:20") });
    await seedEvent(app.db, alice, { title: "Lunch", start: day("11:00"), end: day("12:00") });
    await seedEvent(app.db, alice, { title: "Study", start: day("13:00"), end: day("14:00") });
    const data = await load();
    expect(data.next).toMatchObject({ title: "Lecture", start: "2026-11-16T08:30:00.000Z", end: "2026-11-16T09:20:00.000Z" });
    expect(data.after).toEqual({ title: "Lunch", start: "2026-11-16T11:00:00.000Z" });
  });

  it("with nothing running, the next one that starts later today is next", async () => {
    const alice = await berlin();
    await seedEvent(app.db, alice, { title: "Earlier", start: day("06:00"), end: day("07:00") });
    await seedEvent(app.db, alice, { title: "Lunch", start: day("11:00"), end: day("12:00") });
    await seedEvent(app.db, alice, { title: "Study", start: day("13:00"), end: day("14:00") });
    const data = await load();
    expect(data.next?.title).toBe("Lunch");
    expect(data.after).toEqual({ title: "Study", start: "2026-11-16T13:00:00.000Z" });
  });

  it("an event that ends exactly now is over; one that starts exactly now is running", async () => {
    const alice = await berlin();
    await seedEvent(app.db, alice, { title: "Just over", start: day("08:00"), end: day("09:00") });
    await seedEvent(app.db, alice, { title: "Starting", start: day("09:00"), end: day("10:00") });
    expect((await load()).next?.title).toBe("Starting");
  });

  it("nothing left today: next and after are empty and tomorrow's first event is given", async () => {
    const alice = await berlin();
    await seedEvent(app.db, alice, { title: "Earlier", start: day("06:00"), end: day("07:00") });
    await seedEvent(app.db, alice, { title: "Later one", start: day("10:00", "2026-11-17"), end: day("11:00", "2026-11-17") });
    await seedEvent(app.db, alice, { title: "First one", start: day("08:00", "2026-11-17"), end: day("09:00", "2026-11-17") });
    await seedEvent(app.db, alice, { title: "Day after", start: day("08:00", "2026-11-18"), end: day("09:00", "2026-11-18") });
    const data = await load();
    expect(data.next).toBeNull();
    expect(data.after).toBeNull();
    expect(data.tomorrow).toEqual({ title: "First one", start: "2026-11-17T08:00:00.000Z" });
  });

  it("'today' is the user's day: an event at 23:30 UTC is tomorrow for Berlin", async () => {
    const alice = await berlin();
    await seedEvent(app.db, alice, { title: "Late", start: day("23:30"), end: day("23:50") });
    const data = await load();
    expect(data.next).toBeNull();
    expect(data.tomorrow?.title).toBe("Late");
  });

  it("ignores all-day events", async () => {
    const alice = await berlin();
    await app.db.admin(`insert into app.events (user_id, title, all_day, first_day, last_day) values ($1, 'Exam week', true, '2026-11-16', '2026-11-20')`, [alice]);
    const data = await load();
    expect(data.next).toBeNull();
    expect(data.tomorrow).toBeNull();
  });

  it("gives the event its goal, to-dos, guests and location", async () => {
    const alice = await berlin();
    const goal = await seedGoal(app.db, alice, { title: "Pass statistics", deadline: "2027-03-14", rules: [{ kind: "count", target: 2 }] });
    const { id } = await seedEvent(app.db, alice, { title: "Revision", start: day("11:00"), end: day("12:00"), goalId: goal.id });
    await setLocation(id, "Library, Campus Carcavelos");
    await app.db.admin("update app.events set guests = array['a@example.com', 'b@example.com'] where id = $1", [id]);
    await app.db.admin(
      "insert into app.event_todos (user_id, event_id, title, position, done) values ($1, $2, 'One', 0, true), ($1, $2, 'Two', 1, false), ($1, $2, 'Three', 2, false)",
      [alice, id],
    );
    const data = await load();
    expect(data.next).toEqual({
      id,
      title: "Revision",
      start: "2026-11-16T11:00:00.000Z",
      end: "2026-11-16T12:00:00.000Z",
      location: "Library, Campus Carcavelos",
      goal: { title: "Pass statistics", look: expect.objectContaining({ color: expect.any(String), icon: "rocket" }) },
      todos: { done: 1, total: 3 },
      guests: 2,
      travelable: true,
    });
  });

  it("an event without a goal, guests or to-dos has null, 0 and 0 of 0", async () => {
    const alice = await berlin();
    await seedEvent(app.db, alice, { title: "Plain", start: day("11:00"), end: day("12:00") });
    expect((await load()).next).toMatchObject({ goal: null, todos: { done: 0, total: 0 }, guests: 0, location: null, travelable: false });
  });
});

describe("widgets_data trip", () => {
  it("is the next event today that has not started and has an address", async () => {
    const alice = await berlin();
    const running = await seedEvent(app.db, alice, { title: "Running", start: day("08:30"), end: day("09:30") });
    await setLocation(running.id, "Rua A 1, Lisbon");
    const call = await seedEvent(app.db, alice, { title: "Call", start: day("10:00"), end: day("10:30") });
    await setLocation(call.id, "https://meet.example.com/abc");
    await seedEvent(app.db, alice, { title: "No place", start: day("10:30"), end: day("11:00") });
    const lunch = await seedEvent(app.db, alice, { title: "Lunch", start: day("11:00"), end: day("12:00") });
    await setLocation(lunch.id, "Rua B 2, Lisbon");
    const later = await seedEvent(app.db, alice, { title: "Later", start: day("15:00"), end: day("16:00") });
    await setLocation(later.id, "Rua C 3, Lisbon");
    const data = await load();
    expect(data.trip).toMatchObject({ id: lunch.id, title: "Lunch", location: "Rua B 2, Lisbon", travelable: true });
    // The event on now is still "next", while the trip is for the one to leave for.
    expect(data.next?.title).toBe("Running");
  });

  it("is empty when no event today has an address", async () => {
    const alice = await berlin();
    const call = await seedEvent(app.db, alice, { title: "Call", start: day("11:00"), end: day("11:30") });
    await setLocation(call.id, "www.meet.example.com/abc");
    expect((await load()).trip).toBeNull();
  });

  it("does not take tomorrow's event", async () => {
    const alice = await berlin();
    const e = await seedEvent(app.db, alice, { title: "Tomorrow", start: day("09:00", "2026-11-17"), end: day("10:00", "2026-11-17") });
    await setLocation(e.id, "Rua D 4, Lisbon");
    expect((await load()).trip).toBeNull();
  });
});

describe("widgets_data goals", () => {
  it("a count goal: done events of this week against the target of its first rule", async () => {
    const alice = await berlin();
    const goal = await seedGoal(app.db, alice, { title: "Run", deadline: "2027-03-14", createdAt: "2026-11-02T10:00:00Z", rules: [{ kind: "count", target: 4 }] });
    await seedEvent(app.db, alice, { start: day("06:00", "2026-11-09"), end: day("07:00", "2026-11-09"), status: "done", goalId: goal.id }); // last week
    await seedEvent(app.db, alice, { start: day("06:00"), end: day("07:00"), status: "done", goalId: goal.id });
    await seedEvent(app.db, alice, { start: day("07:00", "2026-11-15"), end: day("08:00", "2026-11-15"), status: "done", goalId: goal.id }); // Sunday, last week
    await seedEvent(app.db, alice, { start: day("12:00"), end: day("13:00"), status: "planned", goalId: goal.id }); // not done
    const data = await load();
    expect(data.goals).toEqual([
      { id: goal.id, title: "Run", look: expect.any(Object), done: 1, target: 4, unit: "count", met: false },
    ]);
  });

  it("is met when every rule is met, and not when only the first is", async () => {
    const alice = await berlin();
    const both = await seedGoal(app.db, alice, { title: "Both", deadline: "2027-03-14", createdAt: "2026-11-02T10:00:00Z", rules: [{ kind: "count", target: 1 }, { kind: "count", target: 2 }] });
    const one = await seedGoal(app.db, alice, { title: "One", deadline: "2027-03-14", createdAt: "2026-11-02T10:00:00Z", rules: [{ kind: "count", target: 1 }] });
    await seedEvent(app.db, alice, { start: day("06:00"), end: day("07:00"), status: "done", goalId: both.id });
    await seedEvent(app.db, alice, { start: day("06:00"), end: day("07:00"), status: "done", goalId: one.id });
    const byTitle = Object.fromEntries((await load()).goals.map((g) => [g.title, g]));
    expect(byTitle.One).toMatchObject({ done: 1, target: 1, met: true });
    expect(byTitle.Both).toMatchObject({ done: 1, target: 1, met: false });
  });

  it("an hours goal: hours rounded down to a tenth", async () => {
    const alice = await berlin();
    const goal = await seedGoal(app.db, alice, { title: "Study", deadline: "2027-03-14", createdAt: "2026-11-02T10:00:00Z", rules: [{ kind: "hours", target: 6 }] });
    await seedEvent(app.db, alice, { start: day("06:00"), end: day("08:00"), status: "done", goalId: goal.id }); // 120 min
    await seedEvent(app.db, alice, { start: day("08:00", "2026-11-17"), end: day("09:35", "2026-11-17"), status: "done", goalId: goal.id }); // 95 min
    const data = await load();
    // 215 minutes = 3.58 hours, shown as 3.5.
    expect(data.goals).toEqual([expect.objectContaining({ done: 3.5, target: 6, unit: "hours", met: false })]);
  });

  it("the goal's colour and icon come with it, oldest goal first", async () => {
    const alice = await berlin();
    await seedGoal(app.db, alice, { title: "First", deadline: "2027-03-14", createdAt: "2026-11-02T10:00:00Z", rules: [{ kind: "count", target: 1 }] });
    await seedGoal(app.db, alice, { title: "Second", deadline: "2027-03-14", createdAt: "2026-11-03T10:00:00Z", rules: [{ kind: "count", target: 1 }] });
    const goals = (await load()).goals;
    expect(goals.map((g) => g.title)).toEqual(["First", "Second"]);
    expect(goals[0].look).not.toEqual(goals[1].look);
  });
});

describe("widgets_data focus minutes", () => {
  it("adds the sessions started today, a running one up to now; yesterday's do not count", async () => {
    const alice = await berlin();
    await seedSession(app.db, alice, { startedAt: day("06:00"), status: "finished", plannedMinutes: 60, endedAt: day("06:40") });
    await seedSession(app.db, alice, { startedAt: day("07:00"), status: "finished", plannedMinutes: 30, endedAt: day("07:30"), pausedSeconds: 300 }); // 25 min
    await seedSession(app.db, alice, { startedAt: day("14:00", "2026-11-15"), status: "finished", plannedMinutes: 60, endedAt: day("15:00", "2026-11-15") });
    await seedSession(app.db, alice, { startedAt: day("08:30"), status: "running", plannedMinutes: 60 }); // 30 min so far
    expect((await load()).focusMinutes).toBe(40 + 25 + 30);
  });

  it("a paused session counts up to its pause", async () => {
    const alice = await berlin();
    await seedSession(app.db, alice, { startedAt: day("08:00"), status: "paused", plannedMinutes: 60, pausedAt: day("08:20") });
    expect((await load()).focusMinutes).toBe(20);
  });

  it("a running session past its planned end counts only its planned length (R13)", async () => {
    const alice = await berlin();
    await seedSession(app.db, alice, { startedAt: day("07:00"), status: "running", plannedMinutes: 15 });
    expect((await load()).focusMinutes).toBe(15);
  });

  it("a session started before midnight in the user's day (23:30 UTC the day before is today's 00:30 in Berlin) counts", async () => {
    const alice = await berlin();
    await seedSession(app.db, alice, { startedAt: day("23:30", "2026-11-15"), status: "finished", plannedMinutes: 30, endedAt: day("23:55", "2026-11-15") });
    expect((await load()).focusMinutes).toBe(25);
  });

  it("is 0 without sessions", async () => {
    await berlin();
    expect((await load()).focusMinutes).toBe(0);
  });
});

describe("widgets_data free time", () => {
  it("is the next free stretch of 30 minutes or more before the end of the visible day", async () => {
    const alice = await berlin();
    await seedEvent(app.db, alice, { start: day("08:30"), end: day("09:20") });
    await seedEvent(app.db, alice, { start: day("09:40"), end: day("10:30") });
    await seedEvent(app.db, alice, { start: day("11:00"), end: day("12:00") });
    // Now is 09:00; the running event ends 09:20 and the next starts 09:40 (too short); then 10:30 to 11:00.
    expect((await load()).free).toEqual({ start: "2026-11-16T10:30:00.000Z", end: "2026-11-16T11:00:00.000Z" });
  });

  it("from now rounded up to 5 minutes when nothing is on", async () => {
    await berlin();
    app.advance(2 * 60_000); // 09:02
    expect((await load()).free).toEqual({ start: "2026-11-16T09:05:00.000Z", end: "2026-11-16T20:00:00.000Z" });
  });

  it("is null after the visible day has ended", async () => {
    await berlin();
    app.advance(11 * 3600_000 + 30 * 60_000); // 20:30 UTC = 21:30 in Berlin
    expect((await load()).free).toBeNull();
  });

  it("uses the user's visible hours", async () => {
    const alice = await berlin();
    await app.db.admin("update app.settings set day_end_hour = 12 where user_id = $1", [alice]);
    expect((await load()).free).toEqual({ start: "2026-11-16T09:00:00.000Z", end: "2026-11-16T11:00:00.000Z" });
  });
});
