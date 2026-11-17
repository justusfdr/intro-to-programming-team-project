// Spec 47: the Focus page before a session shows the start card with its ring, "Before you start"
// with three steps and their studies, the recent sessions behind a small button, and the library's
// articles as tiles. While a session runs or is paused it shows the session only.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { START_STEPS } from "@/lib/library/before-you-start";
import { tilesFor } from "@/lib/library/library";
import type { FocusData, SessionDto } from "@/lib/focus/types";
import { FocusView } from "./FocusView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const NOW = "2026-11-16T09:15:00.000Z";
const tiles = tilesFor("2026-11-16");
const count = (html: string, part: string) => html.split(part).length - 1;

function session(fields: Partial<SessionDto>): SessionDto {
  return {
    id: "s1",
    eventId: null,
    eventTitle: null,
    eventGoalId: null,
    plannedMinutes: 60,
    status: "running",
    startedAt: "2026-11-16T09:00:00.000Z",
    pausedAt: null,
    pausedSeconds: 0,
    endedAt: null,
    rating: null,
    ...fields,
  };
}

function render(data: Partial<FocusData>, library = tiles) {
  const blocker = { sites: [], connected: true, blockingOn: false, blockingUntil: null, timeZone: "Europe/Lisbon" };
  return renderToStaticMarkup(
    <FocusView data={{ active: null, recent: [], forEvent: null, forEventGoalId: null, goals: [], now: NOW, ...data }} blocker={blocker} library={library} />,
  );
}

describe("Before you start", () => {
  const html = render({});

  it("lists the three steps in order, each as a box to tick that starts empty", () => {
    expect(html).toContain("Before you start");
    let last = -1;
    for (const step of START_STEPS) {
      const at = html.indexOf(`>${step.title}</label>`);
      expect(at, step.id).toBeGreaterThan(last);
      expect(html).toContain(`<input id="start-step-${step.id}" type="checkbox"`);
      last = at;
    }
    expect(count(html, 'type="checkbox"')).toBe(3);
    expect(html).not.toMatch(/type="checkbox"[^>]*checked/);
  });

  it("names each step's study and leads to its article", () => {
    for (const source of ["Stothart, Mitchum, Yehnert, 2015 · Lab experiment", "Gollwitzer, Sheeran, 2006 · Meta-analysis", "Altmann, Trafton, Hambrick, 2014 · Lab experiment"]) {
      expect(html).toContain(source);
    }
    for (const step of START_STEPS) expect(html).toMatch(new RegExp(`<a href="/focus/library/${step.slug}"[^>]*>Read the article</a>`));
  });

  it("has one field, for the first step, empty and at most 200 characters long", () => {
    expect(count(html, 'type="text"')).toBe(1);
    expect(html).toMatch(/<input type="text" aria-label="Your first step"[^>]*maxLength="200"[^>]*value=""/);
  });

  it("is there without the library's tiles too", () => {
    const bare = render({}, []);
    expect(bare).toContain("Before you start");
    expect(bare).not.toContain("From the library");
  });

  it.each([
    ["running", session({})],
    ["paused", session({ status: "paused", pausedAt: "2026-11-16T09:05:00.000Z" })],
  ])("is not there while a session is %s, and neither are the tiles", (_state, active) => {
    const busy = render({ active });
    expect(busy).not.toContain("Before you start");
    expect(busy).not.toContain('type="checkbox"');
    expect(busy).not.toContain("From the library");
    expect(busy).not.toContain("/focus/library");
    // Nothing was typed in this test, so no first step stands under the timer.
    expect(busy).not.toContain("First step:");
  });
});

describe("the start card's ring", () => {
  it("shows the chosen length, ready to start", () => {
    const html = render({});
    expect(html).toContain(">1:00:00</p>");
    expect(html).toContain(">ready</p>");
    expect(html).not.toContain('role="timer"');
  });

  it("shows the event's length when opened for an event, and 0:00 for a length that is none", () => {
    expect(render({ forEvent: { id: "e1", title: "Short call", suggestedMinutes: 45 } })).toContain(">45:00</p>");
    expect(render({ forEvent: { id: "e1", title: "Nothing", suggestedMinutes: 0 } })).toContain(">0:00</p>");
  });
});

describe("recent sessions", () => {
  const recent = [
    { ...session({ status: "finished", endedAt: "2026-11-15T09:10:00.000Z", startedAt: "2026-11-15T09:00:00.000Z" }), focusedMinutes: 10 },
    { ...session({ id: "s0", status: "finished", startedAt: "2026-11-13T09:00:00.000Z", endedAt: "2026-11-13T09:55:00.000Z", rating: 4 }), focusedMinutes: 45 },
  ];

  it("stand behind a small closed button under the start card that says how many there are", () => {
    const html = render({ recent });
    expect(count(html, "<details")).toBe(1);
    expect(html).not.toMatch(/<details[^>]* open/);
    expect(html).toMatch(/<summary[^>]*>.*Recent sessions<span[^>]*>2<\/span>.*<\/summary>/s);
    expect(html.indexOf("Start focus")).toBeLessThan(html.indexOf("<details"));
    expect(html.indexOf("<details")).toBeLessThan(html.indexOf("Before you start"));
    // The list itself is in the page, inside the disclosure.
    const inside = html.slice(html.indexOf("<details"), html.indexOf("</details>"));
    expect(inside).toContain("Rated 4 of 5");
    expect(inside).toContain(">Fri, Nov 13</span>");
  });

  it("say so when there are none, and are also there while a session runs", () => {
    expect(render({})).toMatch(/<summary[^>]*>.*Recent sessions<span[^>]*>0<\/span>/s);
    const busy = render({ active: session({}), recent });
    expect(busy).toMatch(/<summary[^>]*>.*Recent sessions<span[^>]*>2<\/span>/s);
  });
});

describe("the library's tiles on the Focus page", () => {
  const html = render({});

  it("are seven, each leading to its article, under From the library with the way to all of them", () => {
    expect(html).toContain("From the library");
    expect(html).toMatch(/<a href="\/focus\/library"[^>]*>All articles/);
    for (const tile of tiles) {
      expect(html, tile.slug).toContain(`>Read: ${tile.title.replace(/'/g, "&#x27;")}</span>`);
      expect(html).toContain(tile.meta);
    }
    expect(count(html, ">Read: ")).toBe(7);
  });

  it("come after the start card and the steps", () => {
    expect(html.indexOf("Before you start")).toBeLessThan(html.indexOf("From the library"));
    expect(html.indexOf("Start focus")).toBeLessThan(html.indexOf("From the library"));
  });
});
