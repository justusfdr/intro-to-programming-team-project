// The event editor's markup as first rendered.
// Rewritten for spec 16 (the prototype's frame) and spec 17 (the Save button): an existing event shows
// no Save button until a field was changed; the sections come in the prototype's order (header, chips, When, Goal, Location, then
// no Overlap any more); the all-day switch and the repeat choice sit in When; an event of a series still asks
// "This event" or "This and following events"; an Outlook event shows title, time and location as text
// (R11). Kept from spec 07 and 12: the all-day switch, Repeat only for a new event, Mark done and Start
// focus, the 12-hour times and month-first dates.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AllDayEvent, CalendarEvent, WeekEvent } from "@/lib/events/types";
import { EditEventCard, NewEventCard, SeriesQuestion } from "./EventEditor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const TIMED: WeekEvent = {
  id: "e1",
  title: "Statistics lecture",
  allDay: false,
  startAt: "2026-11-17T09:00:00.000Z",
  endAt: "2026-11-17T10:00:00.000Z",
  firstDay: null,
  lastDay: null,
  mayOverlap: false,
  status: "planned",
  goalId: null,
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

const GOALS = [{ id: "g1", title: "Run a half marathon", look: { color: "teal" as const, icon: "footprints" as const } }];
const COMMON = { goals: GOALS, timeZone: "Europe/Lisbon", today: "2026-11-16", anchor: null, onClose: () => {} };

const edit = (event: CalendarEvent) => renderToStaticMarkup(<EditEventCard event={event} {...COMMON} />);
const create = (draft: { start: string; end: string; title?: string; goalId?: string | null }) =>
  renderToStaticMarkup(<NewEventCard draft={draft} {...COMMON} />);

describe("an existing event", () => {
  it("shows no Save button while nothing was changed (spec 17)", () => {
    const html = edit(TIMED);
    expect(html).not.toMatch(/>Save</);
    expect(html).not.toMatch(/type="submit"/);
  });

  it("shows the sections in the prototype's order: title, When, Goal, Location, and no Overlap", () => {
    const html = edit(TIMED);
    const order = ['aria-label="Title"', ">When</p>", ">Goal</p>", ">Location</p>"].map((part) => html.indexOf(part));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).not.toContain(">Overlap</p>");
  });

  it("has the date button, start and end with the length, the all-day switch, and no Repeat", () => {
    const html = edit(TIMED);
    expect(html).toMatch(/<button type="button" aria-expanded="false" aria-label="Date: Tue, Nov 17"[^>]*><svg[^>]*lucide-calendar-days[^>]*>.*<span[^>]*>Tue, Nov 17<\/span><\/button>/s);
    expect(html).toMatch(/<input[^>]*aria-label="Start time"[^>]*value="09:00"/);
    expect(html).toMatch(/<input[^>]*aria-label="End time"[^>]*value="10:00"/);
    expect(html).toContain("End · 1h");
    expect(html).toMatch(/<label[^>]*>All day<input type="checkbox" role="switch"/);
    expect(html).not.toContain('aria-label="Repeat"');
  });

  it("has the location field with the pin and 'Add location', filled with the event's location", () => {
    expect(edit(TIMED)).toMatch(/<svg[^>]*lucide-map-pin[^>]*>.*<input aria-label="Location" placeholder="Add location" maxLength="200"[^>]*value=""/s);
    expect(edit({ ...TIMED, location: "Nova SBE, Carcavelos" })).toMatch(/<input aria-label="Location"[^>]*value="Nova SBE, Carcavelos"/);
  });

  it("has the footer: black Start focus, Mark done, the bin", () => {
    const html = edit(TIMED);
    expect(html).toMatch(/<a[^>]*bg-ink text-white[^>]*href="\/focus\?event=e1"[^>]*><svg[^>]*lucide-play[^>]*>.*Start focus<\/a>/s);
    expect(html).toContain(">Mark done</button>");
    expect(html).toMatch(/aria-label="Delete event"[^>]*><svg[^>]*lucide-trash/);
  });

  it("an all-day event shows its first and last day, and no times, goal, overlap, Mark done or Start focus", () => {
    const html = edit(EXAM);
    expect(html).toMatch(/<input type="checkbox" role="switch"[^>]*checked=""/);
    expect(html).toContain('aria-label="First day: Mon, Nov 16"');
    expect(html).toContain('aria-label="Last day: Fri, Nov 20"');
    for (const absent of ['aria-label="Start time"', ">Goal</p>", "May overlap", "Mark done", "Start focus"]) expect(html).not.toContain(absent);
    expect(html).toContain('aria-label="Delete event"');
  });

  it("an event of a series is marked 'Repeating' and has no 'All day' switch", () => {
    const html = edit({ ...TIMED, seriesId: "s1" });
    expect(html).toContain(">Repeating</span>");
    expect(html).not.toMatch(/All day<input[^>]*role="switch"/);
  });

  it("marks Done, Not sent to Outlook and an overlap as pills", () => {
    expect(edit({ ...TIMED, status: "done" })).toMatch(/bg-success-soft text-success">Done<\/span>/);
    expect(edit({ ...TIMED, status: "done" })).toContain(">Reopen</button>");
    expect(edit({ ...TIMED, notSent: true })).toContain("Not sent to Outlook</span>");
    expect(edit({ ...TIMED, conflict: true })).toContain("Overlaps another event</span>");
  });

  it("an Outlook event shows title, time and location as text, its goal chips and Mark done, no bin (R11)", () => {
    const html = edit({ ...TIMED, source: "outlook", location: "Nova SBE, Carcavelos" });
    expect(html).toContain(">Statistics lecture</p>");
    expect(html).toContain(">Tue, Nov 17 · 9 – 10am</p>");
    expect(html).toContain(">Time and title are managed in Outlook.</p>");
    expect(html).toMatch(/lucide-map-pin[^>]*>.*<span[^>]*>Nova SBE, Carcavelos<\/span><\/p>/s);
    expect(html).toContain("From Outlook</span>");
    expect(html).toMatch(/role="group" aria-label="Goal"/);
    expect(html).toContain("Mark done");
    for (const absent of ['aria-label="Title"', 'aria-label="Location"', 'aria-label="Start time"', 'role="switch"', "May overlap", "Delete event"]) {
      expect(html).not.toContain(absent);
    }
  });

  it("an all-day Outlook event has nothing to do in a footer", () => {
    const html = edit({ ...EXAM, source: "outlook" });
    expect(html).toContain(">Mon, Nov 16 – Fri, Nov 20 · All day</p>");
    expect(html).not.toContain("sticky bottom-0");
  });
});

describe("a new event from 'Add details'", () => {
  it("has the card's title and goal, the all-day switch, Repeat in When, and 'Add event'", () => {
    const html = create({ start: "2026-11-17T09:00", end: "2026-11-17T10:30", title: "Read chapter 4", goalId: "g1" });
    expect(html).toMatch(/<input aria-label="Title"[^>]*value="Read chapter 4"/);
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*Run a half marathon/s);
    expect(html).toMatch(/<label[^>]*>All day<input type="checkbox" role="switch"/);
    expect(html).toContain('role="group" aria-label="Repeat"');
    for (const option of ["Never", "Daily", "Weekly", "Monthly"]) expect(html).toMatch(new RegExp(`aria-pressed="(true|false)"[^>]*>${option}</button>`));
    expect(html).toMatch(/aria-pressed="true"[^>]*>Never<\/button>/);
    expect(html.indexOf(">When</p>")).toBeLessThan(html.indexOf('aria-label="Repeat"'));
    expect(html.indexOf('aria-label="Repeat"')).toBeLessThan(html.indexOf(">Goal</p>"));
    expect(html).toContain(">Add event</button>");
    expect(html).not.toContain("Mark done");
  });
});

describe("the series question", () => {
  it("asks 'This event' or 'This and following events' before saving or deleting an event of a series", () => {
    const save = renderToStaticMarkup(<SeriesQuestion kind="save" title="Statistics lecture" busy={false} onAnswer={() => {}} onCancel={() => {}} />);
    expect(save).toContain("Save changes to &#x27;Statistics lecture&#x27;?");
    const remove = renderToStaticMarkup(<SeriesQuestion kind="delete" title="Statistics lecture" busy={false} onAnswer={() => {}} onCancel={() => {}} />);
    expect(remove).toContain("Delete &#x27;Statistics lecture&#x27;?");
    for (const html of [save, remove]) {
      expect(html).toMatch(/<button[^>]*>This event<\/button><button[^>]*>This and following events<\/button><button[^>]*>Cancel<\/button>/);
    }
  });
});
