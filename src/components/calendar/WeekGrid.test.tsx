// The week view's markup, rendered on the server as the browser receives it.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WeekData, WeekEvent } from "@/lib/events/types";
import { WeekGrid } from "./WeekGrid";
import { WeekNav } from "./WeekNav";

function event(fields: Partial<WeekEvent>): WeekEvent {
  return {
    id: "e1",
    title: "Statistics revision",
    startAt: "2026-11-16T09:00:00.000Z",
    endAt: "2026-11-16T11:00:00.000Z",
    mayOverlap: false,
    status: "planned",
    updatedAt: "2026-11-15T10:00:00.000Z",
    conflict: false,
    startTime: "09:00",
    endTime: "11:00",
    endDay: null,
    startLocal: "2026-11-16T09:00",
    endLocal: "2026-11-16T11:00",
    ...fields,
  };
}

const DAYS = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"];

function week(events: WeekEvent[]): WeekData {
  return {
    timeZone: "Europe/Lisbon",
    monday: "2026-11-16",
    previous: "2026-11-09",
    next: "2026-11-23",
    thisWeek: "2026-11-16",
    days: DAYS.map((date, i) => ({
      date,
      label: `Day ${i + 1}`,
      isToday: i === 0,
      events: i === 0 ? events : [],
    })),
  };
}

describe("week view markup", () => {
  it("shows seven days as a list with a heading each, today marked, empty days said in words", () => {
    const html = renderToStaticMarkup(<WeekGrid week={week([])} />);
    expect(html.match(/<h2/g)).toHaveLength(7);
    expect(html).toContain("Day 1<span");
    expect(html).toContain("(today)");
    expect(html.match(/No events/g)).toHaveLength(7);
  });

  it("shows an event's time and title, and the conflict and done marks as text, not only colour", () => {
    const html = renderToStaticMarkup(
      <WeekGrid week={week([event({ conflict: true, status: "done" }), event({ id: "e2", title: "Night", endDay: "2026-11-17", endTime: "01:00" })])} />,
    );
    expect(html).toContain('<time dateTime="2026-11-16T09:00:00.000Z">09:00</time>');
    expect(html).toContain("Statistics revision");
    expect(html).toContain(">Conflict<");
    expect(html).toContain(">Done<");
    expect(html).toContain("01:00 (next day)");
  });

  it("links to the previous, current and next week by their Monday", () => {
    const html = renderToStaticMarkup(<WeekNav week={week([])} />);
    expect(html).toContain('href="/?week=2026-11-09"');
    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/\?week=2026-11-16">This week/);
    expect(html).toContain('href="/?week=2026-11-23"');
  });
});
