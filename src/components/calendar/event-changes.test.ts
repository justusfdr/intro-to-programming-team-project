import { describe, expect, it } from "vitest";
import type { AllDayEvent, WeekData, WeekEvent } from "@/lib/events/types";
import { dropText, isGuestsError, movedChange, recreateBody, savedEventChange, timesBody, withoutGuests } from "./event-changes";

// What a drop, an undo and a re-created event send, and what the screen shows at once (spec 15).
const EVENT: WeekEvent = {
  id: "e1",
  title: "Statistics revision",
  allDay: false,
  startAt: "2026-11-17T09:00:00.000Z",
  endAt: "2026-11-17T10:00:00.000Z",
  firstDay: null,
  lastDay: null,
  mayOverlap: true,
  status: "done",
  goalId: "g1",
  seriesId: null,
  source: "app",
  location: null,
  notSent: false,
  updatedAt: "2026-11-15T10:00:00.000Z",
  conflict: false,
  startTime: "09:00",
  endTime: "10:00",
  endDay: null,
  startLocal: "2026-11-17T09:00",
  endLocal: "2026-11-17T10:00",
};

const EXAM: AllDayEvent = {
  id: "x1",
  title: "Exam week",
  allDay: true,
  firstDay: "2026-11-16",
  lastDay: "2026-11-20",
  mayOverlap: false,
  status: "planned",
  goalId: null,
  seriesId: null,
  source: "app",
  location: null,
  notSent: false,
  updatedAt: "2026-11-15T10:00:00.000Z",
};

const DAYS = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"];

function week(): WeekData {
  return {
    timeZone: "Europe/Lisbon",
    outlook: { status: "none", lastSyncedAt: null },
    view: "week",
    date: "2026-11-17",
    today: "2026-11-17",
    monday: "2026-11-16",
    previous: "2026-11-09",
    next: "2026-11-23",
    thisWeek: "2026-11-16",
    days: DAYS.map((date) => ({ date, label: date, isToday: false, events: date === "2026-11-17" ? [EVENT] : [], allDay: [] })),
    lead: [],
  };
}

describe("a move or resize is edit_event (R4)", () => {
  it("sends title, new local start and end and the updated_at the screen last saw; goal and overlap stay out", () => {
    expect(timesBody(EVENT, "2026-11-18T10:00", "2026-11-18T11:00", EVENT.updatedAt)).toEqual({
      title: "Statistics revision",
      start: "2026-11-18T10:00",
      end: "2026-11-18T11:00",
      updatedAt: "2026-11-15T10:00:00.000Z",
    });
  });

  it("an event of a series sends the chosen scope (R28)", () => {
    expect(timesBody(EVENT, "2026-11-17T10:00", "2026-11-17T11:00", "u", "this_and_following")).toMatchObject({ scope: "this_and_following" });
  });
});

describe("shown at once", () => {
  it("a moved event shows on its new day and time before the answer arrives", () => {
    const change = movedChange(EVENT, "2026-11-19T14:00", "2026-11-19T15:30", "Europe/Lisbon");
    const shown = change!.week!(week());
    expect(shown.days[1].events).toHaveLength(0);
    const moved = shown.days[3].events[0];
    expect(moved).toMatchObject({ id: "e1", startLocal: "2026-11-19T14:00", endLocal: "2026-11-19T15:30", status: "done", goalId: "g1" });
  });

  it("'this and following' waits for the re-read: each event keeps its own date (R28)", () => {
    expect(movedChange(EVENT, "2026-11-19T14:00", "2026-11-19T15:00", "Europe/Lisbon", "this_and_following")).toBeNull();
  });

  it("an answer with the saved event replaces the week's copy; a series answer waits for the re-read", () => {
    const saved = { ...EVENT, startAt: "2026-11-17T11:00:00.000Z", endAt: "2026-11-17T12:00:00.000Z" };
    const shown = savedEventChange({ ok: true, status: 200, message: "", data: { event: saved } })!.week!(week());
    expect(shown.days[1].events[0].startLocal).toBe("2026-11-17T11:00");
    expect(savedEventChange({ ok: true, status: 200, message: "", data: { event: saved, count: 3 } })).toBeNull();
  });
});

describe("undo of a delete is create_event with the same fields", () => {
  it("a timed event: title, times, overlap and goal", () => {
    expect(recreateBody(EVENT)).toEqual({
      title: "Statistics revision",
      start: "2026-11-17T09:00",
      end: "2026-11-17T10:00",
      mayOverlap: true,
      goalId: "g1",
    });
  });

  it("an all-day event: title and days (R29: no goal)", () => {
    expect(recreateBody(EXAM)).toEqual({ title: "Exam week", allDay: true, firstDay: "2026-11-16", lastDay: "2026-11-20" });
  });

  it("keeps the location of a timed and of an all-day event", () => {
    expect(recreateBody({ ...EVENT, location: "Library" }).location).toBe("Library");
    expect(recreateBody({ ...EXAM, location: "Campus" }).location).toBe("Campus");
    expect(recreateBody(EVENT)).not.toHaveProperty("location");
  });

  it("sends the guests only while the event has not ended", () => {
    const guests = ["ana@example.com"];
    expect(recreateBody({ ...EVENT, guests }, [], "2026-11-17T09:30").guests).toEqual(guests);
    expect(recreateBody({ ...EVENT, guests }, [], "2026-11-17T10:00")).not.toHaveProperty("guests");
    expect(recreateBody({ ...EVENT, guests }, [], "2026-11-18T08:00")).not.toHaveProperty("guests");
    expect(recreateBody({ ...EXAM, guests }, [], "2026-11-20T23:00").guests).toEqual(guests);
    expect(recreateBody({ ...EXAM, guests }, [], "2026-11-21T00:00")).not.toHaveProperty("guests");
  });

  it("recognises a guests refusal and can drop the guests", () => {
    const refused = { ok: false, status: 400, message: "x", data: { error: "guests_ended" } };
    expect(isGuestsError(refused)).toBe(true);
    expect(isGuestsError({ ...refused, data: { error: "end_before_start" } })).toBe(false);
    expect(isGuestsError({ ...refused, ok: true })).toBe(false);
    expect(withoutGuests({ title: "a", guests: ["b@example.com"] })).toEqual({ title: "a" });
  });
});

describe("the toast's text, as in the prototype", () => {
  it("says where the event went", () => {
    expect(dropText(EVENT, "2026-11-19T14:00", "2026-11-19T15:30", "12h")).toBe("Moved to Thu, Nov 19, 2 – 3:30pm");
    expect(dropText(EVENT, "2026-11-17T09:00", "2026-11-17T11:00", "12h")).toBe("Resized to Tue, Nov 17, 9 – 11am");
    expect(dropText(EVENT, "2026-11-17T09:00", "2026-11-17T11:00", "24h")).toBe("Resized to Tue, Nov 17, 9:00 – 11:00");
  });

  it("names only the times for 'this and following'", () => {
    expect(dropText(EVENT, "2026-11-19T14:00", "2026-11-19T15:00", "12h", "this_and_following")).toBe("Moved this and following events to 2 – 3pm");
  });
});
