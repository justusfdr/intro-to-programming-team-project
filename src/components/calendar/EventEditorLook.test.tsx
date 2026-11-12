// The event editor's look (spec 10): goals as radio chips named "goal", 24-hour start and end with
// the length next to the end, "next day" past midnight, and "Reopen" for a done event.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { WeekEvent } from "@/lib/events/types";
import { EventEditor } from "./EventEditor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const EVENT: WeekEvent = {
  id: "e1",
  title: "Statistics revision",
  allDay: false,
  startAt: "2026-11-17T09:00:00.000Z",
  endAt: "2026-11-17T11:00:00.000Z",
  firstDay: null,
  lastDay: null,
  mayOverlap: false,
  status: "planned",
  goalId: "g2",
  seriesId: null, source: "app", location: null, notSent: false,
  updatedAt: "2026-11-15T10:00:00.000Z",
  conflict: false,
  startTime: "09:00",
  endTime: "11:00",
  endDay: null,
  startLocal: "2026-11-17T09:00",
  endLocal: "2026-11-17T11:00",
};

const GOALS = [
  { id: "g1", title: "Run a half marathon", colorIndex: 0 },
  { id: "g2", title: "Pass the statistics exam", colorIndex: 1 },
];

const render = (event: WeekEvent) => renderToStaticMarkup(<EventEditor state={{ mode: "edit", event }} goals={GOALS} onClose={() => {}} />);

describe("event editor look", () => {
  it("offers 'No goal' and every goal as radio chips named goal, with the event's goal chosen", () => {
    const html = render(EVENT);
    const radios = html.match(/<input[^>]*type="radio"[^>]*>/g) ?? [];
    expect(radios).toHaveLength(3);
    for (const radio of radios) expect(radio).toContain('name="goal"');
    expect(radios.filter((radio) => radio.includes('checked=""'))).toEqual([expect.stringContaining('value="g2"')]);
    expect(html).toContain(">No goal</span>");
  });

  it("shows start and end in 24-hour time, with the length next to the end", () => {
    const html = render(EVENT);
    expect(html).toMatch(/<option value="540" selected="">09:00<\/option>/);
    expect(html).toMatch(/<option value="660" selected="">11:00 · 2 h<\/option>/);
  });

  it("says 'next day' for an end after midnight", () => {
    const night = { ...EVENT, startLocal: "2026-11-19T22:00", endLocal: "2026-11-20T02:00" };
    expect(render(night)).toMatch(/<option value="1560" selected="">02:00 · 4 h \(next day\)<\/option>/);
  });

  it("names the done toggle 'Reopen' for a done event and 'Mark done' otherwise", () => {
    expect(render({ ...EVENT, status: "done" })).toContain(">Reopen</button>");
    expect(render(EVENT)).toContain(">Mark done</button>");
  });
});
