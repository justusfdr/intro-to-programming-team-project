import { describe, expect, it } from "vitest";
import { conflictIds, overlapOf, overlaps, tripConflictIds, type TimedEvent } from "./conflicts";

function event(id: string, start: string, end: string, mayOverlap = false): TimedEvent {
  return { id, startAt: new Date(`2026-11-16T${start}:00Z`), endAt: new Date(`2026-11-16T${end}:00Z`), mayOverlap };
}

describe("conflict mark (R10)", () => {
  it("That's fine on one event settles the pair: neither is marked", () => {
    expect(conflictIds([event("a", "09:00", "11:00"), event("b", "10:00", "12:00", true)])).toEqual(new Set());
    expect(conflictIds([event("a", "09:00", "11:00"), event("b", "10:00", "12:00")])).toEqual(new Set(["a", "b"]));
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
    expect(conflictIds(events)).toEqual(new Set());
  });

  it("does not depend on the order of the input", () => {
    const events = [event("b", "10:00", "12:00"), event("a", "09:00", "11:00")];
    expect(conflictIds(events)).toEqual(new Set(["a", "b"]));
  });

  it("overlaps(): touching ends are no overlap, one minute more is", () => {
    expect(overlaps(event("a", "09:00", "10:00"), event("b", "10:00", "11:00"))).toBe(false);
    expect(overlaps(event("b", "10:00", "11:00"), event("a", "09:00", "10:00"))).toBe(false);
    expect(overlaps(event("a", "09:00", "10:01"), event("b", "10:00", "11:00"))).toBe(true);
  });
});

describe("the overlap notice (issue #106)", () => {
  const at = (t: string) => new Date(`2026-11-16T${t}:00Z`);
  const named = (id: string, start: string, end: string, mayOverlap = false) => ({ ...event(id, start, end, mayOverlap), title: id });

  it("names the other event first, then the event the trip runs into", () => {
    const lunch = named("Lunch", "13:15", "14:15");
    const gym = named("Gym", "14:45", "16:45");
    const call = named("Call", "15:00", "15:30");
    expect(overlapOf(gym, [lunch, gym, call], at("14:00"))).toEqual({ kind: "event", other: call });
    expect(overlapOf(gym, [lunch, gym], at("14:00"))).toEqual({ kind: "trip", other: lunch });
    expect(overlapOf(gym, [lunch, gym], at("14:20"))).toBeNull();
    expect(overlapOf(gym, [lunch, gym], null)).toBeNull();
  });

  it("says nothing for an event that was accepted, or when the other one was", () => {
    const gym = named("Gym", "14:45", "16:45", true);
    expect(overlapOf(gym, [named("Lunch", "13:15", "15:00")], at("14:00"))).toBeNull();
    expect(overlapOf(named("Gym", "14:45", "16:45"), [named("Lunch", "13:15", "15:00", true)], at("14:00"))).toBeNull();
  });

  it("marks the events whose trip runs into another one", () => {
    const events = [event("lunch", "13:15", "14:15"), event("gym", "14:45", "16:45"), event("ok", "17:30", "18:30", true)];
    const leave: Record<string, Date> = { gym: at("14:00"), ok: at("16:00") };
    expect(tripConflictIds(events, (id) => leave[id])).toEqual(new Set(["gym"]));
  });
});
