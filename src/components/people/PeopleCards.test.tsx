// The markup of spec 33: the People page's cards (grid columns, avatar 64, name, bio line, local time with
// the city, what they share; one link per card), the PersonChip (a plain link without card data, a link
// that announces its hover card with it) and the hover card's content, the profile page's sections, and
// the week grid in its read-only mode.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TimeGrid } from "@/components/calendar/TimeGrid";
import { PersonView } from "@/components/profile/PersonView";
import type { SharedBlock } from "@/lib/shares/place";
import type { PeopleData, ProfileCardData } from "@/lib/profiles/types";
import { ContactCard, PeopleView } from "./PeopleView";
import { hasCard, PersonChip, PersonHoverCard } from "./PersonChip";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

// 14:20 in Lisbon (winter: UTC), 15:20 in Berlin.
const NOW = "2026-11-17T14:20:00.000Z";

const EMILY = {
  userId: "u3",
  name: "Emily Lea",
  photoUrl: null,
  bio: "Statistics at Nova, running before lectures and revising after them, every single day of the week",
  timeZone: "Europe/Berlin",
  shared: { calendar: "details" as const, focus: true },
};

describe("contact cards", () => {
  it("the grid has one column on phones, two from 640 px and three from 1024 px", () => {
    const data: PeopleData = {
      me: { userId: "u1", displayName: null, name: "alice", email: "alice@example.com", photoUrl: null },
      received: [],
      sent: [],
      contacts: [{ id: "c1", userId: "u3", name: "Emily Lea", email: "emily@example.com", photoUrl: null, since: NOW }],
    };
    const html = renderToStaticMarkup(
      <PeopleView
        data={data}
        timeZone="Europe/Lisbon"
        shares={[{ contactId: "c1", userId: "u3", out: { calendar: "none", focus: false }, in: { calendar: "busy", focus: false } }]}
        facts={[{ userId: "u3", bio: "Hi there", timeZone: "Europe/Berlin" }]}
        now={NOW}
      />,
    );
    expect(html).toContain('class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"');
    expect(html).toContain(">Hi there</span>");
    expect(html).toContain(">3:20pm · Berlin</span>");
    expect(html).toContain(">Shares their calendar as free/busy</span>");
    expect(html).not.toContain("emily@example.com");
    // Invitations stay above the grid; "Invite someone" first.
    expect(html.indexOf(">Invite someone</h2>")).toBeLessThan(html.indexOf(">Your contacts</h2>"));
    expect(html.indexOf(">Invitations you sent</h2>")).toBeLessThan(html.indexOf(">Your contacts</h2>"));
  });

  it("a card is one link with avatar 64, the shown name, the bio's first line cut, the local time and the marks", () => {
    const html = renderToStaticMarkup(<ContactCard person={EMILY} now={NOW} />);
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toMatch(/^<a [^>]*href="\/people\/u3"/);
    expect(html).toContain("width:64px;height:64px");
    expect(html).toContain(">EL</span>");
    expect(html).toContain(">Emily Lea</span>");
    expect(html).toContain(">Statistics at Nova, running before lectures and revising after them, every single day of…</span>");
    expect(html).toContain(">3:20pm · Berlin</span>");
    expect(html).toContain('aria-label="Shares with you"');
    expect(html).toContain(">Shares their calendar with details</span>");
    expect(html).toContain(">Shares their focus chart</span>");
  });

  it("without a bio or time zone it says so quietly and shows no clock", () => {
    const html = renderToStaticMarkup(<ContactCard person={{ ...EMILY, bio: null, timeZone: null, shared: { calendar: "none", focus: false } }} now={NOW} />);
    expect(html).toContain(">No bio yet.</span>");
    expect(html).not.toContain(" · ");
    expect(html).not.toContain("Shares with you");
  });
});

describe("PersonChip", () => {
  it("with only id and name it is just a link to the profile", () => {
    const person = { userId: "u3", name: "Emily Lea", photoUrl: null };
    expect(hasCard(person)).toBe(false);
    const html = renderToStaticMarkup(<PersonChip person={person} />);
    expect(html).toMatch(/^<a class="[^"]*" href="\/people\/u3">/);
    expect(html).not.toContain("aria-haspopup");
    expect(html).toContain(">Emily Lea</span>");
  });

  it("with more to show it says it opens a card, closed at first; never the address on the chip itself", () => {
    const html = renderToStaticMarkup(<PersonChip person={{ ...EMILY, email: "emily@example.com" }} now={NOW} />);
    expect(html).toMatch(/<a aria-haspopup="dialog" aria-expanded="false"[^>]*href="\/people\/u3"/);
    expect(html).not.toContain("emily@example.com");
    expect(html).not.toContain('role="dialog"');
  });

  it("the hover card: avatar 48, name, bio line, local time, address, marks, Open profile and Show in calendar", () => {
    const html = renderToStaticMarkup(<PersonHoverCard person={{ ...EMILY, email: "emily@example.com" }} now={NOW} />);
    expect(html).toContain("width:48px;height:48px");
    expect(html).toContain(">Emily Lea</span>");
    expect(html).toContain(">emily@example.com</p>");
    expect(html).toContain(">3:20pm · Berlin</span>");
    expect(html).toContain(">Shares their focus chart</span>");
    expect(html).toMatch(/href="\/people\/u3">Open profile<\/a>/);
    expect(html).toMatch(/href="\/\?share=u3">Show in calendar<\/a>/);
  });

  it("the hover card offers no calendar when they do not share it, and no address when the page has none", () => {
    const html = renderToStaticMarkup(<PersonHoverCard person={{ ...EMILY, shared: { calendar: "none", focus: false } }} now={NOW} />);
    expect(html).not.toContain("Show in calendar");
    expect(html).not.toContain("@");
  });
});

const ANA: ProfileCardData = {
  userId: "u3",
  displayName: "Ana Silva",
  name: "Ana Silva",
  email: "ana@example.com",
  photoUrl: null,
  bio: null,
  linkedinUrl: null,
  timeZone: "Europe/Berlin",
};

describe("the profile page's sections", () => {
  it("a contact who shares nothing: the sharing controls, Remove contact, and one quiet sentence for the week", () => {
    const html = renderToStaticMarkup(
      <PersonView person={ANA} now={NOW} sections relation={{ contactId: "c1", out: { calendar: "busy", focus: false }, shared: { calendar: "none", focus: false }, demo: false }} />,
    );
    expect(html).toContain(">What you share with Ana Silva</h2>");
    expect(html).toMatch(/checked="" value="busy"/);
    expect(html).toMatch(/aria-label="Remove Ana Silva"[^>]*>Remove contact<\/button>/);
    expect(html).toContain(">Ana Silva&#x27;s week</h2>");
    expect(html).toContain("Ana Silva does not share their calendar with you.");
    expect(html).not.toContain("Show in my calendar");
    expect(html).not.toContain("focus chart</h2>");
    // The address stays on the profile page, in quiet text.
    expect(html).toContain(">ana@example.com</p>");
  });

  it("a contact who shares calendar and chart: their week with its label and buttons, and the chart", () => {
    const html = renderToStaticMarkup(
      <PersonView person={ANA} now={NOW} sections relation={{ contactId: "c1", out: { calendar: "none", focus: false }, shared: { calendar: "busy", focus: true }, demo: false }} />,
    );
    expect(html).toContain(">Show in my calendar</button>");
    expect(html).toContain("Shows free/busy only · Times in Europe/Berlin, their time zone");
    expect(html).toContain('aria-label="Previous week"');
    expect(html).toContain('aria-label="Next week"');
    expect(html).toContain(">Nov 16 – 22</span>");
    expect(html).toContain("min-w-[640px]");
    expect(html).toContain(">Ana Silva&#x27;s focus chart</h2>");
  });

  it("someone whose invitation is open: no sharing controls, the quiet sentence for the week", () => {
    const html = renderToStaticMarkup(<PersonView person={ANA} now={NOW} sections relation={null} />);
    expect(html).not.toContain("What you share with");
    expect(html).toContain("Ana Silva does not share their calendar with you.");
  });
});

describe("the week grid, read only", () => {
  const person = { userId: "u3", name: "Ana Silva", photoUrl: null, calendar: "details" as const, focus: false };
  const days = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"].map((date) => ({
    date,
    label: date,
    isToday: date === "2026-11-17",
    events: [],
    allDay: [],
  }));
  const block: SharedBlock = {
    person,
    level: "details",
    key: "k",
    title: "Lecture",
    location: null,
    startAt: "2026-11-17T09:00:00.000Z",
    endAt: "2026-11-17T10:00:00.000Z",
    startMin: 600,
    endMin: 660,
    continuesBefore: false,
    continuesAfter: false,
    lane: 0,
    lanes: 1,
  };
  const html = renderToStaticMarkup(
    <TimeGrid
      goals={[]}
      days={days}
      placed={days.map(() => [])}
      range={{ startMin: 7 * 60, endMin: 21 * 60 }}
      nowMin={null}
      selectedDay="2026-11-17"
      readOnly
      onOpenEvent={() => {}}
      shared={days.map((d) => (d.date === "2026-11-17" ? [block] : []))}
      sharedAllDay={days.map(() => [])}
      timeZone="Europe/Berlin"
      onOpenShared={() => {}}
    />,
  );

  it("shows every day at every width, with weekday labels that are not links", () => {
    expect(html.match(/data-day-col="true" class="block relative/g)).toHaveLength(7);
    expect(html).not.toContain("<a ");
    expect(html).toContain(">Tue</span>");
  });

  it("the shared block takes the whole column, can be opened read only, and nothing can be dragged or created", () => {
    expect(html).toContain("left:calc(0% + 2px)");
    expect(html).toContain("width:calc(100% - 4px)");
    expect(html).toMatch(/<button type="button" data-shared="true" aria-label="Lecture, [^"]*, Ana Silva&#x27;s calendar, read only"/);
    expect(html).not.toContain("cursor-grab");
    expect(html).not.toContain("ns-resize");
  });
});
