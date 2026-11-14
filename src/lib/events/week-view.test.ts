import { describe, expect, it } from "vitest";
import type { EventDto, WeekData } from "@/lib/events/types";
import { withEventChange } from "./week-view";

// A change to one event must not wipe what the other timed events carry (guests, organizer, demo).
const OTHER: EventDto = {
  id: "a",
  title: "Team call",
  allDay: false,
  startAt: "2026-11-17T09:00:00.000Z",
  endAt: "2026-11-17T10:00:00.000Z",
  firstDay: null,
  lastDay: null,
  mayOverlap: false,
  status: "planned",
  goalId: null,
  seriesId: null,
  source: "outlook",
  location: null,
  notSent: false,
  updatedAt: "2026-11-15T10:00:00.000Z",
  guests: ["ana@example.com"],
  organizer: "boss@example.com",
  demo: true,
};

const DAYS = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"];

function week(): WeekData {
  const empty = { events: [], allDay: [] };
  const first: WeekData = {
    timeZone: "UTC",
    outlook: { status: "connected", lastSyncedAt: null },
    view: "week",
    date: "2026-11-17",
    today: "2026-11-17",
    monday: "2026-11-16",
    previous: "2026-11-09",
    next: "2026-11-23",
    thisWeek: "2026-11-16",
    days: DAYS.map((date) => ({ date, label: date, isToday: false, ...empty })),
    lead: [],
  };
  return withEventChange(first, { event: OTHER });
}

describe("withEventChange keeps the other timed events whole", () => {
  it("guests, organizer and demo survive a change to another event", () => {
    const changed = withEventChange(week(), { event: { ...OTHER, id: "b", title: "Other", guests: undefined, organizer: undefined, demo: undefined } });
    const kept = changed.days[1].events.find((e) => e.id === "a");
    expect(kept).toMatchObject({ guests: ["ana@example.com"], organizer: "boss@example.com", demo: true });
  });
});
