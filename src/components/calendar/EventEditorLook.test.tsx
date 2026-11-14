// The event editor's look.
// Rewritten for spec 16 (the prototype's frame): goals as the prototype's chips (buttons with
// aria-pressed, the event's goal pressed), the goal tile in the header, start and end with the length
// next to the end, "next day" past midnight, "Reopen" for a done event. Kept from spec 12: 12-hour times
// by default ("9am", "11am · 2h"), 24-hour with the setting.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { WeekEvent } from "@/lib/events/types";
import { DisplayProvider } from "@/components/shell/DisplayProvider";
import { DEFAULT_DISPLAY } from "@/lib/time/display";
import type { GoalLabel } from "./TimeGrid";
import { EditEventCard } from "./EventEditor";

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
  seriesId: null,
  source: "app",
  location: null,
  notSent: false,
  updatedAt: "2026-11-15T10:00:00.000Z",
  conflict: false,
  startTime: "09:00",
  endTime: "11:00",
  endDay: null,
  startLocal: "2026-11-17T09:00",
  endLocal: "2026-11-17T11:00",
};

const GOALS: GoalLabel[] = [
  { id: "g1", title: "Run a half marathon", look: { color: "teal", icon: "footprints" } },
  { id: "g2", title: "Pass the statistics exam", look: { color: "indigo", icon: "graduation" } },
];

const card = (event: WeekEvent) => <EditEventCard event={event} anchor={null} goals={GOALS} timeZone="Europe/Lisbon" today="2026-11-16" onClose={() => {}} />;
const render = (event: WeekEvent) => renderToStaticMarkup(card(event));

describe("event editor look", () => {
  it("offers 'No goal' and every goal as chips, with the event's goal pressed", () => {
    const html = render(EVENT);
    const group = /role="group" aria-label="Goal"[^>]*>(.*?)<\/div>/s.exec(html)?.[1] ?? "";
    const chips = group.match(/<button[^>]*aria-pressed="(true|false)"/g) ?? [];
    expect(chips).toHaveLength(3);
    expect(group).toMatch(/aria-pressed="true"[^>]*>.*Pass the statistics exam/s);
    expect(group).toContain("No goal");
  });

  it("draws each goal's own icon and colour in its chip and the chosen goal's in the header tile (spec 13)", () => {
    const html = render(EVENT);
    expect(html).toMatch(/bg-teal-50 text-teal-700[^"]*"><svg[^>]*lucide-footprints/);
    expect(html).toMatch(/bg-indigo-50 text-indigo-700[^"]*"><svg[^>]*lucide-graduation-cap/);
    // The header tile comes first, in the chosen goal's colour.
    expect(html.indexOf("bg-indigo-50")).toBeLessThan(html.indexOf('aria-label="Title"'));
    // "No goal": a grey tile with a briefcase, as in the prototype.
    expect(html).toMatch(/bg-raised text-ink-3[^"]*"><svg[^>]*lucide-briefcase/);
  });

  it("shows start and end as HH:MM fields, as in the New event card, with the length next to the end", () => {
    const html = render(EVENT);
    expect(html).toMatch(/<input type="text" inputMode="numeric"[^>]*aria-label="Start time"[^>]*value="09:00"/);
    expect(html).toMatch(/<input type="text" inputMode="numeric"[^>]*aria-label="End time"[^>]*value="11:00"/);
    expect(html).toContain("End · 2h");
    // No long dropdown lists any more, and the wheel shows only once a field is clicked.
    expect(html).not.toContain("<select aria-label=\"Start time\"");
    expect(html).not.toContain("<select aria-label=\"End time\"");
    expect(html).not.toMatch(/role="group" aria-label="Start time"/);
  });

  it("shows the times as HH:MM also when the setting says 12-hour or 24-hour", () => {
    const html = renderToStaticMarkup(<DisplayProvider value={{ ...DEFAULT_DISPLAY, timeFormat: "24h" }}>{card(EVENT)}</DisplayProvider>);
    expect(html).toMatch(/aria-label="Start time"[^>]*value="09:00"/);
    expect(html).toMatch(/aria-label="End time"[^>]*value="11:00"/);
  });

  it("says 'next day' for an end after midnight", () => {
    const night = { ...EVENT, startLocal: "2026-11-19T22:00", endLocal: "2026-11-20T02:00" };
    const html = render(night);
    expect(html).toMatch(/aria-label="End time"[^>]*value="02:00"/);
    expect(html).toContain("End · 4h · next day");
  });

  it("offers the length chips of the New event card, with the event's length chosen", () => {
    const html = render(EVENT);
    expect(html).toMatch(/role="group" aria-label="Duration"/);
    for (const label of ["30m", "1h", "1.5h", "2h"]) expect(html).toMatch(new RegExp(`aria-pressed="(true|false)"[^>]*>${label.replace(".", "\\.")}</button>`));
    expect(html).toMatch(/aria-pressed="true"[^>]*>2h<\/button>/);
  });

  it("names the done toggle 'Reopen' for a done event and 'Mark done' otherwise", () => {
    expect(render({ ...EVENT, status: "done" })).toContain(">Reopen</button>");
    expect(render(EVENT)).toContain(">Mark done</button>");
  });
});
