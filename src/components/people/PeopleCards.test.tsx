// The markup of the People page's cards (spec 53, from spec 33): grid columns, avatar 64, name, bio line,
// local time with the city, what they share (never the focus flag); one link per card. And the
// PersonChip, a plain link to the profile.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PeopleData } from "@/lib/profiles/types";
import { ContactCard, PeopleView } from "./PeopleView";
import { PersonChip } from "./PersonChip";

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
    // The focus flag is stored in the database but never shown.
    expect(html).not.toContain("focus chart");
  });

  it("without a bio or time zone it says so quietly and shows no clock", () => {
    const html = renderToStaticMarkup(<ContactCard person={{ ...EMILY, bio: null, timeZone: null, shared: { calendar: "none", focus: false } }} now={NOW} />);
    expect(html).toContain(">No bio yet.</span>");
    expect(html).not.toContain(" · ");
    expect(html).not.toContain("Shares with you");
  });
});

describe("PersonChip", () => {
  it("is a plain link to the profile with the avatar and the name, nothing more", () => {
    const html = renderToStaticMarkup(<PersonChip person={{ userId: "u3", name: "Emily Lea", photoUrl: null }} />);
    expect(html).toMatch(/^<a class="[^"]*" href="\/people\/u3">/);
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).not.toContain("aria-haspopup");
    expect(html).toContain(">EL</span>");
    expect(html).toContain(">Emily Lea</span>");
  });

  it("escapes a name that looks like markup", () => {
    const html = renderToStaticMarkup(<PersonChip person={{ userId: "u3", name: "<img src=x onerror=alert(1)>", photoUrl: null }} />);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});
