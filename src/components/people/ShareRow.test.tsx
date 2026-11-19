// What the user shares with a contact (spec 53, from specs 29 and 33), on the contact's profile page:
// the calendar's three levels as a labelled radio group with the saved one checked, what each level
// reveals in plain words (E10), no focus-chart switch, and every save keeps the stored focus flag
// unchanged (set_share needs it; the app does not offer it).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PeopleData } from "@/lib/profiles/types";
import { PeopleView } from "./PeopleView";
import { PersonView } from "@/components/profile/PersonView";
import { SHARE_LEVELS_NOTE, ShareRow, shareBody } from "./ShareRow";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const render = (out: { calendar: "none" | "busy" | "details"; focus: boolean }) => renderToStaticMarkup(<ShareRow contactId="c1" name="Dave" out={out} />);

describe("ShareRow", () => {
  it("offers Off, Free/busy and Details with the saved level checked, and no focus chart switch", () => {
    const html = render({ calendar: "busy", focus: true });
    expect(html).toContain(">You share with Dave</p>");
    expect(html).toMatch(/role="radiogroup" aria-labelledby="[^"]+ [^"]+"/);
    expect(html).toMatch(/<input type="radio"[^>]*checked="" value="busy"/);
    for (const label of ["Off", "Free/busy", "Details"]) expect(html).toContain(`/>${label}</label>`);
    expect(html).not.toContain('role="switch"');
    expect(html).not.toMatch(/focus chart|>Focus/i);
  });

  it("says in plain words what each level reveals, tied to the choice (E10)", () => {
    expect(SHARE_LEVELS_NOTE).toBe(
      "Free/busy shows when you are busy, to the minute. Details also shows titles and places, including events from Outlook.",
    );
    const html = render({ calendar: "none", focus: false });
    const describedBy = html.match(/role="radiogroup"[^>]*aria-describedby="([^"]+)"/)?.[1];
    expect(describedBy).toBeTruthy();
    expect(html).toContain(`<p id="${describedBy}" class="text-xs text-ink-3">${SHARE_LEVELS_NOTE}</p>`);
  });

  it("a new level is sent with the stored focus flag unchanged, whatever it is", () => {
    expect(shareBody({ calendar: "none", focus: true }, "details")).toEqual({ calendar: "details", focus: true });
    expect(shareBody({ calendar: "details", focus: true }, "none")).toEqual({ calendar: "none", focus: true });
    expect(shareBody({ calendar: "busy", focus: false }, "details")).toEqual({ calendar: "details", focus: false });
  });

  it("appears on a contact's profile page under \"What you share with\", not on the People page", () => {
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
        relation={{ contactId: "c1", out: shares[0].out, shared: shares[0].in }}
      />,
    );
    expect(profile).toContain(">What you share with dave</h2>");
    expect(profile).toContain(">You share with dave</p>");
    expect(profile).toMatch(/checked="" value="details"/);
  });
});
