// An event's notes on screen (issue #5, spec 27), as the browser first receives the markup: the NOTES
// section in our own event's editor and in the new event's, none for an Outlook event (R11), the count
// from 1,800 characters and the message above 2,000 (Save disabled). Also what the editor and the calendar
// send and show: notes wait for Save, count as a change, go along with the Undo of a delete, and stay
// on the event in the calendar's quick updates (a drag, a save shown at once).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { cleanNotes, notesLength, notesTooLong } from "@/lib/events/notes";
import type { AllDayEvent, WeekData, WeekEvent } from "@/lib/events/types";
import { withEventChange } from "@/lib/events/week-view";
import { createBody, editBody, editedChange, isChanged, newValues, untouchedPatch, valuesOf } from "./editor/values";
import { movedChange, recreateBody } from "./event-changes";
import { EditEventCard, NewEventCard } from "./EventEditor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const noop = () => {};

function event(fields: Partial<WeekEvent> = {}): WeekEvent {
  return {
    id: "e1",
    title: "Lunch",
    startAt: "2026-11-17T12:30:00.000Z",
    endAt: "2026-11-17T13:30:00.000Z",
    mayOverlap: false,
    status: "planned",
    allDay: false,
    firstDay: null,
    lastDay: null,
    seriesId: null,
    source: "app",
    location: null,
    notSent: false,
    goalId: null,
    updatedAt: "2026-11-15T10:00:00.000Z",
    conflict: false,
    startTime: "12:30",
    endTime: "13:30",
    endDay: null,
    startLocal: "2026-11-17T12:30",
    endLocal: "2026-11-17T13:30",
    ...fields,
  };
}

const TRIP: AllDayEvent = {
  id: "a1",
  title: "Trip",
  allDay: true,
  firstDay: "2026-11-20",
  lastDay: "2026-11-21",
  mayOverlap: false,
  status: "planned",
  goalId: null,
  seriesId: null,
  source: "app",
  location: null,
  notSent: false,
  updatedAt: "2026-11-15T10:00:00.000Z",
  notes: "Pack light",
};

const NOTE = "Ask Ana about the exam.";
const COMMON = { goals: [], timeZone: "Europe/Lisbon", today: "2026-11-16", anchor: null, onClose: noop };
const edit = (e: WeekEvent) => renderToStaticMarkup(<EditEventCard event={e} {...COMMON} />);

describe("the NOTES section", () => {
  it("our own event: a section 'Notes' with the saved text, in the look of the others, before OVERLAP", () => {
    const html = edit(event({ notes: NOTE }));
    expect(html).toMatch(/<p class="text-\[11px\] font-medium uppercase tracking-\[0\.06em\] text-ink-3">Notes<\/p>/);
    expect(html).toMatch(/<textarea[^>]*aria-label="Notes"[^>]*placeholder="Add notes"[^>]*>Ask Ana about the exam\.<\/textarea>/);
    expect(html.indexOf(">Notes</p>")).toBeGreaterThan(html.indexOf(">Location</p>"));
    expect(html.indexOf(">Overlap</p>")).toBeGreaterThan(html.indexOf(">Notes</p>"));
    // A short note shows no count.
    expect(html).not.toMatch(/\/ 2,000/);
  });

  it("an empty field for an event without notes, and also on an all-day event", () => {
    expect(edit(event())).toMatch(/<textarea[^>]*aria-label="Notes"[^>]*><\/textarea>/);
    expect(renderToStaticMarkup(<EditEventCard event={TRIP} {...COMMON} />)).toContain(">Pack light</textarea>");
  });

  it("an Outlook event has no notes section (R11)", () => {
    const html = edit(event({ source: "outlook" }));
    expect(html).not.toContain(">Notes</p>");
    expect(html).not.toContain('aria-label="Notes"');
  });

  it("the new event's editor ('Add details') has the section too", () => {
    const html = renderToStaticMarkup(<NewEventCard draft={{ start: "2026-11-17T09:00", end: "2026-11-17T10:00" }} {...COMMON} />);
    expect(html).toContain(">Notes</p>");
    expect(html).toContain('aria-label="Notes"');
  });

  it("shows the count quietly from 1,800 characters on, and the message above 2,000", () => {
    expect(edit(event({ notes: "x".repeat(1799) }))).not.toMatch(/\/ 2,000/);
    expect(edit(event({ notes: "x".repeat(1800) }))).toMatch(/>1,800 \/ 2,000<\/p>/);
    const over = edit(event({ notes: "x".repeat(2001) }));
    expect(over).toMatch(/role="alert"[^>]*>Notes can be at most 2,000 characters \(2,001\)<\/p>/);
    expect(over).toMatch(/<textarea[^>]*aria-invalid="true"/);
  });
});

describe("the rule shared by the editor and the server", () => {
  it("counts characters, not UTF-16 units, as the database does", () => {
    expect(notesLength("😀".repeat(2000))).toBe(2000);
    expect(notesTooLong("😀".repeat(2000))).toBe(false);
    expect(notesTooLong("😀".repeat(2001))).toBe(true);
    expect(notesTooLong(`${"x".repeat(2000)}   \n`)).toBe(false);
  });

  it("trims whitespace at the end only; empty is none", () => {
    expect(cleanNotes("  indented\nline  \n\n")).toBe("  indented\nline");
    expect(cleanNotes("   ")).toBeNull();
    expect(cleanNotes("")).toBeNull();
    expect(cleanNotes(undefined)).toBeNull();
  });
});

describe("what the editor sends and shows", () => {
  it("valuesOf carries the saved notes; typing them counts as a change (Save appears), spaces at the end do not", () => {
    const e = event({ notes: NOTE });
    expect(valuesOf(e).notes).toBe(NOTE);
    expect(isChanged(e, valuesOf(e))).toBe(false);
    expect(isChanged(e, { ...valuesOf(e), notes: `${NOTE}  \n` })).toBe(false);
    expect(isChanged(e, { ...valuesOf(e), notes: `${NOTE} Also the slides.` })).toBe(true);
    expect(isChanged(e, { ...valuesOf(e), notes: "" })).toBe(true);
    expect(isChanged(event(), { ...valuesOf(event()), notes: "New" })).toBe(true);
    expect(isChanged(event(), { ...valuesOf(event()), notes: "  " })).toBe(false);
    // An Outlook event counts only its goal (R11).
    const outlook = event({ source: "outlook" });
    expect(isChanged(outlook, { ...valuesOf(outlook), notes: "Mine" })).toBe(false);
  });

  it("edit_event gets the notes trimmed at the end, null to clear them, nothing when there are none", () => {
    expect(editBody(event(), { ...valuesOf(event()), notes: "  Hi \n" }, "u")).toMatchObject({ notes: "  Hi" });
    expect(editBody(event({ notes: NOTE }), { ...valuesOf(event({ notes: NOTE })), notes: " " }, "u")).toMatchObject({ notes: null });
    expect(editBody(event(), valuesOf(event()), "u")).not.toHaveProperty("notes");
    expect(editBody(TRIP, valuesOf(TRIP), "u")).toMatchObject({ allDay: true, notes: "Pack light" });
    expect(editBody(event({ source: "outlook" }), { ...valuesOf(event()), notes: "Mine" }, "u")).toEqual({ goalId: null, updatedAt: "u" });
  });

  it("create_event gets the notes of a new event (also for a series), none when empty", () => {
    const values = { ...newValues({ start: "2026-11-17T09:00", end: "2026-11-17T10:00", title: "Gym" }), notes: "Bring a towel " };
    expect(createBody(values, null)).toMatchObject({ notes: "Bring a towel" });
    expect(createBody(values, { frequency: "daily", weekdays: [], until: "2026-11-20" })).toMatchObject({ notes: "Bring a towel" });
    expect(createBody({ ...values, notes: "" }, null)).not.toHaveProperty("notes");
  });

  it("after a save, notes typed meanwhile are kept, otherwise the saved ones are shown", () => {
    const sent = { ...valuesOf(event()), notes: "First " };
    const saved = { ...valuesOf(event()), notes: "First" };
    expect(untouchedPatch(sent, sent, saved).notes).toBe("First");
    expect(untouchedPatch(sent, { ...sent, notes: "First, then more" }, saved)).not.toHaveProperty("notes");
  });
});

describe("the calendar keeps the notes", () => {
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
    days: ["2026-11-17", "2026-11-20"].map((date) => ({
      date,
      label: date,
      isToday: false,
      events: date === "2026-11-17" ? [event({ notes: NOTE })] : [],
      allDay: date === "2026-11-20" ? [TRIP] : [],
    })),
    lead: [],
  };

  it("a drag shows the event at its new time with its notes, and a change of another event leaves them", () => {
    const moved = movedChange(event({ notes: NOTE }), "2026-11-17T14:00", "2026-11-17T15:00", "Europe/Lisbon")!.week!(WEEK);
    expect(moved.days[0].events).toMatchObject([{ id: "e1", startTime: "14:00", notes: NOTE }]);
    expect(moved.days[1].allDay).toMatchObject([{ id: "a1", notes: "Pack light" }]);
  });

  it("a save shows the new notes at once; clearing them removes them", () => {
    const e = event({ notes: NOTE });
    const shown = editedChange(e, { ...valuesOf(e), notes: "Changed" }, "Europe/Lisbon")!.week!(WEEK);
    expect(shown.days[0].events[0].notes).toBe("Changed");
    const cleared = editedChange(e, { ...valuesOf(e), notes: "" }, "Europe/Lisbon")!.week!(WEEK);
    expect(cleared.days[0].events[0].notes).toBeUndefined();
  });

  it("the Undo of a delete creates the event again with its notes (R38)", () => {
    expect(recreateBody(event({ notes: NOTE }))).toMatchObject({ title: "Lunch", notes: NOTE });
    expect(recreateBody(TRIP)).toMatchObject({ allDay: true, notes: "Pack light" });
    expect(recreateBody(event())).not.toHaveProperty("notes");
  });

  it("the server's answer, shown in the week, keeps the notes", () => {
    const week = withEventChange(WEEK, { event: { ...event({ notes: "From the server" }), startAt: "2026-11-17T12:30:00.000Z", endAt: "2026-11-17T13:30:00.000Z" } });
    expect(week.days[0].events[0].notes).toBe("From the server");
  });
});
