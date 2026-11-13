// Guests of an event on screen (spec 24), as the browser first receives the markup: the GUESTS section
// after LOCATION (chips with an x, the field, the quiet line), "Connect Outlook to invite guests" when
// Outlook is not connected, nothing for an event of a series or a demo event, an Outlook event's people
// read-only with the organizer first (R11), the new event's editor, the bin's words, and the people icon
// on a block that is tall enough. Also what the editor and the calendar send.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DisplayProvider } from "@/components/shell/DisplayProvider";
import type { WeekData, WeekEvent } from "@/lib/events/types";
import { DEFAULT_DISPLAY } from "@/lib/time/display";
import { Announcer } from "./Announcer";
import { CalendarView } from "./CalendarView";
import { createBody, editBody, isChanged, newValues, valuesOf } from "./editor/values";
import { movedChange, recreateBody } from "./event-changes";
import { EditEventCard, NewEventCard } from "./EventEditor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const noop = () => {};

function event(fields: Partial<WeekEvent> = {}): WeekEvent {
  return {
    id: "e1",
    title: "Study group",
    startAt: "2026-11-17T14:00:00.000Z",
    endAt: "2026-11-17T16:00:00.000Z",
    mayOverlap: false,
    status: "planned",
    allDay: false,
    firstDay: null,
    lastDay: null,
    seriesId: null,
    source: "app",
    location: null,
    notSent: false,
    goalId: null,
    updatedAt: "2026-11-15T10:00:00.000Z",
    conflict: false,
    startTime: "14:00",
    endTime: "16:00",
    endDay: null,
    startLocal: "2026-11-17T14:00",
    endLocal: "2026-11-17T16:00",
    ...fields,
  };
}

const GUESTS = ["lea@example.com", "tom@uni.example.org"];
const COMMON = { goals: [], timeZone: "Europe/Lisbon", today: "2026-11-16", anchor: null, onClose: noop };

const edit = (e: WeekEvent, outlookConnected = true) => renderToStaticMarkup(<EditEventCard event={e} {...COMMON} outlookConnected={outlookConnected} />);

describe("the editor of our own event", () => {
  it("shows GUESTS after LOCATION and before OVERLAP: chips with an x, the field and the quiet line", () => {
    const html = edit(event({ guests: GUESTS }));
    const at = (text: string) => html.indexOf(text);
    expect(at(">Location</p>")).toBeGreaterThan(-1);
    expect(at(">Guests</p>")).toBeGreaterThan(at(">Location</p>"));
    expect(at(">Overlap</p>")).toBeGreaterThan(at(">Guests</p>"));
    expect(html).toContain('aria-label="Remove lea@example.com"');
    expect(html).toContain('aria-label="Remove tom@uni.example.org"');
    expect(html).toContain('placeholder="Add a guest&#x27;s e-mail"');
    expect(html).toContain("Outlook sends each guest an invitation when you save.");
  });

  it("without a connected Outlook: 'Connect Outlook to invite guests' links to the Outlook card, no field", () => {
    const html = edit(event({ guests: ["lea@example.com"] }), false);
    expect(html).toMatch(/<a [^>]*href="\/settings#outlook"[^>]*>.*Connect Outlook to invite guests<\/a>/s);
    expect(html).not.toContain("Add a guest");
    expect(html).not.toContain("Remove lea@example.com");
    expect(html).toContain("lea@example.com");
  });

  it("leaves the section out for an event of a series and a demo event", () => {
    expect(edit(event({ seriesId: "s1" }))).not.toContain(">Guests</p>");
    expect(edit(event({ demo: true }))).not.toContain(">Guests</p>");
  });

  it("the bin names the guests it will tell; without guests it is the plain bin", () => {
    expect(edit(event({ guests: GUESTS }))).toContain('aria-label="Delete event and tell 2 guests"');
    expect(edit(event())).toContain('aria-label="Delete event"');
  });
});

describe("an Outlook event", () => {
  it("shows its people read-only, the organizer first, no x and no field (R11)", () => {
    const html = edit(event({ source: "outlook", guests: ["lea@example.com"], organizer: "prof@uni.example.org" }));
    expect(html).toContain(">Guests</p>");
    expect(html.indexOf("prof@uni.example.org")).toBeLessThan(html.indexOf("lea@example.com"));
    expect(html).toContain("· Organizer");
    expect(html).not.toContain("Remove ");
    expect(html).not.toContain("Add a guest");
    expect(html).not.toContain("Connect Outlook to invite guests");
  });

  it("without anyone, no section", () => {
    expect(edit(event({ source: "outlook" }))).not.toContain(">Guests</p>");
  });
});

describe("a new event ('Add details')", () => {
  it("has the section too, and the connect line when Outlook is not connected", () => {
    const draft = { start: "2026-11-17T14:00", end: "2026-11-17T15:00", title: "Study group" };
    expect(renderToStaticMarkup(<NewEventCard draft={draft} {...COMMON} outlookConnected />)).toContain('placeholder="Add a guest&#x27;s e-mail"');
    expect(renderToStaticMarkup(<NewEventCard draft={draft} {...COMMON} />)).toContain("Connect Outlook to invite guests");
  });

  it("a new series shows no guests section", () => {
    const draft = { start: "2026-11-17T14:00", end: "2026-11-17T15:00", repeat: "weekly" as const };
    expect(renderToStaticMarkup(<NewEventCard draft={draft} {...COMMON} outlookConnected />)).not.toContain(">Guests</p>");
  });
});

describe("the block in the calendar", () => {
  function render(events: WeekEvent[]) {
    const data: WeekData = {
      timeZone: "Europe/Lisbon",
      outlook: { status: "connected", lastSyncedAt: null },
      view: "day",
      date: "2026-11-17",
      today: "2026-11-17",
      monday: "2026-11-16",
      previous: "2026-11-16",
      next: "2026-11-18",
      thisWeek: "2026-11-16",
      days: [{ date: "2026-11-17", label: "2026-11-17", isToday: true, events, allDay: [] }],
      lead: [],
    };
    return renderToStaticMarkup(
      <DisplayProvider value={DEFAULT_DISPLAY}>
        <Announcer>
          <CalendarView week={data} nowLocal="2026-11-17T08:10" suggestion={{ start: "2026-11-17T13:00", end: "2026-11-17T14:00" }} goals={[]} />
        </Announcer>
      </DisplayProvider>,
    );
  }

  it("a block of 2 hours with guests shows the people icon and the number, and says it in words", () => {
    const html = render([event({ guests: GUESTS })]);
    expect(html).toContain("lucide-users");
    expect(html).toMatch(/<\/svg>2<\/span>/);
    expect(html).toContain("2 guests");
  });

  it("no icon without guests, and none on a block too short for it (30 minutes)", () => {
    expect(render([event()])).not.toContain("lucide-users");
    const short = render([event({ guests: GUESTS, endAt: "2026-11-17T14:30:00.000Z", endTime: "14:30", endLocal: "2026-11-17T14:30" })]);
    expect(short).not.toContain("lucide-users");
    expect(short).toContain("2 guests");
  });
});

describe("what is sent", () => {
  it("Save sends the guests when the event has some or some were added; an empty list removes them", () => {
    const plain = event();
    expect(editBody(plain, valuesOf(plain), "u")).not.toHaveProperty("guests");
    expect(editBody(plain, { ...valuesOf(plain), guests: [] }, "u")).not.toHaveProperty("guests");
    expect(editBody(plain, { ...valuesOf(plain), guests: ["lea@example.com"] }, "u")).toMatchObject({ guests: ["lea@example.com"] });
    const withGuests = event({ guests: GUESTS });
    expect(editBody(withGuests, { ...valuesOf(withGuests), guests: [] }, "u")).toMatchObject({ guests: [] });
    // An Outlook event sends only its goal (R11).
    const outlook = event({ source: "outlook", guests: GUESTS });
    expect(editBody(outlook, { ...valuesOf(outlook), guests: [] }, "u")).toEqual({ goalId: null, updatedAt: "u" });
  });

  it("a change of the guests shows Save; adding and removing the same guest does not", () => {
    const plain = event();
    expect(isChanged(plain, { ...valuesOf(plain), guests: ["lea@example.com"] })).toBe(true);
    expect(isChanged(plain, { ...valuesOf(plain), guests: [] })).toBe(false);
    const withGuests = event({ guests: GUESTS });
    expect(isChanged(withGuests, valuesOf(withGuests))).toBe(false);
    expect(isChanged(withGuests, { ...valuesOf(withGuests), guests: ["lea@example.com"] })).toBe(true);
  });

  it("'Add event' sends the guests of a single event, never of a series", () => {
    const values = { ...newValues({ start: "2026-11-17T14:00", end: "2026-11-17T15:00", title: "Study group" }), guests: ["lea@example.com"] };
    expect(createBody(values, null)).toMatchObject({ guests: ["lea@example.com"] });
    expect(createBody(values, { frequency: "weekly", weekdays: [2], until: "2026-12-15" })).not.toHaveProperty("guests");
    expect(createBody({ ...values, guests: [] }, null)).not.toHaveProperty("guests");
  });

  it("Undo of a delete brings the event back with its guests (R38: Outlook invites them again); a move keeps them", () => {
    expect(recreateBody(event({ guests: GUESTS }))).toMatchObject({ title: "Study group", guests: GUESTS });
    expect(recreateBody(event())).not.toHaveProperty("guests");
    const moved = movedChange(event({ guests: GUESTS }), "2026-11-17T15:00", "2026-11-17T17:00", "Europe/Lisbon")!;
    const week = { days: [{ date: "2026-11-17", label: "", isToday: false, events: [event({ guests: GUESTS })], allDay: [] }], lead: [], timeZone: "Europe/Lisbon" } as unknown as WeekData;
    expect(moved.week!(week).days[0].events[0]).toMatchObject({ guests: GUESTS });
  });
});
