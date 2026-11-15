// The demo contacts' markup (spec 32): on People, the quiet "Add demo contacts" with its sentence while
// they are off; while on, each after the real contacts with the "Demo" tag, their own colour, a link to
// their page, and one "Remove demo contacts". Their profile page has the tag and no e-mail address, and
// the sharing controls disabled with the reason; the calendar's People picker and Analytics mark them.
// Rewritten for spec 33: the two tests of the People page now look at the cards, and the disabled
// sharing controls moved with the controls to the profile page.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SharedFocus } from "@/components/analytics/SharedFocus";
import { SharedPeopleButton } from "@/components/calendar/Shared";
import { PersonView } from "@/components/profile/PersonView";
import { Avatar } from "@/components/ui/Avatar";
import { demoContacts, demoPerson, demoProfileCard, demoSharingPeople } from "@/lib/demo/people";
import type { PeopleData } from "@/lib/profiles/types";
import { NOTHING_SHARED } from "@/lib/shares/types";
import { DEMO_CONTACTS_NOTE, PeopleView } from "./PeopleView";
import { DEMO_SHARE_NOTE } from "./ShareRow";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const ME = { userId: "u1", displayName: null, name: "alice", email: "alice@example.com", photoUrl: null };
const DATA: PeopleData = {
  me: ME,
  received: [],
  sent: [],
  contacts: [{ id: "c1", userId: "u3", name: "dave", email: "dave@example.com", photoUrl: null, since: "2026-11-10T10:00:00.000Z" }],
};
const EMPTY: PeopleData = { me: ME, received: [], sent: [], contacts: [] };

const render = (data: PeopleData, on: boolean) =>
  renderToStaticMarkup(<PeopleView data={data} timeZone="Europe/Lisbon" demo={{ on, contacts: on ? demoContacts() : [] }} />);

describe("People page with demo contacts", () => {
  it("off: the empty sentence stays, and a quiet button adds them with one sentence saying what they are", () => {
    const html = render(EMPTY, false);
    expect(html).toContain("No contacts yet.");
    expect(html).toContain(DEMO_CONTACTS_NOTE);
    expect(html).toMatch(/<button type="button"[^>]*>Add demo contacts<\/button>/);
    expect(html).not.toContain("Remove demo contacts");
    expect(html).not.toContain("Lea Sousa");
  });

  it("on: the three cards after the real contacts, each tagged Demo, linking to their page, without an address", () => {
    const html = render(DATA, true);
    const order = ["dave", "Lea Sousa", "Jonas Becker", "Maya Brooks"].map((name) => html.indexOf(`>${name}</span>`));
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html.match(/>Demo<\/span>/g)).toHaveLength(3);
    expect(html).toContain('href="/people/demo-lea"');
    expect(html).toContain("background-color:#0f766e");
    expect(html).toContain(">LS</span>");
    expect(html).toMatch(/<button type="button"[^>]*>Remove demo contacts<\/button>/);
    expect(html).not.toContain("Add demo contacts");
    // No address anywhere but the invite field's example.
    expect(html.replace(/placeholder="[^"]*"/, "")).not.toContain("@");
  });

  it("on: their cards show what they share as marks; no sharing controls on the People page", () => {
    const html = render(DATA, true);
    expect(html).toContain(">Shares their calendar with details</span>");
    expect(html).toContain(">Shares their calendar as free/busy</span>");
    expect(html).toContain(">Shares their focus chart</span>");
    expect(html).not.toContain(DEMO_SHARE_NOTE);
    expect(html).not.toContain('role="switch"');
  });
});

describe("a demo contact elsewhere", () => {
  it("their profile page: tag, colour, bio, time zone, LinkedIn link, no e-mail address", () => {
    const html = renderToStaticMarkup(<PersonView person={demoProfileCard(demoPerson("demo-jonas")!)} now="2026-11-17T13:20:00.000Z" />);
    expect(html).toContain(">Jonas Becker</span>");
    expect(html).toContain(">Demo</span>");
    expect(html).toContain("background-color:#b45309");
    expect(html).toContain("A made-up person to try LockedIn with. Not an account.");
    expect(html).toContain("Economics in Berlin.");
    expect(html).toContain("Europe/Berlin");
    expect(html).toContain('href="https://www.linkedin.com/in/lockedin-demo-jonas"');
    expect(html).not.toContain("@");
  });

  it("their profile page's sharing controls are off and disabled, with the reason, and nothing to remove", () => {
    const lea = demoPerson("demo-lea")!;
    const html = renderToStaticMarkup(
      <PersonView person={demoProfileCard(lea)} now="2026-11-17T13:20:00.000Z" sections relation={{ contactId: null, out: NOTHING_SHARED, shared: lea.shares, demo: true }} />,
    );
    expect(html).toContain(`${DEMO_SHARE_NOTE}.`);
    expect(html).toMatch(/disabled="" aria-label="Share your focus chart with Lea Sousa"/);
    expect(html).not.toContain("Remove contact");
    expect(html).toContain(">Lea Sousa&#x27;s week</h2>");
    expect(html).toContain(">Show in my calendar</button>");
  });

  it("the calendar's People picker shows them with the tag; Analytics names them as demo", () => {
    const people = demoSharingPeople();
    const picker = renderToStaticMarkup(<SharedPeopleButton people={people} chosen={[]} onToggle={() => {}} />);
    expect(picker).toContain("People");
    const focus = renderToStaticMarkup(<SharedFocus people={people.filter((p) => p.focus)} />);
    expect(focus).toContain("Lea Sousa · focus time per week");
    expect(focus).toContain(">Demo</span>");
  });

  it("an avatar with a look never shows a photo, only the fixed initials on the colour", () => {
    const html = renderToStaticMarkup(<Avatar name="Lea Sousa" photoUrl="/api/profiles/x/photo" look={{ initials: "LS", color: "#0f766e" }} size={32} />);
    expect(html).not.toContain("<img");
    expect(html).toContain(">LS</span>");
    expect(html).toContain("text-white");
  });
});
