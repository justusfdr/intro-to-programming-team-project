// Tests for a draft with moves and deletes drawn as its days (spec 20): the moved event at its new
// time with where it was, its old place, the deleted event, the old day of a move, and the changed
// events no longer drawn as the calendar's own.
import { describe, expect, it } from "vitest";
import type { EventDto } from "@/lib/events/types";
import { draftDaysOf, sketchDraft } from "./day-sketch";
import type { DraftChangeDto } from "./types";

const TZ = "Europe/Lisbon"; // UTC+0 in November

const event = (fields: Partial<EventDto>): EventDto => ({
  id: "e",
  title: "Event",
  allDay: false,
  startAt: null,
  endAt: null,
  firstDay: null,
  lastDay: null,
  mayOverlap: false,
  status: "planned",
  goalId: null,
  seriesId: null,
  source: "app",
  location: null,
  notSent: false,
  updatedAt: "2026-11-01T00:00:00.000Z",
  ...fields,
});

const move = (id: string, title: string, from: [string, string], to: [string, string]): DraftChangeDto => ({
  kind: "move",
  eventId: id,
  title,
  goalId: null,
  oldStartAt: `2026-11-${from[0]}:00.000Z`,
  oldEndAt: `2026-11-${from[1]}:00.000Z`,
  startAt: `2026-11-${to[0]}:00.000Z`,
  endAt: `2026-11-${to[1]}:00.000Z`,
});
const remove = (id: string, title: string, at: [string, string]): DraftChangeDto => ({
  kind: "delete",
  eventId: id,
  title,
  goalId: null,
  oldStartAt: `2026-11-${at[0]}:00.000Z`,
  oldEndAt: `2026-11-${at[1]}:00.000Z`,
  startAt: null,
  endAt: null,
});

describe("sketchDraft with changes", () => {
  it("a move on the same day: drawn at its new time with where it was, its old place outlined; not drawn as the calendar's own", () => {
    const calendar = [
      event({ id: "a", title: "Lecture", startAt: "2026-11-17T09:00:00Z", endAt: "2026-11-17T10:00:00Z" }),
      event({ id: "b", title: "Gym", startAt: "2026-11-17T17:00:00Z", endAt: "2026-11-17T18:00:00Z" }),
      event({ id: "c", title: "Lunch", startAt: "2026-11-17T12:00:00Z", endAt: "2026-11-17T13:00:00Z" }),
    ];
    const [day, ...rest] = sketchDraft([], calendar, TZ, [move("a", "Lecture", ["17T09:00", "17T10:00"], ["17T14:00", "17T15:00"]), remove("b", "Gym", ["17T17:00", "17T18:00"])]);
    expect(rest).toEqual([]);
    expect(day.moved.map((b) => [b.title, b.startTime, b.fromTime, b.fromDate])).toEqual([["Lecture", "14:00", "09:00", "2026-11-17"]]);
    expect(day.oldPlaces.map((b) => [b.title, b.startTime, b.toDate])).toEqual([["Lecture", "09:00", "2026-11-17"]]);
    expect(day.removed.map((b) => [b.title, b.startTime])).toEqual([["Gym", "17:00"]]);
    expect(day.existing.map((b) => b.title)).toEqual(["Lunch"]);
    // The window covers the old place, the new place and the removed event: 8:00 to 19:00.
    expect([day.startMin, day.endMin]).toEqual([8 * 60, 19 * 60]);
  });

  it("a move to another day: a section for the old day and one for the new", () => {
    const changes = [move("a", "Lecture", ["16T15:00", "16T16:00"], ["18T10:00", "18T11:00"])];
    expect(draftDaysOf([], TZ, changes)).toEqual(["2026-11-16", "2026-11-18"]);
    const [monday, wednesday] = sketchDraft([], [], TZ, changes);
    expect(monday.oldPlaces.map((b) => [b.title, b.toDate])).toEqual([["Lecture", "2026-11-18"]]);
    expect(monday.moved).toEqual([]);
    expect(wednesday.moved.map((b) => [b.title, b.fromDate, b.fromTime])).toEqual([["Lecture", "2026-11-16", "15:00"]]);
  });

  it("without changes nothing new is drawn", () => {
    const [day] = sketchDraft([{ title: "Run", startAt: "2026-11-17T08:00:00.000Z", endAt: "2026-11-17T09:00:00.000Z", goalId: null }], [], TZ);
    expect([day.moved, day.oldPlaces, day.removed]).toEqual([[], [], []]);
  });
});
