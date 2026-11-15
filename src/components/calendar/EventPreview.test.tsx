// The markup of the event preview (spec 35): a labelled region with "Edit" and a close button for the
// user's own events, without "Edit" for a shared event; the parts in their order and only when they have
// something to show; notes as plain text; a web link as a safe link without a map; the map as
// OpenStreetMap's embed with its attributes, the link to open it and the credit; and what shows while
// the place is looked up or when it is not found.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DisplayProvider } from "@/components/shell/DisplayProvider";
import type { GuestPerson } from "@/lib/events/preview";
import type { AllDayEvent, WeekEvent } from "@/lib/events/types";
import type { SharingPerson } from "@/lib/shares/types";
import { DEFAULT_DISPLAY } from "@/lib/time/display";
import { EventPreview, OwnPreviewBody, PlaceMap, type PlaceState, type PreviewTarget, type TravelState } from "./EventPreview";
import type { GoalLabel } from "./TimeGrid";

const GOALS: GoalLabel[] = [{ id: "g1", title: "Pass statistics", look: { color: "teal", icon: "rocket", why: null } as GoalLabel["look"] }];
const LEA: GuestPerson = { userId: "u-lea", name: "Lea Sousa", photoUrl: null };
const ANA: SharingPerson = { userId: "a", name: "Ana Lopes", photoUrl: null, calendar: "details", focus: false };

function timed(fields: Partial<WeekEvent> = {}): WeekEvent {
  return {
    id: "e1",
    title: "Statistics exam",
    allDay: false,
    startAt: "2026-11-14T14:30:00.000Z",
    endAt: "2026-11-14T15:45:00.000Z",
    firstDay: null,
    lastDay: null,
    mayOverlap: false,
    status: "planned",
    goalId: null,
    seriesId: null,
    source: "app",
    location: null,
    notSent: false,
    updatedAt: "2026-11-10T10:00:00.000Z",
    conflict: false,
    startTime: "14:30",
    endTime: "15:45",
    endDay: null,
    startLocal: "2026-11-14T14:30",
    endLocal: "2026-11-14T15:45",
    ...fields,
  };
}

const panel = (target: PreviewTarget) =>
  renderToStaticMarkup(
    <DisplayProvider value={{ ...DEFAULT_DISPLAY, timeFormat: "24h" }}>
      <EventPreview target={target} goals={GOALS} guestPeople={{ "lea@example.com": LEA }} timeZone="Europe/Lisbon" focusOnOpen={false} onEdit={() => {}} onClose={() => {}} />
    </DisplayProvider>,
  );

const body = (event: WeekEvent | AllDayEvent, state: { openTodos?: string[] | null; travel?: TravelState; place?: PlaceState } = {}) =>
  renderToStaticMarkup(
    <OwnPreviewBody
      event={event}
      goals={GOALS}
      guestPeople={{ "lea@example.com": LEA }}
      timeZone="Europe/Lisbon"
      timeFormat="24h"
      openTodos={state.openTodos ?? null}
      travel={state.travel ?? null}
      place={state.place ?? { status: "none" }}
    />,
  );

describe("the panel", () => {
  it("is a region named by its heading, with Edit and Close for the user's own event", () => {
    const html = panel({ kind: "own", event: timed() });
    expect(html).toMatch(/<aside role="region" aria-labelledby="event-preview-title"/);
    expect(html).toMatch(/<h2 id="event-preview-title" tabindex="-1"[^>]*>Statistics exam<\/h2>/);
    expect(html).toContain(">Edit</button>");
    expect(html).toContain('aria-label="Close preview"');
    // Column from 1024 px, over the calendar from 768 px, a sheet from the bottom on phones.
    expect(html).toMatch(/class="fixed inset-x-0 bottom-0 [^"]*md:w-\[360px\][^"]*lg:sticky/);
  });

  it("a shared event: no Edit, the time in the user's format, the place as text only, whose calendar", () => {
    const html = panel({
      kind: "shared",
      shared: {
        person: ANA,
        title: "Dentist",
        location: "Rua Augusta 1, Lisboa",
        when: "Tuesday, November 17, 9 – 11am",
        time: { allDay: false, startLocal: "2026-11-17T09:00", endLocal: "2026-11-17T11:00" },
      },
    });
    expect(html).not.toContain(">Edit</button>");
    expect(html).toContain(">Dentist</h2>");
    expect(html).toContain("Tue, Nov 17 · 9:00 to 11:00");
    expect(html).toContain("Rua Augusta 1, Lisboa");
    expect(html).not.toContain("<iframe");
    expect(html).toContain('href="/people/a"');
    expect(html).toContain("calendar. Read only.");
  });

  it("asks for the place first: no map is in the page before the server answered", () => {
    const html = panel({ kind: "own", event: timed({ location: "Nova SBE, Carcavelos" }) });
    expect(html).toContain("Finding the place on the map…");
    expect(html).not.toContain("<iframe");
  });
});

describe("the parts of the user's own event", () => {
  it("a plain event: title and time only, no empty parts", () => {
    const html = body(timed());
    expect(html).toContain("Sat, Nov 14 · 14:30 to 15:45");
    for (const part of ["Guests", "To-dos", "Notes", "Place", "Repeats"]) expect(html).not.toContain(`>${part}`);
  });

  it("everything in order: goal, title, time, series, guests, to-dos, notes, place", () => {
    const html = body(
      timed({
        goalId: "g1",
        seriesId: "s1",
        guests: ["lea@example.com", "x@example.com"],
        todoCount: 4,
        todosDone: 2,
        notes: "Bring the calculator",
        location: "Nova SBE, Carcavelos",
      }),
      { openTodos: ["Read chapter 3", "Exercises"], place: "loading" },
    );
    const order = ["Pass statistics", "Statistics exam", "Sat, Nov 14", "Repeats (part of a series)", "Guests", "To-dos", "Notes", "Place"].map((t) => html.indexOf(t));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain("2 of 4 to-dos done");
    expect(html).toContain("<li class=\"break-words\">Read chapter 3</li>");
    // A guest who is a contact is a chip to their profile; anyone else stays an address.
    expect(html).toContain('href="/people/u-lea"');
    expect(html).toContain(">Lea Sousa</span>");
    expect(html).toContain(">x@example.com</span>");
    expect(html).not.toContain("lea@example.com");
  });

  it("an Outlook event marks its organizer", () => {
    const html = body(timed({ source: "outlook", organizer: "boss@example.com", guests: ["me@example.com"] }));
    expect(html).toMatch(/boss@example\.com<\/span><span[^>]*>Organizer<\/span>/);
  });

  it("notes are plain text with their line breaks, never HTML", () => {
    const html = body(timed({ notes: "Line one\n<script>alert(1)</script><b>bold</b>" }));
    expect(html).toContain("whitespace-pre-wrap");
    expect(html).toContain("Line one\n&lt;script&gt;alert(1)&lt;/script&gt;&lt;b&gt;bold&lt;/b&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>");
  });

  it("an https meeting link is a safe link and has no map or travel line", () => {
    const html = body(timed({ location: "https://teams.microsoft.com/l/x" }));
    expect(html).toMatch(/<a href="https:\/\/teams\.microsoft\.com\/l\/x" target="_blank" rel="noopener noreferrer"/);
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("Leave at");
  });

  it("any other web address is text only, never a link", () => {
    const html = body(timed({ location: "http://zoom.us/j/1" }));
    expect(html).not.toContain('href="http://zoom.us');
    expect(html).toContain(">http://zoom.us/j/1</p>");
  });

  it("an address with its travel line and the map", () => {
    const html = body(timed({ location: "Nova SBE, Carcavelos" }), {
      travel: { status: "ok", mode: "driving", minutes: 25, bufferMinutes: 10, leaveAt: "2026-11-14T14:55:00.000Z" },
      place: { status: "found", lat: 38.6797, lon: -9.3197 },
    });
    expect(html).toContain(">Nova SBE, Carcavelos</p>");
    expect(html).toContain("Leave at 14:55");
    expect(html).toContain("25m by car + 10m buffer");
    expect(html).toContain("<iframe");
  });

  it("a travel answer that cannot be worked out is left out; the hint to add a home address stays", () => {
    const missing = body(timed({ location: "Nova SBE" }), { travel: { status: "not_found", mode: "driving", message: "Address not found" } });
    expect(missing).not.toContain("Address not found<");
    const noHome = body(timed({ location: "Nova SBE" }), { travel: { status: "no_home", mode: "driving", message: "Add your home address in settings" } });
    expect(noHome).toContain("Add your home address in settings");
  });

  it("an all-day event over several days", () => {
    const event: AllDayEvent = { id: "a1", title: "Exam week", allDay: true, firstDay: "2026-11-14", lastDay: "2026-11-16", mayOverlap: false, status: "planned", goalId: null, seriesId: null, source: "app", location: null, notSent: false, updatedAt: "2026-11-10T10:00:00.000Z" };
    expect(body(event)).toContain("Sat, Nov 14 to Mon, Nov 16 · all day");
  });
});

describe("the map", () => {
  it("is OpenStreetMap's embed, lazy, without a referrer, sandboxed, named, 220 px high, with the link and the credit", () => {
    const html = renderToStaticMarkup(<PlaceMap map={{ status: "found", lat: 38.6797, lon: -9.3197 }} address="Nova SBE, Carcavelos" />);
    expect(html).toMatch(/<iframe title="Map of Nova SBE, Carcavelos" src="https:\/\/www\.openstreetmap\.org\/export\/embed\.html\?bbox=[-\d.,]+&amp;layer=mapnik&amp;marker=38\.67970,-9\.31970"/);
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('referrerPolicy="no-referrer"');
    expect(html).toContain('sandbox="allow-scripts allow-same-origin"');
    expect(html).toContain("h-[220px]");
    expect(html).toContain('href="https://www.openstreetmap.org/?mlat=38.67970&amp;mlon=-9.31970#map=16/38.67970/-9.31970" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain("Open in OpenStreetMap");
    expect(html).toContain("© OpenStreetMap contributors");
  });

  it("not found: the sentence and no frame; numbers off the Earth are not found either", () => {
    for (const map of [{ status: "not_found" }, { status: "found", lat: 200, lon: 0 }] as PlaceState[]) {
      const html = renderToStaticMarkup(<PlaceMap map={map} address="Nowhere" />);
      expect(html).toContain("Address not found on the map");
      expect(html).not.toContain("<iframe");
    }
  });

  it("while asking, when the service is down, and with nothing to look up", () => {
    expect(renderToStaticMarkup(<PlaceMap map="loading" address="x" />)).toContain("Finding the place on the map…");
    expect(renderToStaticMarkup(<PlaceMap map={{ status: "unavailable" }} address="x" />)).toContain("The map is not available right now");
    expect(renderToStaticMarkup(<PlaceMap map={{ status: "none" }} address="x" />)).toBe("");
  });
});
