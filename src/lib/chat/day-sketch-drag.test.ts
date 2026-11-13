// Tests for the open draft's column with room to drag (spec 22): the whole visible day, widened to
// everything it shows; keys for the blocks the draft creates or moves; which blocks can be dragged; and
// a dragged span kept inside the column.
import { describe, expect, it } from "vitest";
import { canDragBlock, keepInWindow, sketchDraft } from "./day-sketch";
import type { DraftChangeDto, ProposedEventDto } from "./types";

const TZ = "Europe/Lisbon"; // UTC in November
const proposal = (title: string, start: string, end: string): ProposedEventDto => ({
  title,
  startAt: `2026-11-${start}:00.000Z`,
  endAt: `2026-11-${end}:00.000Z`,
  goalId: null,
});
const move: DraftChangeDto = {
  kind: "move",
  eventId: "ev-1",
  title: "Lecture",
  goalId: null,
  oldStartAt: "2026-11-17T09:00:00.000Z",
  oldEndAt: "2026-11-17T10:00:00.000Z",
  startAt: "2026-11-17T14:00:00.000Z",
  endAt: "2026-11-17T15:00:00.000Z",
};
const remove: DraftChangeDto = { ...move, kind: "delete", eventId: "ev-2", title: "Gym", oldStartAt: "2026-11-17T17:00:00.000Z", oldEndAt: "2026-11-17T18:00:00.000Z", startAt: null, endAt: null };
const VISIBLE = { startHour: 7, endHour: 21 };

describe("the open draft's column", () => {
  it("shows the whole visible day instead of the hours around the proposals", () => {
    const [day] = sketchDraft([proposal("Read", "18T09:30", "18T10:15")], [], TZ, [], VISIBLE);
    expect([day.startMin, day.endMin]).toEqual([7 * 60, 21 * 60]);
    expect(day.hours[0]).toBe(7 * 60);
    // Without the visible hours (a draft that is not open): the short window, as before.
    const [short] = sketchDraft([proposal("Read", "18T09:30", "18T10:15")], [], TZ);
    expect([short.startMin, short.endMin]).toEqual([8 * 60, 12 * 60]);
  });

  it("widens to everything it has to show, in whole hours, never past the day", () => {
    const [day] = sketchDraft([proposal("Early run", "18T05:30", "18T06:15"), proposal("Party", "18T21:00", "18T23:30")], [], TZ, [], VISIBLE);
    expect([day.startMin, day.endMin]).toEqual([5 * 60, 24 * 60]);
  });

  it("gives each new event and each moved event a key; deleted events and old places have none", () => {
    const [day] = sketchDraft([proposal("Study", "17T11:00", "17T12:00"), proposal("Run", "17T18:00", "17T19:00")], [], TZ, [move, remove], VISIBLE);
    expect(day.proposals.map((b) => [b.title, b.key])).toEqual([
      ["Study", "new:0"],
      ["Run", "new:1"],
    ]);
    expect(day.moved.map((b) => b.key)).toEqual(["move:ev-1"]);
    expect([...day.removed, ...day.oldPlaces].map((b) => b.key)).toEqual([undefined, undefined]);
  });

  it("keeps the place in the draft's list as the key, also when the days are drawn apart", () => {
    const days = sketchDraft([proposal("Wed", "18T09:00", "18T10:00"), proposal("Tue", "17T09:00", "17T10:00")], [], TZ, [], VISIBLE);
    expect(days.map((d) => [d.date, d.proposals[0].key])).toEqual([
      ["2026-11-17", "new:1"],
      ["2026-11-18", "new:0"],
    ]);
  });
});

describe("canDragBlock", () => {
  it("allows the draft's own blocks that end on their day (also at midnight), not the part past midnight", () => {
    const [day] = sketchDraft([proposal("Late", "17T22:00", "18T00:00"), proposal("Night", "17T23:00", "18T01:00")], [], TZ, [], { startHour: 7, endHour: 24 });
    // Overlapping proposals are only a drawing test here; the server's checks refuse them.
    expect(day.proposals.map((b) => [b.title, canDragBlock(b)])).toEqual([
      ["Late", true],
      ["Night", false],
    ]);
    const [withChanges] = sketchDraft([], [], TZ, [move, remove], VISIBLE);
    expect(withChanges.removed.map(canDragBlock)).toEqual([false]);
    expect(withChanges.oldPlaces.map(canDragBlock)).toEqual([false]);
    expect(withChanges.moved.map(canDragBlock)).toEqual([true]);
  });
});

describe("keepInWindow", () => {
  const day = { startMin: 7 * 60, endMin: 21 * 60 };
  it("keeps a span's length and keeps it inside the column", () => {
    expect(keepInWindow({ startMin: 6 * 60, endMin: 7 * 60 }, day)).toEqual({ startMin: 7 * 60, endMin: 8 * 60 });
    expect(keepInWindow({ startMin: 20 * 60 + 30, endMin: 22 * 60 }, day)).toEqual({ startMin: 19 * 60 + 30, endMin: 21 * 60 });
    expect(keepInWindow({ startMin: 9 * 60, endMin: 10 * 60 }, day)).toEqual({ startMin: 9 * 60, endMin: 10 * 60 });
  });
});
