// The sharing row under each contact on the People page (spec 29): the calendar's three levels as a
// labelled radio group with the saved one checked, the focus chart as a labelled switch, and a line with
// what the contact shares with the user and its links. The last test is rewritten for spec 33: the row
// moved from the People page to the person's profile page ("What you share with <name>").
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PeopleData } from "@/lib/profiles/types";
import { PeopleView } from "./PeopleView";
import { PersonView } from "@/components/profile/PersonView";
import { ShareRow } from "./ShareRow";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const render = (out: { calendar: "none" | "busy" | "details"; focus: boolean }, shared: { calendar: "none" | "busy" | "details"; focus: boolean }) =>
  renderToStaticMarkup(<ShareRow contactId="c1" userId="u3" name="Dave" out={out} shared={shared} />);

describe("ShareRow", () => {
  it("offers Off, Free/busy and Details with the saved level checked, and a labelled focus chart switch", () => {
    const html = render({ calendar: "busy", focus: false }, { calendar: "none", focus: false });
    expect(html).toContain(">You share with Dave</p>");
    expect(html).toMatch(/role="radiogroup" aria-labelledby="[^"]+ [^"]+"/);
    expect(html).toMatch(/<input type="radio"[^>]*checked="" value="busy"/);
    for (const label of ["Off", "Free/busy", "Details"]) expect(html).toContain(`/>${label}</label>`);
    expect(html).toMatch(/<input type="checkbox" role="switch" aria-label="Share your focus chart with Dave"/);
    expect(html).not.toMatch(/role="switch"[^>]*checked=""/);
    expect(html).toContain("Dave shares nothing with you.");
    expect(html).not.toContain("Show in calendar");
  });

  it("says what the contact shares, with links to the calendar and the chart", () => {
    const html = render({ calendar: "none", focus: true }, { calendar: "details", focus: true });
    expect(html).toMatch(/role="switch"[^>]*checked=""/);
    expect(html).toContain("Shares their calendar (details) and focus chart with you");
    expect(html).toContain('href="/?share=u3"');
    expect(html).toContain('href="/analytics?person=u3"');
  });

  it("appears on a contact's profile page under \"What you share with\", no longer on the People page", () => {
    const data: PeopleData = {
      me: { userId: "u1", displayName: null, name: "alice", email: "alice@example.com", photoUrl: null },
      received: [],
      sent: [],
      contacts: [{ id: "c1", userId: "u3", name: "dave", email: "dave@example.com", photoUrl: null, since: "2026-11-10T10:00:00.000Z" }],
    };
    const shares = [{ contactId: "c1", userId: "u3", out: { calendar: "details" as const, focus: false }, in: { calendar: "busy" as const, focus: false } }];
    const people = renderToStaticMarkup(<PeopleView data={data} timeZone="Europe/Lisbon" shares={shares} />);
    expect(people).not.toContain("You share with dave");
    const profile = renderToStaticMarkup(
      <PersonView
        person={{ userId: "u3", displayName: null, name: "dave", email: "dave@example.com", photoUrl: null, bio: null, linkedinUrl: null, timeZone: "Europe/Berlin" }}
        now="2026-11-17T14:20:00.000Z"
        sections
        relation={{ contactId: "c1", out: shares[0].out, shared: shares[0].in, demo: false }}
      />,
    );
    expect(profile).toContain(">What you share with dave</h2>");
    expect(profile).toContain(">You share with dave</p>");
    expect(profile).toMatch(/checked="" value="details"/);
  });
});
