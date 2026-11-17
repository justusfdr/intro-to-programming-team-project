// Spec 47 v2: what a click on a widget does, the gallery's room on this screen, and the weather in detail.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TravelAnswer } from "@/lib/travel/types";
import { DEFAULT_LAYOUT, type WidgetItem, type WidgetsData } from "@/lib/widgets/types";
import type { WeatherAnswer, WeatherDto } from "@/lib/widgets/weather";
import { fitsOnScreen, freeFields } from "./Gallery";
import { renderWidget, type WidgetContext } from "./grid";
import { routeLink } from "./tiles";
import { WeatherDetail } from "./WeatherDetail";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const clock = { now: new Date("2026-11-17T13:16:00Z"), timeZone: "Europe/Lisbon", timeFormat: "12h" as const };
const lecture = {
  id: "e1",
  title: "Marketing lecture",
  start: "2026-11-17T14:00:00Z",
  end: "2026-11-17T15:30:00Z",
  location: "Nova SBE, Carcavelos",
  goal: null,
  todos: { done: 0, total: 0 },
  guests: 0,
  travelable: true,
};
const data: WidgetsData = {
  layout: DEFAULT_LAYOUT,
  isDefault: true,
  now: clock.now.toISOString(),
  timeZone: clock.timeZone,
  timeFormat: "12h",
  next: lecture,
  after: null,
  tomorrow: null,
  trip: lecture,
  goals: [{ id: "g1", title: "Startup", look: { color: "rose", icon: "rocket" }, done: 2, target: 4, unit: "count", met: false }],
  focusMinutes: 48,
  free: { start: "2026-11-17T15:30:00Z", end: "2026-11-17T17:00:00Z" },
};
const travel: TravelAnswer = { status: "ok", mode: "cycling", minutes: 22, bufferMinutes: 0, leaveAt: "2026-11-17T13:28:00Z" };

const hour = (i: number) => ({ time: `2026-11-17T${String(14 + (i % 10)).padStart(2, "0")}:00:00Z`, temp: 17 - (i % 5), sky: "rain" as const, isDay: true, rain: i === 0 ? 80 : 10, precip: i === 0 ? 1.2 : 0, wind: 12 + i, windDir: 200 });
const weather: WeatherDto = {
  place: "Lisbon",
  source: "city",
  temp: 17,
  sky: "rain",
  isDay: true,
  high: 19,
  low: 12,
  wind: 14,
  hours: Array.from({ length: 24 }, (_, i) => hour(i)),
  days: ["2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"].map((date, i) => ({ date, sky: "partly" as const, high: 19 + i, low: 11 + i, rain: i === 1 ? 60 : 0 })),
};
const ok: WeatherAnswer = { status: "ok", weather };
const ctx: WidgetContext = { data, weatherFor: (city) => (city === "Lisbon" ? ok : null), onOpenWeather: () => {}, travel, clock };
const html = (item: WidgetItem, editing = false) => renderToStaticMarkup(<>{renderWidget(item, ctx, editing)}</>);

describe("a click on a widget", () => {
  it("opens the next event in the calendar on its day", () => {
    expect(html({ kind: "next", size: "3x2" })).toContain('href="/?view=day&amp;date=2026-11-17&amp;event=e1"');
  });

  it("opens the way to the event in Google Maps by the trip's way of travel, in a new tab", () => {
    const leave = html({ kind: "leave", size: "1x1" });
    expect(leave).toContain(routeLink("Nova SBE, Carcavelos", "cycling").replace(/&/g, "&amp;"));
    expect(leave).toContain('target="_blank"');
    expect(routeLink("Nova SBE, Carcavelos", "transit")).toBe("https://www.google.com/maps/dir/?api=1&destination=Nova%20SBE%2C%20Carcavelos&travelmode=transit");
  });

  it("opens the goal's card, Focus, and Focus with the free stretch's length", () => {
    expect(html({ kind: "goal", size: "1x1", goalId: "g1" })).toContain('href="/goals?goal=g1"');
    expect(html({ kind: "focus", size: "1x1" })).toContain('href="/focus"');
    expect(html({ kind: "free", size: "3x1" })).toContain('href="/focus?minutes=90"');
  });

  it("opens the weather in detail, for the city the widget names", () => {
    const tile = html({ kind: "weather", size: "3x2", city: "Lisbon" });
    expect(tile).toContain('role="button"');
    expect(tile).toContain("Weather in Lisbon, open the details");
  });

  it("does nothing of that while editing (a click opens the settings instead)", () => {
    for (const item of [{ kind: "next", size: "3x2" }, { kind: "leave", size: "1x1" }, { kind: "weather", size: "3x2", city: "Lisbon" }] as WidgetItem[]) {
      const tile = html(item, true);
      expect(tile).not.toContain("href=");
      expect(tile).not.toContain('role="button"');
    }
  });
});

describe("room on this screen", () => {
  it("counts the free fields of the rows that fit", () => {
    expect(freeFields(DEFAULT_LAYOUT, 6)).toBe(0);
    expect(freeFields(DEFAULT_LAYOUT.slice(0, 2), 6)).toBe(6);
    // Five rows: weather and next up take four, the three small ones the fifth, free time does not fit.
    expect(freeFields(DEFAULT_LAYOUT, 5)).toBe(0);
    expect(freeFields([{ kind: "focus", size: "1x1" }], 3)).toBe(8);
  });

  it("offers a size only where it fits on this screen and in the full grid", () => {
    const four: WidgetItem[] = DEFAULT_LAYOUT.slice(0, 2);
    expect(fitsOnScreen(four, { kind: "free", size: "3x1" }, 5)).toBe(true);
    expect(fitsOnScreen(four, { kind: "next", size: "3x4" }, 5)).toBe(false);
    expect(fitsOnScreen(four, { kind: "next", size: "3x2" }, 6)).toBe(true);
    expect(fitsOnScreen(four, { kind: "next", size: "3x2" }, 5)).toBe(false);
  });
});

describe("the weather in detail", () => {
  const page = renderToStaticMarkup(<WeatherDetail weather={weather} clock={clock} />);

  it("shows the weather now, the three views of the next 24 hours and starts with the temperature", () => {
    expect(page).toContain("Lisbon");
    expect(page).toContain("17°");
    expect(page).toContain("Wind 14 km/h");
    for (const tab of ["Temperature", "Precipitation", "Wind"]) expect(page).toContain(`>${tab}</button>`);
    expect(page).toContain('aria-selected="true"');
    expect(page).toContain('aria-label="Temperature each hour"');
    expect(page.match(/>Now</g)).toHaveLength(1);
  });

  it("lists 7 days from today with the chance of rain from 30 % and credits Open-Meteo", () => {
    expect(page).toContain(">Today<");
    expect(page).toContain(">Wed<");
    expect(page).toContain(">60%<");
    expect(page).toContain("https://open-meteo.com/");
  });
});
