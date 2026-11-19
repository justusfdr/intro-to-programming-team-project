// The markup of shared calendars on the viewer's calendar (spec 53, from spec 29): a "busy" block says "Busy", is not
// a button and carries no title; a "details" block is a button with title, time and whose calendar; the
// "People" button shows only when someone shares; nothing is draggable (no resize handle, no grab).
// Spec 53 adds E14: a shared block next to an own event never gives the own event an overlap mark, and
// the calendar builds its overlap data (R10) from its own events only.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SharedBlock } from "@/lib/shares/place";
import type { SharingPerson } from "@/lib/shares/types";
import { SharedBlockView, SharedEventDetails, SharedPeopleButton } from "./Shared";

const ANA: SharingPerson = { userId: "a", name: "Ana Lopes", photoUrl: null, calendar: "busy", focus: false };
const RANGE = { startMin: 7 * 60, endMin: 21 * 60 };

function block(level: "busy" | "details", title: string | null): SharedBlock {
  return {
    person: ANA,
    level,
    key: "k",
    title,
    location: null,
    startAt: "2026-11-17T09:00:00.000Z",
    endAt: "2026-11-17T11:00:00.000Z",
    startMin: 540,
    endMin: 660,
    continuesBefore: false,
    continuesAfter: false,
    lane: 0,
    lanes: 1,
  };
}

const render = (b: SharedBlock) =>
  renderToStaticMarkup(<SharedBlockView block={b} range={RANGE} left={0.62} width={0.38} timeZone="Europe/Lisbon" onOpen={() => {}} />);

describe("shared blocks", () => {
  it("busy: says Busy, is not a button, has no title, and reads out whose calendar it is", () => {
    const html = render(block("busy", null));
    expect(html).not.toContain("<button");
    expect(html).toContain(">Busy</span>");
    expect(html).toMatch(/role="note" aria-label="Busy, Tuesday, November 17, 9 – 11am, Ana Lopes&#x27;s calendar, read only"/);
    expect(html).not.toContain("cursor-grab");
    expect(html).not.toContain("ns-resize");
  });

  it("details: a button with the title that opens a card; still no drag handle", () => {
    const html = render(block("details", "Statistics exam"));
    expect(html).toMatch(/<button type="button" data-shared="true" aria-label="Statistics exam, Tuesday, November 17, 9 – 11am, Ana Lopes&#x27;s calendar, read only"/);
    expect(html).toContain(">Statistics exam</span>");
    expect(html).not.toContain("cursor-grab");
    expect(html).not.toContain("ns-resize");
  });

  it("sits on the right part of the column, striped", () => {
    const html = render(block("busy", null));
    expect(html).toContain("left:calc(62% + 2px)");
    expect(html).toContain("repeating-linear-gradient");
  });
});

describe("the People button", () => {
  it("is not there when nobody shares a calendar", () => {
    expect(renderToStaticMarkup(<SharedPeopleButton people={[]} chosen={[]} onToggle={() => {}} />)).toBe("");
  });

  it("says how many calendars are shown", () => {
    const html = renderToStaticMarkup(<SharedPeopleButton people={[ANA]} chosen={["a"]} onToggle={() => {}} />);
    expect(html).toContain('aria-label="People&#x27;s calendars, 1 shown"');
    expect(html).toContain('aria-haspopup="dialog"');
  });
});

describe("in the time grid", () => {
  const own = {
    id: "e1", title: "My lecture", allDay: false as const, startAt: "2026-11-17T10:00:00.000Z", endAt: "2026-11-17T11:00:00.000Z",
    firstDay: null, lastDay: null, mayOverlap: false, status: "planned" as const, goalId: null, seriesId: null, source: "app" as const,
    location: null, notSent: false, updatedAt: "2026-11-15T10:00:00.000Z", conflict: false, startTime: "10:00", endTime: "11:00",
    endDay: null, startLocal: "2026-11-17T10:00", endLocal: "2026-11-17T11:00",
  };
  const day = { date: "2026-11-17", label: "Tue 17", isToday: false, events: [own], allDay: [] };
  const placed = [[{ event: own, startMin: 600, endMin: 660, continuesBefore: false, continuesAfter: false, lane: 0, lanes: 1 }]];

  async function grid(shared: SharedBlock[][] | undefined) {
    const { TimeGrid } = await import("./TimeGrid");
    return renderToStaticMarkup(
      <TimeGrid
        goals={[]}
        days={[day]}
        placed={placed}
        range={RANGE}
        nowMin={null}
        selectedDay="2026-11-17"
        onOpenEvent={() => {}}
        onCreate={() => {}}
        onDrop={() => {}}
        tripWarned={new Set()}
        shared={shared}
        sharedAllDay={shared ? [[]] : undefined}
        timeZone="Europe/Lisbon"
        onOpenShared={() => {}}
      />,
    );
  }

  it("draws shared blocks in their own list beside the viewer's events, which keep the left part", async () => {
    const html = await grid([[block("busy", null)]]);
    expect(html).toContain('<ul aria-label="Shared calendars"');
    // The viewer's own block: still a draggable button, now on the left 62% of the column.
    expect(html).toMatch(/data-event-id="e1"[^>]*style="[^"]*width:calc\(62% - 4px\)/);
    expect(html).toContain("cursor-grab");
  });

  it("leaves the own blocks the whole column on a day without shared blocks", async () => {
    const html = await grid(undefined);
    expect(html).not.toContain("Shared calendars");
    expect(html).toMatch(/data-event-id="e1"[^>]*style="[^"]*width:calc\(100% - 4px\)/);
  });

  it("E14: an own event overlapping a shared block (9 to 11 against 10 to 11) gets no overlap mark", async () => {
    for (const level of ["busy", "details"] as const) {
      const html = await grid([[block(level, level === "details" ? "Exam" : null)]]);
      const own = html.match(/<button[^>]*data-event-id="e1"[^>]*>/)?.[0] ?? "";
      expect(own).not.toBe("");
      expect(own).not.toContain("overlaps another event");
      expect(own).not.toContain("border-l-warning");
      expect(html).not.toContain("text-warning");
    }
  });
});

describe("E14: the calendar's overlap data comes from its own events only", () => {
  // Server markup cannot show fetched shared calendars, so this reads the code that builds the data
  // the overlap marks and the overlap question use (R10), and checks it never names a shared value.
  const source = readFileSync(join(__dirname, "CalendarView.tsx"), "utf8");
  /** The code from `start` up to the line that ends it (`end`, at the start of a line). */
  const statementOf = (start: string, end = /;\n/) => {
    const from = source.indexOf(start);
    expect(from).toBeGreaterThan(-1);
    const rest = source.slice(from);
    const match = rest.match(end);
    expect(match?.index).toBeGreaterThan(0);
    return rest.slice(0, match!.index! + match![0].length);
  };

  it.each([
    ["const shownEvents = useMemo(", /;\n/],
    ["const timed = useMemo<NamedEvent[]>(", /\n {2}\);\n/],
    ["const tripWarned = useMemo(", /;\n/],
    ["overlapAt.current = (event, start, end) => {", /\n {4}\};\n/],
  ] as const)("%s never reads a shared calendar", (start, end) => {
    const code = statementOf(start, end);
    expect(code.split("\n").length).toBeGreaterThan(0);
    expect(code).not.toMatch(/shared|Shared|sharing/);
  });

  it("reads the whole overlap question's code (not just its first line)", () => {
    expect(statementOf("overlapAt.current = (event, start, end) => {", /\n {4}\};\n/)).toContain("overlapOf(");
    expect(statementOf("const timed = useMemo<NamedEvent[]>(", /\n {2}\);\n/)).toContain("[shownEvents]");
  });

  it("builds shownEvents from the own placed events", () => {
    expect(statementOf("const shownEvents = useMemo(")).toContain("placed.flat()");
  });
});

describe("the read-only details card", () => {
  it("says \"From Lucas Meyer's calendar. Read only.\" with no space before 's", () => {
    const lucas: SharingPerson = { userId: "l", name: "Lucas Meyer", photoUrl: null, calendar: "details", focus: false };
    const html = renderToStaticMarkup(<SharedEventDetails shared={{ person: lucas, title: "Physics lab", location: null, when: "Tuesday, November 17, 1 – 2:30pm" }} />);
    expect(html).toMatch(/<span class="min-w-0 truncate">Lucas Meyer<\/span><\/a><span>&#x27;s calendar\.<\/span><\/span><span>Read only\.<\/span>/);
    const text = html.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|");
    expect(text).toContain("|Lucas Meyer|&#x27;s calendar.|Read only.|");
  });
});
