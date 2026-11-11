import { describe, expect, it } from "vitest";
import { conflictIds, type TimedEvent } from "./conflicts";

function event(id: string, start: string, end: string, mayOverlap = false): TimedEvent {
  return { id, startAt: new Date(`2026-11-16T${start}:00Z`), endAt: new Date(`2026-11-16T${end}:00Z`), mayOverlap };
}

describe("conflict mark (R10)", () => {
  it("marks both of two overlapping events when either may not overlap", () => {
    expect(conflictIds([event("a", "09:00", "11:00"), event("b", "10:00", "12:00", true)])).toEqual(new Set(["a", "b"]));
  });

  it("does not mark events that may both overlap", () => {
    expect(conflictIds([event("a", "09:00", "11:00", true), event("b", "10:00", "12:00", true)])).toEqual(new Set());
  });

  it("does not mark 09:00–10:00 and 10:00–11:00: ending exactly when the next starts is no overlap", () => {
    expect(conflictIds([event("a", "09:00", "10:00"), event("b", "10:00", "11:00")])).toEqual(new Set());
  });

  it("marks an event inside another one, and only the events that overlap", () => {
    const events = [event("long", "09:00", "17:00"), event("inside", "12:00", "13:00"), event("later", "18:00", "19:00")];
    expect(conflictIds(events)).toEqual(new Set(["long", "inside"]));
  });

  it("finds an overlap with an event that started earlier and is still running", () => {
    const events = [event("a", "08:00", "12:00"), event("b", "09:00", "09:30", true), event("c", "11:00", "13:00", true)];
    expect(conflictIds(events)).toEqual(new Set(["a", "b", "c"]));
  });

  it("does not depend on the order of the input", () => {
    const events = [event("b", "10:00", "12:00"), event("a", "09:00", "11:00")];
    expect(conflictIds(events)).toEqual(new Set(["a", "b"]));
  });
});
