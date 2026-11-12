// Tests for spec 07: all-day events (R29) and series (R28) through the actions, the week loader, the
// blocking state and the focus page. Same pattern as the other action tests: each accepted case checks
// what is saved; each rejected case checks the exact message and that nothing changed (app.snapshot()).
// The clock starts on Monday 16 November 2026 at 09:00 UTC; Lisbon is UTC in November and December.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { eventListOf, seedAllDay, seedEvent } from "@test/support/events";
import { seedGoal } from "@test/support/goals";
import { readBlockingState } from "@/lib/server/blocker/load";
import { loadWeek } from "@/lib/server/events/week";
import { loadFocus } from "@/lib/server/focus/load";
import { createEvent } from "./create-event";
import { deleteEvent } from "./delete-event";
import { editEvent } from "./edit-event";
import { markEventDone } from "./event-status";

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

const create = (body: unknown) => createEvent(postJson("/api/events", body), app.deps);
const edit = (id: string, body: unknown) => editEvent(postJson(`/api/events/${id}/edit`, body), app.deps, id);
const remove = (id: string, body: unknown) => deleteEvent(postJson(`/api/events/${id}/delete`, body), app.deps, id);

const EXAM_WEEK = { title: "Exam week", allDay: true, firstDay: "2026-11-16", lastDay: "2026-11-20" };

// A12: weekly on Tuesday and Thursday, 09:00 to 10:00, from Tuesday 17 November 2026 until 18 December.
const A12 = {
  title: "Statistics lecture",
  start: "2026-11-17T09:00",
  end: "2026-11-17T10:00",
  repeat: { frequency: "weekly", weekdays: [2, 4], until: "2026-12-18" },
};
const A12_DAYS = ["11-17", "11-19", "11-24", "11-26", "12-01", "12-03", "12-08", "12-10", "12-15", "12-17"];

async function rejected(body: unknown, status: number, message: string) {
  const before = await app.snapshot();
  const answer = await read(await create(body));
  expect(answer).toMatchObject({ status, body: { message } });
  expect(await app.snapshot()).toEqual(before);
}

describe("all-day events (R29)", () => {
  it("saves 'Exam week' Mon 16 to Fri 20 Nov with days and no times", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const answer = await read(await create(EXAM_WEEK));
    expect(answer).toMatchObject({
      status: 201,
      body: { message: "Event saved.", event: { title: "Exam week", allDay: true, firstDay: "2026-11-16", lastDay: "2026-11-20", startAt: null, endAt: null, goalId: null, seriesId: null } },
    });
    expect(await eventListOf(app.db, alice)).toMatchObject([
      { all_day: true, first_day: "2026-11-16", last_day: "2026-11-20", start_at: null, end_at: null, status: "planned" },
    ]);
  });

  it("accepts 31 days", async () => {
    await app.signedInAs("alice@example.com");
    expect((await create({ ...EXAM_WEEK, firstDay: "2026-12-01", lastDay: "2026-12-31" })).status).toBe(201);
  });

  it.each([
    ["the last day before the first", { lastDay: "2026-11-15" }, "The last day cannot be before the first day"],
    ["32 days", { firstDay: "2026-12-01", lastDay: "2027-01-01" }, "An all-day event can last at most 31 days"],
  ])("rejects %s with the ontology's message; nothing is saved", async (_case, change, message) => {
    await app.signedInAs("alice@example.com");
    await rejected({ ...EXAM_WEEK, ...change }, 400, message);
  });

  it("rejects a goal: 'All-day events have no goal'; nothing is saved", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const goal = await seedGoal(app.db, alice, { deadline: "2027-03-14", rules: [{ kind: "count", target: 3 }] });
    await rejected({ ...EXAM_WEEK, goalId: goal.id }, 400, "All-day events have no goal");
  });

  it("rejects a repeating all-day event and missing days as a bad request; nothing is saved", async () => {
    await app.signedInAs("alice@example.com");
    await rejected({ ...EXAM_WEEK, repeat: { frequency: "daily", until: "2026-11-30" } }, 400, "Invalid request.");
    await rejected({ title: "Exam week", allDay: true, firstDay: "2026-11-16" }, 400, "Invalid request.");
  });

  it("cannot be marked done: 409 'All-day events cannot be marked done'; nothing changes", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { id } = await seedAllDay(app.db, alice, { firstDay: "2026-11-16", lastDay: "2026-11-16" });
    app.advance(24 * 60 * 60 * 1000);
    const before = await app.snapshot();
    const answer = await read(await markEventDone(postJson(`/api/events/${id}/done`, {}), app.deps, id));
    expect(answer).toMatchObject({ status: 409, body: { message: "All-day events cannot be marked done" } });
    expect(await app.snapshot()).toEqual(before);
  });

  it("a timed event becomes all-day on edit: times, goal and done status go", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const goal = await seedGoal(app.db, alice, { deadline: "2027-03-14", rules: [{ kind: "count", target: 3 }] });
    const { id, updatedAt } = await seedEvent(app.db, alice, { start: "2026-11-16T07:00:00Z", end: "2026-11-16T08:00:00Z", status: "done", goalId: goal.id });
    const answer = await read(await edit(id, { ...EXAM_WEEK, updatedAt }));
    expect(answer.status).toBe(200);
    expect(await eventListOf(app.db, alice)).toMatchObject([{ id, all_day: true, start_at: null, goal_id: null, status: "planned" }]);
  });
});

describe("series (R28)", () => {
  it("A12: weekly Tue and Thu 09:00 to 10:00 until 18 Dec makes 10 events with one series_id in one step", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    const answer = await read(await create(A12));
    expect(answer).toMatchObject({ status: 201, body: { message: "Events saved.", count: 10, event: { startAt: "2026-11-17T09:00:00.000Z" } } });

    const events = await eventListOf(app.db, alice);
    expect(events).toHaveLength(10);
    expect(events.map((e) => e.start_at)).toEqual(A12_DAYS.map((d) => `2026-${d}T09:00:00.000Z`));
    expect(events.map((e) => e.end_at)).toEqual(A12_DAYS.map((d) => `2026-${d}T10:00:00.000Z`));
    expect(new Set(events.map((e) => e.series_id)).size).toBe(1);
    expect(events[0].series_id).not.toBeNull();
  });

  it("keeps local times across a daylight-saving change (Lisbon, 29 March 2027)", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    expect((await create({ title: "Run", start: "2027-03-27T09:00", end: "2027-03-27T10:00", repeat: { frequency: "daily", until: "2027-03-29" } })).status).toBe(201);
    expect((await eventListOf(app.db, alice)).map((e) => e.start_at)).toEqual([
      "2027-03-27T09:00:00.000Z",
      "2027-03-28T08:00:00.000Z",
      "2027-03-29T08:00:00.000Z",
    ]);
  });

  it("monthly on the 31st from 31 Jan 2027 until 30 Jun 2027 skips the months without it", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    await create({ title: "Rent", start: "2027-01-31T12:00", end: "2027-01-31T12:30", repeat: { frequency: "monthly", until: "2027-06-30" } });
    expect((await eventListOf(app.db, alice)).map((e) => e.start_at!.slice(0, 10))).toEqual(["2027-01-31", "2027-03-31", "2027-05-31"]);
  });

  it("rejects 101 dates: 'A repeating event can have at most 100 dates'; nothing is saved", async () => {
    await app.signedInAs("alice@example.com");
    // Daily from 17 Nov 2026: the 101st date is 25 Feb 2027.
    await rejected({ ...A12, repeat: { frequency: "daily", until: "2027-02-25" } }, 400, "A repeating event can have at most 100 dates");
  });

  it("accepts exactly 100 dates", async () => {
    const alice = await app.signedInAs("alice@example.com");
    expect((await create({ ...A12, repeat: { frequency: "daily", until: "2027-02-24" } })).status).toBe(201);
    expect(await eventListOf(app.db, alice)).toHaveLength(100);
  });

  it("rejects an end date before the first date: 'The end date cannot be before the first date'; nothing is saved", async () => {
    await app.signedInAs("alice@example.com");
    await rejected({ ...A12, repeat: { ...A12.repeat, until: "2026-11-16" } }, 400, "The end date cannot be before the first date");
  });

  it("checks every event of the series like a single one: an overlong event saves none", async () => {
    await app.signedInAs("alice@example.com");
    await rejected({ ...A12, end: "2026-11-18T10:00" }, 400, "An event can last at most 24 hours");
  });

  it("refuses a repeat on edit (no rule is stored; create a new series instead)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { id, updatedAt } = await seedEvent(app.db, alice, { start: "2026-11-17T09:00:00Z", end: "2026-11-17T10:00:00Z" });
    const before = await app.snapshot();
    expect((await edit(id, { ...A12, updatedAt })).status).toBe(400);
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("changing a series (R28, R4)", () => {
  async function a12(email = "alice@example.com") {
    const user = await app.signedInAs(email, { timeZone: "Europe/Lisbon" });
    await create(A12);
    const events = await eventListOf(app.db, user);
    return { user, events, onDec8: events.find((e) => e.start_at === "2026-12-08T09:00:00.000Z")! };
  }

  it("A12: delete 'this and following' on Tue 8 Dec leaves 17, 19, 24, 26 Nov and 1, 3 Dec", async () => {
    const { user, onDec8 } = await a12();
    const answer = await read(await remove(onDec8.id, { updatedAt: onDec8.updated_at, scope: "this_and_following" }));
    expect(answer).toMatchObject({ status: 200, body: { message: "Events deleted." } });
    expect((await eventListOf(app.db, user)).map((e) => e.start_at!.slice(5, 10))).toEqual(["11-17", "11-19", "11-24", "11-26", "12-01", "12-03"]);
  });

  it("delete 'this' removes only the opened event", async () => {
    const { user, onDec8 } = await a12();
    expect((await read(await remove(onDec8.id, { updatedAt: onDec8.updated_at, scope: "this" }))).body).toMatchObject({ message: "Event deleted." });
    expect(await eventListOf(app.db, user)).toHaveLength(9);
  });

  it("edit 'this and following' on 8 Dec: that event and the later ones get the new title and times, each keeps its date", async () => {
    const { user, onDec8 } = await a12();
    const answer = await read(
      await edit(onDec8.id, { title: "Statistics (room 2)", start: "2026-12-08T14:00", end: "2026-12-08T15:30", updatedAt: onDec8.updated_at, scope: "this_and_following" }),
    );
    expect(answer).toMatchObject({ status: 200, body: { message: "Events saved.", count: 4, event: { id: onDec8.id, startAt: "2026-12-08T14:00:00.000Z" } } });

    const after = await eventListOf(app.db, user);
    expect(after.map((e) => [e.start_at!.slice(5, 16), e.end_at!.slice(11, 16), e.title])).toEqual([
      ...["11-17", "11-19", "11-24", "11-26", "12-01", "12-03"].map((d) => [`${d}T09:00`, "10:00", "Statistics lecture"]),
      ...["12-08", "12-10", "12-15", "12-17"].map((d) => [`${d}T14:00`, "15:30", "Statistics (room 2)"]),
    ]);
    expect(new Set(after.map((e) => e.series_id)).size).toBe(1);
  });

  it("edit 'this' changes only the opened event; it stays in its series", async () => {
    const { user, onDec8 } = await a12();
    await edit(onDec8.id, { title: "Moved", start: "2026-12-08T14:00", end: "2026-12-08T15:00", updatedAt: onDec8.updated_at, scope: "this" });
    const after = await eventListOf(app.db, user);
    expect(after.filter((e) => e.title === "Moved")).toMatchObject([{ id: onDec8.id, series_id: onDec8.series_id }]);
    expect(after.filter((e) => e.title === "Statistics lecture")).toHaveLength(9);
  });

  it("two devices: a stale opened event is refused for the whole series change; nothing changes", async () => {
    const { onDec8 } = await a12();
    // The other device saved this event in the meantime.
    await app.db.admin("update app.events set title = 'Renamed' where id = $1", [onDec8.id]);
    const before = await app.snapshot();
    const edited = await read(await edit(onDec8.id, { title: "X", start: "2026-12-08T14:00", end: "2026-12-08T15:00", updatedAt: onDec8.updated_at, scope: "this_and_following" }));
    const deleted = await read(await remove(onDec8.id, { updatedAt: onDec8.updated_at, scope: "this_and_following" }));
    for (const answer of [edited, deleted]) {
      expect(answer).toMatchObject({ status: 409, body: { message: "Changed on another device. Reload to see the latest version" } });
    }
    expect(await app.snapshot()).toEqual(before);
  });

  it("an invalid series change is refused with the ontology's message; nothing changes", async () => {
    const { user, onDec8 } = await a12();
    const before = await app.snapshot();
    // 09:00 to 09:30 the next day lasts more than 24 hours.
    const answer = await read(await edit(onDec8.id, { title: "X", start: "2026-12-08T09:00", end: "2026-12-09T09:30", updatedAt: onDec8.updated_at, scope: "this_and_following" }));
    expect(answer).toMatchObject({ status: 400, body: { message: "An event can last at most 24 hours" } });
    expect(await app.snapshot()).toEqual(before);
    expect(await eventListOf(app.db, user)).toHaveLength(10);
  });

  it("another user's series event is 'Not found' and nothing is deleted", async () => {
    const { onDec8 } = await a12("bob@example.com");
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    expect(await read(await remove(onDec8.id, { updatedAt: onDec8.updated_at, scope: "this_and_following" }))).toMatchObject({ status: 404, body: { message: "Not found" } });
    expect(await app.snapshot()).toEqual(before);
  });
});

describe("A13: an all-day event never conflicts and never blocks", () => {
  async function setUp() {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    await seedAllDay(app.db, alice, { title: "Exam week", firstDay: "2026-11-16", lastDay: "2026-11-20" });
    const goal = await seedGoal(app.db, alice, { deadline: "2027-03-14", autoBlock: true, rules: [{ kind: "count", target: 3 }] });
    await seedEvent(app.db, alice, { title: "Revision", start: "2026-11-17T09:00:00Z", end: "2026-11-17T11:00:00Z", goalId: goal.id });
    return alice;
  }

  it("the week shows 'Exam week' on its five days above the hours, and the Tuesday event without a conflict mark", async () => {
    const alice = await setUp();
    const week = await loadWeek(app.deps, alice, "2026-11-16");
    expect(week.days.map((d) => d.allDay.map((e) => e.title))).toEqual([["Exam week"], ["Exam week"], ["Exam week"], ["Exam week"], ["Exam week"], [], []]);
    expect(week.days.flatMap((d) => d.events.map((e) => [e.title, e.conflict]))).toEqual([["Revision", false]]);
  });

  it("asked Tue 10:00: blocked until 11:00; Wed 10:00: not blocked", async () => {
    const alice = await setUp();
    const at = (iso: string) => app.db.withUser(alice, (q) => readBlockingState(q, new Date(iso)));
    expect(await at("2026-11-17T10:00:00Z")).toEqual({ blockingOn: true, blockingUntil: new Date("2026-11-17T11:00:00Z") });
    expect(await at("2026-11-18T10:00:00Z")).toEqual({ blockingOn: false, blockingUntil: null });
  });

  it("the focus page does not suggest a session for an all-day event", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { id } = await seedAllDay(app.db, alice, { firstDay: "2026-11-16", lastDay: "2026-11-16" });
    expect((await loadFocus(app.deps, alice, id)).forEvent).toBeNull();
  });

  it("the week also shows an all-day event that started the week before", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedAllDay(app.db, alice, { title: "Trip", firstDay: "2026-11-10", lastDay: "2026-11-17" });
    const week = await loadWeek(app.deps, alice, "2026-11-16");
    expect(week.days.map((d) => d.allDay.length)).toEqual([1, 1, 0, 0, 0, 0, 0]);
  });
});
