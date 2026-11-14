// Tests for the editor's values and what it sends (spec 16): every save carries all the event's fields
// and the updated_at the screen last saw (R4); an Outlook event sends only its goal (R11); the change is
// shown at once in the calendar.
import { describe, expect, it } from "vitest";
import type { AllDayEvent, WeekData, WeekEvent } from "@/lib/events/types";
import { createBody, editBody, editedChange, eventFromAnswer, isChanged, moveFirstDay, newValues, newer, switchAllDay, untouchedPatch, valuesOf } from "./values";

const EVENT: WeekEvent = {
  id: "e1",
  title: "Lunch",
  allDay: false,
  startAt: "2026-11-17T12:30:00.000Z",
  endAt: "2026-11-17T13:30:00.000Z",
  firstDay: null,
  lastDay: null,
  mayOverlap: false,
  status: "planned",
  goalId: "g1",
  seriesId: null,
  source: "app",
  location: "Cafeteria",
  notSent: false,
  updatedAt: "2026-11-15T10:00:00.000Z",
  conflict: true,
  startTime: "12:30",
  endTime: "13:30",
  endDay: null,
  startLocal: "2026-11-17T12:30",
  endLocal: "2026-11-17T13:30",
};

const TRIP: AllDayEvent = {
  id: "a1",
  title: "Trip",
  allDay: true,
  firstDay: "2026-11-20",
  lastDay: "2026-11-22",
  mayOverlap: false,
  status: "planned",
  goalId: null,
  seriesId: null,
  source: "app",
  location: null,
  notSent: false,
  updatedAt: "2026-11-15T10:00:00.000Z",
};

const WEEK: WeekData = {
  timeZone: "Europe/Lisbon",
  outlook: { status: "none", lastSyncedAt: null },
  view: "week",
  date: "2026-11-17",
  today: "2026-11-16",
  monday: "2026-11-16",
  previous: "2026-11-09",
  next: "2026-11-23",
  thisWeek: "2026-11-16",
  days: ["2026-11-16", "2026-11-17", "2026-11-18"].map((date) => ({ date, label: date, isToday: false, events: date === "2026-11-17" ? [EVENT] : [], allDay: [] })),
  lead: [],
};

describe("values of an event", () => {
  it("a timed event: day, minutes, goal, location; the end may be past midnight", () => {
    expect(valuesOf(EVENT)).toEqual({
      title: "Lunch",
      allDay: false,
      date: "2026-11-17",
      startMin: 750,
      endMin: 810,
      firstDay: "2026-11-17",
      lastDay: "2026-11-17",
      goalId: "g1",
      mayOverlap: false,
      location: "Cafeteria",
      travelMode: null,
    });
    expect(valuesOf({ ...EVENT, startLocal: "2026-11-17T22:00", endLocal: "2026-11-18T01:00" })).toMatchObject({ startMin: 1320, endMin: 1500 });
  });

  it("an all-day event: its days, no goal, 9 to 10am ready for the switch", () => {
    expect(valuesOf(TRIP)).toMatchObject({ allDay: true, firstDay: "2026-11-20", lastDay: "2026-11-22", date: "2026-11-20", startMin: 540, endMin: 600, goalId: null, location: "" });
  });

  it("the switch keeps the day; a new first day keeps the number of days", () => {
    expect(switchAllDay(valuesOf(EVENT), true)).toEqual({ allDay: true, firstDay: "2026-11-17", lastDay: "2026-11-17" });
    expect(switchAllDay(valuesOf(TRIP), false)).toEqual({ allDay: false, date: "2026-11-20", startMin: 540, endMin: 600 });
    expect(moveFirstDay(valuesOf(TRIP), "2026-11-30")).toEqual({ firstDay: "2026-11-30", lastDay: "2026-12-02" });
  });

  it("a new event from the small card's draft", () => {
    expect(newValues({ start: "2026-11-17T09:00", end: "2026-11-17T10:30", title: "Read", goalId: "g1" })).toMatchObject({
      title: "Read",
      date: "2026-11-17",
      startMin: 540,
      endMin: 630,
      goalId: "g1",
      location: "",
    });
  });
});

describe("what is sent", () => {
  it("edit_event gets every field with the change and the updated_at last seen (R4)", () => {
    const values = { ...valuesOf(EVENT), title: "Long lunch", endMin: 870, location: "  " };
    expect(editBody(EVENT, values, EVENT.updatedAt)).toEqual({
      title: "Long lunch",
      start: "2026-11-17T12:30",
      end: "2026-11-17T14:30",
      mayOverlap: false,
      goalId: "g1",
      location: null,
      travelMode: null,
      updatedAt: "2026-11-15T10:00:00.000Z",
    });
    // A way of getting there chosen for this event is sent with it; null means the standard from the settings.
    expect(editBody(EVENT, { ...valuesOf(EVENT), travelMode: "transit" }, "u")).toMatchObject({ travelMode: "transit" });
    expect(editBody(EVENT, { ...valuesOf(EVENT), travelMode: null }, "u")).toMatchObject({ travelMode: null });
    expect(editBody(EVENT, { ...valuesOf(EVENT), endMin: 1500 }, "u", "this_and_following")).toMatchObject({ end: "2026-11-18T01:00", scope: "this_and_following" });
  });

  it("an all-day event sends its days and location, no times or goal", () => {
    expect(editBody(TRIP, { ...valuesOf(TRIP), location: "Porto" }, "u")).toEqual({
      title: "Trip",
      allDay: true,
      firstDay: "2026-11-20",
      lastDay: "2026-11-22",
      location: "Porto",
      updatedAt: "u",
    });
  });

  it("an Outlook event sends only its goal (R11)", () => {
    const outlook = { ...EVENT, source: "outlook" as const };
    expect(editBody(outlook, { ...valuesOf(outlook), goalId: null, title: "x", location: "y" }, "u")).toEqual({ goalId: null, updatedAt: "u" });
  });

  it("create_event gets the repeat of a new timed event, never of an all-day one", () => {
    const repeat = { frequency: "weekly" as const, weekdays: [2], until: "2026-12-15" };
    expect(createBody(newValues({ start: "2026-11-17T09:00", end: "2026-11-17T10:00", title: "Gym" }), repeat)).toMatchObject({ title: "Gym", repeat });
    expect(createBody({ ...valuesOf(TRIP) }, repeat)).not.toHaveProperty("repeat");
  });
});

describe("shown at once", () => {
  it("moves the block to its new time and title in the week", () => {
    const change = editedChange(EVENT, { ...valuesOf(EVENT), title: "Long lunch", startMin: 780, endMin: 900 }, "Europe/Lisbon");
    const [moved] = change!.week!(WEEK).days[1].events;
    expect(moved).toMatchObject({ id: "e1", title: "Long lunch", startLocal: "2026-11-17T13:00", endLocal: "2026-11-17T15:00", location: "Cafeteria" });
  });

  it("moves it to another day, or to the all-day row", () => {
    const later = editedChange(EVENT, { ...valuesOf(EVENT), date: "2026-11-18" }, "Europe/Lisbon")!.week!(WEEK);
    expect(later.days[1].events).toEqual([]);
    expect(later.days[2].events.map((e) => e.id)).toEqual(["e1"]);
    const allDay = editedChange(EVENT, { ...valuesOf(EVENT), ...switchAllDay(valuesOf(EVENT), true) }, "Europe/Lisbon")!.week!(WEEK);
    expect(allDay.days[1].allDay.map((e) => [e.id, e.goalId])).toEqual([["e1", null]]);
  });

  it("shows nothing at once for 'this and following' (the re-read brings each event)", () => {
    expect(editedChange(EVENT, valuesOf(EVENT), "Europe/Lisbon", "this_and_following")).toBeNull();
  });

  it("an Outlook event changes only its goal on screen", () => {
    const outlook = { ...EVENT, source: "outlook" as const };
    const week = { ...WEEK, days: WEEK.days.map((d) => ({ ...d, events: d.events.map(() => outlook) })) };
    const [shown] = editedChange(outlook, { ...valuesOf(outlook), goalId: null, title: "x", startMin: 0 }, "Europe/Lisbon")!.week!(week).days[1].events;
    expect(shown).toMatchObject({ title: "Lunch", goalId: null, startLocal: "2026-11-17T12:30" });
  });
});

describe("the answer", () => {
  it("becomes the editor's event with the new updated_at; the calculated marks stay", () => {
    const answer = { ok: true as const, status: 200, message: "Event saved.", data: { event: { ...EVENT, title: "Long lunch", updatedAt: "2026-11-15T11:00:00.000Z" } } };
    expect(eventFromAnswer(answer, "Europe/Lisbon", EVENT)).toMatchObject({ title: "Long lunch", updatedAt: "2026-11-15T11:00:00.000Z", conflict: true, startLocal: "2026-11-17T12:30" });
  });

  it("the newer of the editor's and the calendar's copy is the base of the next save", () => {
    const later = { ...EVENT, updatedAt: "2026-11-15T12:00:00.000Z" };
    expect(newer(EVENT, later)).toBe(later);
    expect(newer(later, EVENT)).toBe(later);
    expect(newer(EVENT, null)).toBe(EVENT);
    expect(newer(EVENT, { ...later, id: "other" })).toBe(EVENT);
  });
});

// Spec 17: the Save button shows only when the fields differ from the saved event.
describe("whether something changed", () => {
  it("is false for the saved event's own values", () => {
    expect(isChanged(EVENT, valuesOf(EVENT))).toBe(false);
    expect(isChanged(TRIP, valuesOf(TRIP))).toBe(false);
  });

  it("is true for a new title, time, goal, location or overlap choice", () => {
    const values = valuesOf(EVENT);
    expect(isChanged(EVENT, { ...values, title: "Lunch with Lea" })).toBe(true);
    expect(isChanged(EVENT, { ...values, endMin: values.endMin + 30 })).toBe(true);
    expect(isChanged(EVENT, { ...values, date: "2026-11-18" })).toBe(true);
    expect(isChanged(EVENT, { ...values, goalId: null })).toBe(true);
    expect(isChanged(EVENT, { ...values, location: "" })).toBe(true);
    expect(isChanged(EVENT, { ...values, mayOverlap: true })).toBe(true);
    expect(isChanged(EVENT, { ...values, travelMode: "walking" })).toBe(true);
    expect(isChanged(TRIP, { ...valuesOf(TRIP), lastDay: "2026-11-23" })).toBe(true);
  });

  it("is false again when a change is taken back, and for spaces around the title or the location", () => {
    const values = valuesOf(EVENT);
    expect(isChanged(EVENT, { ...values, title: "Lunch" })).toBe(false);
    expect(isChanged(EVENT, { ...values, title: " Lunch " })).toBe(false);
    expect(isChanged(EVENT, { ...values, location: "Cafeteria " })).toBe(false);
  });

  it("a way of getting there taken back is no change", () => {
    const values = valuesOf(EVENT);
    expect(isChanged(EVENT, { ...values, travelMode: "walking" })).toBe(true);
    expect(isChanged({ ...EVENT, travelMode: "walking" }, { ...values, travelMode: "walking" })).toBe(false);
    expect(valuesOf({ ...EVENT, travelMode: "cycling" }).travelMode).toBe("cycling");
  });

  it("an Outlook event counts only its goal (R11)", () => {
    const outlook: WeekEvent = { ...EVENT, source: "outlook" };
    expect(isChanged(outlook, { ...valuesOf(outlook), title: "Other" })).toBe(false);
    expect(isChanged(outlook, { ...valuesOf(outlook), goalId: null })).toBe(true);
  });
});

describe("after a save, typing done meanwhile is kept", () => {
  const sent = { ...valuesOf(EVENT), title: " Lunch with Ana " };
  const saved = { ...valuesOf(EVENT), title: "Lunch with Ana", location: "Cafeteria" };

  it("takes the saved values when nothing was typed meanwhile", () => {
    expect(untouchedPatch(sent, sent, saved)).toEqual(saved);
  });

  it("leaves out only the field that was changed meanwhile", () => {
    const patch = untouchedPatch(sent, { ...sent, location: "Library" }, saved);
    expect(patch).not.toHaveProperty("location");
    expect(patch.title).toBe("Lunch with Ana");
  });
});
