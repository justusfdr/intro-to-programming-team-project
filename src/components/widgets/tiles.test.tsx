// Spec 45: what the widgets show for given data (the leave colours, the goal ring, weather and next up).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TravelAnswer } from "@/lib/travel/types";
import type { WidgetEvent, WidgetGoal } from "@/lib/widgets/types";
import type { WeatherAnswer } from "@/lib/widgets/weather";
import { FreeWidget, GoalWidget, LeaveWidget, NextWidget, WeatherWidget, type Clock } from "./tiles";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// 13:16 in Lisbon (UTC in November).
const clock: Clock = { now: new Date("2026-11-17T13:16:00Z"), timeZone: "Europe/Lisbon", timeFormat: "12h" };

const lecture: WidgetEvent = {
  id: "e1",
  title: "Marketing lecture",
  start: "2026-11-17T14:00:00Z",
  end: "2026-11-17T15:30:00Z",
  location: "Nova SBE, Carcavelos",
  goal: { title: "Graduate", look: { color: "violet", icon: "graduation" } },
  todos: { done: 1, total: 3 },
  guests: 2,
  travelable: true,
};

const trip = (leaveAt: string): TravelAnswer => ({ status: "ok", mode: "cycling", minutes: 22, bufferMinutes: 0, leaveAt });

describe("time to leave", () => {
  it("is soft orange at 12 minutes, with the time and the trip in 3x1", () => {
    const html = renderToStaticMarkup(<LeaveWidget size="3x1" trip={lecture} travel={trip("2026-11-17T13:28:00Z")} clock={clock} />);
    expect(html).toContain("bg-orange-50");
    expect(html).toContain("Leave in 12 min");
    expect(html).toContain("1:28pm · 22 min");
  });

  it("is full red at 10 minutes and pulses at 0", () => {
    const red = renderToStaticMarkup(<LeaveWidget size="1x1" trip={lecture} travel={trip("2026-11-17T13:26:00Z")} clock={clock} />);
    expect(red).toContain("bg-red-600");
    expect(red).toContain("10 min");
    expect(red).toContain("to leave");
    const now = renderToStaticMarkup(<LeaveWidget size="1x1" trip={lecture} travel={trip("2026-11-17T13:16:00Z")} clock={clock} />);
    expect(now).toContain("widget-pulse");
    expect(now).toContain("Now");
  });

  it("counts up in dark red when late, and stays grey without a trip", () => {
    const late = renderToStaticMarkup(<LeaveWidget size="1x1" trip={lecture} travel={trip("2026-11-17T13:12:00Z")} clock={clock} />);
    expect(late).toContain("bg-red-900");
    expect(late).toContain("4 min");
    const none = renderToStaticMarkup(<LeaveWidget size="1x1" trip={null} travel={undefined} clock={clock} />);
    expect(none).toContain("No trip");
    const noHome = renderToStaticMarkup(
      <LeaveWidget size="3x1" trip={lecture} travel={{ status: "no_home", mode: "cycling", message: "Add your home address in Settings" }} clock={clock} />,
    );
    expect(noHome).toContain("Add your home address in Settings");
  });
});

describe("goal ring", () => {
  const goal: WidgetGoal = { id: "g1", title: "Startup", look: { color: "rose", icon: "rocket" }, done: 2, target: 4, unit: "count", met: false };

  it("shows the goal's colour and 2 of 4", () => {
    const html = renderToStaticMarkup(<GoalWidget goal={goal} />);
    expect(html).toContain("stroke-rose-500");
    expect(html).toContain("2 of 4");
    expect(html).toContain('aria-label="Startup: 2 of 4 this week"');
  });

  it("turns into Done with the goal's tint when the week is met", () => {
    const html = renderToStaticMarkup(<GoalWidget goal={{ ...goal, done: 4, met: true }} />);
    expect(html).toContain("bg-rose-50");
    expect(html).toContain("Done");
  });

  it("invites to add a goal when there is none", () => {
    expect(renderToStaticMarkup(<GoalWidget goal={null} />)).toContain("add one");
  });
});

describe("weather", () => {
  const answer: WeatherAnswer = {
    status: "ok",
    weather: {
      place: "Carcavelos",
      source: "device",
      temp: 17,
      sky: "rain",
      isDay: true,
      high: 19,
      low: 13,
      wind: 14,
      days: [],
      hours: [
        { time: "2026-11-17T14:00:00Z", temp: 17, sky: "rain", isDay: true, rain: 80, precip: 1.2, wind: 14, windDir: 220 },
        { time: "2026-11-17T15:00:00Z", temp: 16, sky: "cloudy", isDay: true, rain: 20, precip: 0, wind: 12, windDir: 230 },
        { time: "2026-11-17T16:00:00Z", temp: 16, sky: "cloudy", isDay: true, rain: 0, precip: 0, wind: 10, windDir: 240 },
        { time: "2026-11-17T17:00:00Z", temp: 15, sky: "clear", isDay: false, rain: 0, precip: 0, wind: 8, windDir: 250 },
      ],
    },
  };

  it("shows the place, temperature, sky, high and low and four hours, with the chance of rain only from 30 %", () => {
    const html = renderToStaticMarkup(<WeatherWidget size="3x2" answer={answer} clock={clock} />);
    expect(html).toContain("Carcavelos");
    expect(html).toContain("17°");
    expect(html).toContain("Rain");
    expect(html).toContain("H 19° · L 13°");
    expect(html).toContain("80%");
    expect(html).not.toContain("20%");
    expect(html).toContain("2pm");
  });

  it("asks for the location only through its button, and says what is missing", () => {
    const withButton = renderToStaticMarkup(<WeatherWidget size="3x2" answer={answer} clock={clock} onLocate={() => {}} />);
    expect(withButton).toContain("Use my location for the weather");
    const noPlace = renderToStaticMarkup(<WeatherWidget size="3x2" answer={{ status: "no_place", message: "Add your home address" }} clock={clock} />);
    expect(noPlace).toContain("Add your home address");
    expect(noPlace).toContain('href="/settings"');
  });
});

describe("next up and free time", () => {
  it("shows the goal, the countdown, the place and the leave line", () => {
    const html = renderToStaticMarkup(
      <NextWidget size="3x2" next={lecture} after={null} tomorrow={null} travel={trip("2026-11-17T13:28:00Z")} clock={clock} />,
    );
    expect(html).toContain("Next up");
    expect(html).toContain("in 44 min");
    expect(html).toContain("Marketing lecture");
    expect(html).toContain("2pm · Nova SBE");
    expect(html).toContain("Leave in 12 min");
  });

  it("in 3x4 adds guests, to-dos and the event after it", () => {
    const html = renderToStaticMarkup(
      <NextWidget size="3x4" next={lecture} after={{ title: "Gym", start: "2026-11-17T17:00:00Z" }} tomorrow={null} travel={null} clock={clock} />,
    );
    expect(html).toContain("2 guests");
    expect(html).toContain("1 of 3 to-dos done");
    expect(html).toContain("Then Gym at 5pm");
  });

  // Rewritten for spec 45 v2: "Focus" now starts with the free stretch's length (/focus?minutes=90).
  it("says Nothing else today with tomorrow's first event, and shows the free stretch", () => {
    const html = renderToStaticMarkup(
      <NextWidget size="3x2" next={null} after={null} tomorrow={{ title: "Statistics", start: "2026-11-18T09:00:00Z" }} travel={null} clock={clock} />,
    );
    expect(html).toContain("Nothing else today");
    expect(html).toContain("Tomorrow 9am · Statistics");
    const free = renderToStaticMarkup(<FreeWidget free={{ start: "2026-11-17T15:30:00Z", end: "2026-11-17T17:00:00Z" }} clock={clock} />);
    expect(free).toContain("Free · 1 h 30 min");
    expect(free).toContain("3:30 – 5pm");
    expect(free).toContain('href="/focus?minutes=90"');
  });
});
