// The "Getting there" choice in the event editor (R27): the standard plus four ways, one marked; shown only
// for timed events of our own (an all-day event has no travel time, R29; an Outlook event keeps the standard, R11).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AllDayEvent, WeekEvent } from "@/lib/events/types";
import { EditEventCard, NewEventCard } from "../EventEditor";
import { TravelSection } from "./TravelSection";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const pressed = (html: string) => [...html.matchAll(/aria-pressed="true"[^>]*>([^<]*)</g)].map((m) => m[1].trim());

const labels = (html: string) => [...html.matchAll(/aria-pressed="(?:true|false)"[^>]*>([^<]*)</g)].map((m) => m[1].trim());
const standardOn = (html: string) => /role="switch"[^>]*checked=""/.test(html);

describe("the Getting there choice", () => {
  it("with the standard on, shows the switch and hides the other ways", () => {
    const html = renderToStaticMarkup(<TravelSection value={null} onChange={() => {}} />);
    expect(standardOn(html)).toBe(true);
    expect(labels(html)).toEqual([]);
  });

  it("with a way chosen, switches the standard off and shows the four ways, the chosen one marked", () => {
    for (const [mode, label] of [["driving", "Driving"], ["cycling", "Cycling"], ["walking", "Walking"], ["transit", "Public transport"]] as const) {
      const html = renderToStaticMarkup(<TravelSection value={mode} onChange={() => {}} />);
      expect(standardOn(html)).toBe(false);
      expect(labels(html)).toEqual(["Driving", "Cycling", "Walking", "Public transport"]);
      expect(pressed(html)).toEqual([label]);
    }
  });
});

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
const COMMON = { goals: [], timeZone: "Europe/Lisbon", today: "2026-11-16", anchor: null, onClose: () => {} };

describe("the choice in the editor", () => {
  it("is there for a timed event of our own and shows the event's way", () => {
    const html = renderToStaticMarkup(<EditEventCard event={{ ...TIMED, travelMode: "transit" }} {...COMMON} />);
    expect(html).toContain(">Getting there</p>");
    expect(pressed(html.slice(html.indexOf(">Getting there</p>")))[0]).toBe("Public transport");
  });

  it("is there for a new event, with the standard marked", () => {
    const html = renderToStaticMarkup(<NewEventCard draft={{ start: "2026-11-17T09:00", end: "2026-11-17T10:00" }} {...COMMON} />);
    expect(html).toContain(">Getting there</p>");
    expect(standardOn(html.slice(html.indexOf(">Getting there</p>")))).toBe(true);
  });

  it("is not there for an all-day event (R29) or an Outlook event (R11)", () => {
    expect(renderToStaticMarkup(<EditEventCard event={EXAM} {...COMMON} />)).not.toContain("Getting there");
    expect(renderToStaticMarkup(<EditEventCard event={{ ...TIMED, source: "outlook" }} {...COMMON} />)).not.toContain("Getting there");
  });
});
