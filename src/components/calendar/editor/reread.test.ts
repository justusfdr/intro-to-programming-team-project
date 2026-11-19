// Spec 55: the owner's open editor shows what someone who accepted an invitation changed (the shared
// notes), once the calendar has read the newer copy, without dropping what the owner typed meanwhile.
import { describe, expect, it } from "vitest";
import type { WeekEvent } from "@/lib/events/types";
import { valuesAfterReread, valuesOf } from "./values";

const EVENT: WeekEvent = {
  id: "e1",
  title: "Group project meeting",
  allDay: false,
  startAt: "2026-11-20T11:00:00.000Z",
  endAt: "2026-11-20T12:00:00.000Z",
  firstDay: null,
  lastDay: null,
  mayOverlap: false,
  status: "planned",
  goalId: null,
  seriesId: null,
  source: "app",
  location: "Library, room 4",
  notSent: false,
  updatedAt: "2026-11-19T10:00:00.000Z",
  conflict: false,
  startTime: "11:00",
  endTime: "12:00",
  endDay: null,
  startLocal: "2026-11-20T11:00",
  endLocal: "2026-11-20T12:00",
  notes: "Bring the slides",
};

const NEWER: WeekEvent = { ...EVENT, notes: "Bring the slides and a laptop", updatedAt: "2026-11-19T10:05:00.000Z" };

describe("valuesAfterReread", () => {
  it("a newer copy fills the notes the owner has not touched", () => {
    expect(valuesAfterReread(EVENT, valuesOf(EVENT), NEWER)).toMatchObject({ notes: "Bring the slides and a laptop", title: "Group project meeting" });
  });

  it("keeps what the owner typed: a typed title stays and the newer notes still arrive", () => {
    const typed = { ...valuesOf(EVENT), title: "Group meeting" };
    const patch = valuesAfterReread(EVENT, typed, NEWER)!;
    expect(patch.title).toBeUndefined();
    expect(patch.notes).toBe("Bring the slides and a laptop");
    // Notes typed by the owner stay theirs (Save then meets "Changed on another device", R4).
    expect(valuesAfterReread(EVENT, { ...valuesOf(EVENT), notes: "Mine" }, NEWER)!.notes).toBeUndefined();
  });

  it("changes nothing for the same or an older copy, another event or none", () => {
    expect(valuesAfterReread(EVENT, valuesOf(EVENT), EVENT)).toBeNull();
    expect(valuesAfterReread(NEWER, valuesOf(NEWER), EVENT)).toBeNull();
    expect(valuesAfterReread(EVENT, valuesOf(EVENT), { ...NEWER, id: "e2" })).toBeNull();
    expect(valuesAfterReread(EVENT, valuesOf(EVENT), null)).toBeNull();
  });
});
