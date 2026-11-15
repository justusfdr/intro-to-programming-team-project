// The markup of shared calendars on the viewer's calendar (spec 29): a "busy" block says "Busy", is not
// a button and carries no title; a "details" block is a button with title, time and whose calendar; the
// "People" button shows only when someone shares; nothing is draggable (no resize handle, no grab).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SharedBlock } from "@/lib/shares/place";
import type { SharingPerson } from "@/lib/shares/types";
import { SharedBlockView, SharedEventBody, SharedPeopleButton } from "./Shared";

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
  it("draws shared blocks in their own list beside the viewer's events, which keep the left part", async () => {
    const { TimeGrid } = await import("./TimeGrid");
    const own = {
      id: "e1", title: "My lecture", allDay: false as const, startAt: "2026-11-17T10:00:00.000Z", endAt: "2026-11-17T11:00:00.000Z",
      firstDay: null, lastDay: null, mayOverlap: false, status: "planned" as const, goalId: null, seriesId: null, source: "app" as const,
      location: null, notSent: false, updatedAt: "2026-11-15T10:00:00.000Z", conflict: false, startTime: "10:00", endTime: "11:00",
      endDay: null, startLocal: "2026-11-17T10:00", endLocal: "2026-11-17T11:00",
    };
    const day = { date: "2026-11-17", label: "Tue 17", isToday: false, events: [own], allDay: [] };
    const placed = [[{ event: own, startMin: 600, endMin: 660, continuesBefore: false, continuesAfter: false, lane: 0, lanes: 1 }]];
    const html = renderToStaticMarkup(
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
        shared={[[block("busy", null)]]}
        sharedAllDay={[[]]}
        timeZone="Europe/Lisbon"
        onOpenShared={() => {}}
      />,
    );
    expect(html).toContain('<ul aria-label="Shared calendars"');
    // The viewer's own block: still a draggable button, now on the left 62% of the column.
    expect(html).toMatch(/data-event-id="e1"[^>]*style="[^"]*width:calc\(62% - 4px\)/);
    expect(html).toContain("cursor-grab");
  });
});

describe("the small card of a shared event (spec 38)", () => {
  it("title, the date-and-time line, the place as text only, whose calendar; no Edit, no map, no link", () => {
    const html = renderToStaticMarkup(
      <SharedEventBody
        shared={{
          person: { ...ANA, calendar: "details" },
          title: "Dentist",
          location: "https://meet.example.com/abc",
          when: "Tuesday, November 17, 9 – 11am",
          time: { allDay: false, startLocal: "2026-11-17T09:00", endLocal: "2026-11-17T11:00" },
        }}
      />,
    );
    const at = (text: string) => html.indexOf(text);
    expect(at("Dentist")).toBeGreaterThan(-1);
    expect(at("Tue, Nov 17 · 9am to 11am")).toBeGreaterThan(at("Dentist"));
    expect(html).toContain(">https://meet.example.com/abc</p>");
    expect(html).not.toContain('href="https://meet.example.com');
    expect(html).toContain('href="/people/a"');
    expect(html).toContain("calendar. Read only.");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain(">Edit<");
  });
});
