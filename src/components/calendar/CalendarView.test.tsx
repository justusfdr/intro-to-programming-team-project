// The calendar's markup as the browser first receives it (rendered on the server).
// Replaces WeekGrid.test.tsx: the week is now a time grid instead of a list per day; the same
// promises are checked here (days labelled, today marked, events reachable as buttons in time order,
// marks in words and not only colour, week links, one status region outside the grid).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AllDayEvent, WeekData, WeekEvent } from "@/lib/events/types";
import { Announcer } from "./Announcer";
import { CalendarView } from "./CalendarView";

// The editor uses the router; outside a running Next.js app there is none, so give it a stand-in.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const DAYS = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"];

function event(id: string, title: string, start: string, end: string, fields: Partial<WeekEvent> = {}): WeekEvent {
  return {
    id,
    title,
    startAt: "",
    endAt: "",
    mayOverlap: false,
    status: "planned",
    allDay: false,
    firstDay: null,
    lastDay: null,
    seriesId: null,
    goalId: null,
    updatedAt: "2026-11-15T10:00:00.000Z",
    conflict: false,
    startTime: start.slice(11),
    endTime: end.slice(11),
    endDay: null,
    startLocal: start,
    endLocal: end,
    ...fields,
  };
}

function allDay(id: string, title: string, firstDay: string, lastDay: string): AllDayEvent {
  return { id, title, allDay: true, firstDay, lastDay, mayOverlap: false, status: "planned", goalId: null, seriesId: null, updatedAt: "2026-11-15T10:00:00.000Z" };
}

function week(byDay: Record<number, WeekEvent[]>, allDayEvents: AllDayEvent[] = []): WeekData {
  return {
    timeZone: "Europe/Lisbon",
    monday: "2026-11-16",
    previous: "2026-11-09",
    next: "2026-11-23",
    thisWeek: "2026-11-16",
    days: DAYS.map((date, i) => ({ date, label: date, isToday: i === 1, events: byDay[i] ?? [], allDay: allDayEvents.filter((e) => e.firstDay <= date && date <= e.lastDay) })),
  };
}

function render(data: WeekData) {
  // The page puts the calendar inside the Announcer (one status region for the calendar and the panels).
  return renderToStaticMarkup(
    <Announcer>
      <CalendarView
        week={data}
        nowLocal="2026-11-17T12:10"
        suggestion={{ start: "2026-11-17T13:00", end: "2026-11-17T14:00" }}
        goals={[{ id: "g1", title: "Run a half marathon", colorIndex: 0 }]}
      />
    </Announcer>,
  );
}

describe("calendar markup", () => {
  it("shows the month, the week, and seven labelled day columns with today marked", () => {
    const html = render(week({}));
    expect(html).toContain("November 2026");
    expect(html).toContain("Week 47 · 16–22 Nov");
    expect(html.match(/<section aria-label="[A-Z][a-z]+day \d+ November/g)).toHaveLength(7);
    expect(html).toContain('aria-label="Tuesday 17 November, today"');
    expect(html.match(/No events/g)).toHaveLength(7);
  });

  it("gives every event a button that names title, day, time and marks, in time order", () => {
    const html = render(
      week({
        0: [
          event("b", "Lunch", "2026-11-16T12:00", "2026-11-16T13:00", { status: "done" }),
          event("a", "Statistics revision", "2026-11-16T09:00", "2026-11-16T11:00", { conflict: true }),
        ],
      }),
    );
    const first = html.indexOf('aria-label="Statistics revision, Monday 16 November, 09:00 to 11:00, overlaps another event"');
    const second = html.indexOf('aria-label="Lunch, Monday 16 November, 12:00 to 13:00, done"');
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
  });

  it("shows the conflict and done marks as icons and strike-through, not only as colour", () => {
    const html = render(
      week({ 0: [event("a", "Clash", "2026-11-16T09:00", "2026-11-16T11:00", { conflict: true, status: "done" })] }),
    );
    expect(html).toContain("line-through");
    expect(html.match(/<svg/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("lists an event past midnight once: its continuation on the next day is not a second tab stop", () => {
    const html = render(
      week({ 2: [event("n", "Night shift", "2026-11-18T22:00", "2026-11-19T02:00", { endDay: "2026-11-19" })] }),
    );
    expect(html).toContain('aria-label="Night shift, Wednesday 18 November, 22:00 to 02:00 the next day"');
    // The part on Thursday is a strip above the grid here (see the next test): no tab stop, not read out.
    expect(html.match(/aria-label="Night shift/g)).toHaveLength(1);
    expect(html).toMatch(/tabindex="-1"[^>]*>Night shift, until 02:00</);
  });

  it("draws the now line and its time label on today", () => {
    expect(render(week({}))).toContain(">12:10<");
  });

  it("links to the previous and next week and to this week, and has a New event button", () => {
    const html = render(week({}));
    expect(html).toMatch(/href="\/\?week=2026-11-09"[^>]*aria-label="Previous week"|aria-label="Previous week"[^>]*href="\/\?week=2026-11-09"/);
    expect(html).toMatch(/href="\/\?week=2026-11-23"/);
    expect(html).toMatch(/aria-current="page"[^>]*href="\/\?week=2026-11-16"|href="\/\?week=2026-11-16"[^>]*aria-current="page"/);
    expect(html).toMatch(/<button[^>]*>.*New event<\/button>/);
  });

  it("keeps one status region outside the grid", () => {
    const html = render(week({}));
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html.indexOf('role="status"')).toBeGreaterThan(html.indexOf("data-grid-scroll"));
  });

  it("shows an after-midnight part that ends before the first hour as a strip above the grid, out of the tab order", () => {
    const html = render(
      week({ 3: [event("n", "Night shift at the library", "2026-11-19T22:00", "2026-11-20T02:00", { endDay: "2026-11-20" })] }),
    );
    expect(html).toMatch(/<div aria-hidden="true" class="[^"]*border-b[^"]*md:flex">.*Before \d\d:00.*tabindex="-1"[^>]*>Night shift at the library, until 02:00<\/button>/s);
    expect(html.indexOf("Night shift at the library, until 02:00")).toBeLessThan(html.indexOf("data-hour-grid"));
  });

  it("keeps titles on whole words: narrow lanes get one line with an ellipsis", () => {
    const html = render(
      week({
        1: [
          event("a", "Statistics revision", "2026-11-17T09:00", "2026-11-17T11:00"),
          event("b", "Call with Lucas", "2026-11-17T10:00", "2026-11-17T10:30"),
        ],
      }),
    );
    expect(html).not.toMatch(/break-words|hyphens-auto/);
    expect(html).toMatch(/class="block pr-4[^"]*truncate[^"]*">Statistics revision</);
  });

  it("gives an event of a goal the goal's colour and names the goal; other events stay neutral", () => {
    const html = render(
      week({
        0: [
          event("a", "Long run", "2026-11-16T07:00", "2026-11-16T08:00", { goalId: "g1" }),
          event("b", "Dentist", "2026-11-16T10:00", "2026-11-16T11:00"),
        ],
      }),
    );
    expect(html).toMatch(/aria-label="Long run, Monday 16 November, 07:00 to 08:00, goal Run a half marathon"[^>]*class="[^"]*bg-rose-50/);
    expect(html).toMatch(/aria-label="Dentist, Monday 16 November, 10:00 to 11:00"[^>]*class="[^"]*bg-raised/);
  });

  it("has a Goals button in the toolbar for the goals panel", () => {
    expect(render(week({}))).toMatch(/aria-expanded="true"[^>]*>Goals<\/button>/);
  });

  it("shows an all-day event once in an 'All day' row above the hours, as a bar across its days with its days in words", () => {
    const html = render(week({}, [allDay("x", "Exam week", "2026-11-16", "2026-11-20")]));
    const label = 'aria-label="Exam week, all day, Monday 16 November to Friday 20 November"';
    // One button for wider screens (a bar over columns 1 to 5) and one in the phone list; each is hidden at the other size.
    expect(html.split(label)).toHaveLength(3);
    expect(html).toMatch(/<li style="grid-column:1 \/ 6"[^>]*><button type="button" aria-label="Exam week, all day/);
    expect(html).toMatch(/<section aria-label="All day"/);
    expect(html.indexOf('aria-label="All day"')).toBeLessThan(html.indexOf("data-hour-grid"));
    expect(html).not.toContain("tabindex=\"-1\"");
  });

  it("starts the bar at Monday for an all-day event from the week before, with a mark that it continues", () => {
    const html = render(week({}, [allDay("t", "Trip", "2026-11-10", "2026-11-17")]));
    expect(html).toMatch(/<li style="grid-column:1 \/ 3"[^>]*><button[^>]*aria-label="Trip, all day, Tuesday 10 November to Tuesday 17 November"[^>]*>… Trip</);
  });

  it("puts the 'All day' row above the 'Before' strip, and names them differently", () => {
    const html = render(
      week({ 3: [event("n", "Night shift", "2026-11-19T22:00", "2026-11-20T02:00", { endDay: "2026-11-20" })] }, [allDay("x", "Exam week", "2026-11-16", "2026-11-20")]),
    );
    expect(html.indexOf(">All day<")).toBeGreaterThan(-1);
    expect(html.indexOf(">All day<")).toBeLessThan(html.search(/>Before \d\d:00</));
  });

  it("has no all-day row in a week without all-day events", () => {
    expect(render(week({}))).not.toContain('aria-label="All day"');
  });
});
