// Spec 54, changed 19 Nov 2026 after the owner tried it with two accounts: the People page has "Event
// invitations" above the contact invitations, the same list as the calendar's toolbar (not answered yet
// and declined ones, of events that have not ended): title, date and time on the viewer's clock and in
// their time format, place as text, "Invited by <name>", Accept / Maybe / Decline with the current answer
// pressed. No section when there are none. Other people's words are text only (S6).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DisplayProvider } from "@/components/shell/DisplayProvider";
import type { InvitedEvent } from "@/lib/invites/types";
import type { PeopleData } from "@/lib/profiles/types";
import { DEFAULT_DISPLAY } from "@/lib/time/display";
import { PeopleView } from "./PeopleView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const ME = { userId: "u1", displayName: null, name: "alice", email: "alice@example.com", photoUrl: null };
const DATA: PeopleData = {
  me: ME,
  contacts: [],
  received: [{ id: "i1", userId: "u2", name: "Bob Stone", email: "bob@example.com", photoUrl: null, since: "2026-11-15T10:00:00.000Z" }],
  sent: [],
};
const ANA = { userId: "a", name: "Ana Lopes", photoUrl: null };
const invited = (answer: InvitedEvent["answer"], extra: Partial<InvitedEvent> = {}): InvitedEvent =>
  ({
    inviteId: "e-i1",
    answer,
    inviter: ANA,
    title: "Group project meeting",
    location: "Library, room 4",
    allDay: false,
    startAt: "2026-11-20T11:00:00.000Z",
    endAt: "2026-11-20T12:00:00.000Z",
    ...extra,
  }) as InvitedEvent;

const render = (eventInvites?: InvitedEvent[], timeFormat: "12h" | "24h" = "12h") =>
  renderToStaticMarkup(
    <DisplayProvider value={{ ...DEFAULT_DISPLAY, timeFormat }}>
      <PeopleView data={DATA} timeZone="Europe/Lisbon" eventInvites={eventInvites} />
    </DisplayProvider>,
  );

describe("Event invitations on the People page (spec 54, changed 19 Nov 2026)", () => {
  it("no section when there are none", () => {
    expect(render()).not.toContain("Event invitations");
    expect(render([])).not.toContain("Event invitations");
    // An accepted one is not in the list (as in the calendar's toolbar).
    expect(render([invited("accepted")])).not.toContain("Event invitations");
  });

  it("sits above the contact invitations, with title, time, place, who invited and the three answers", () => {
    const html = render([invited("pending"), invited("declined", { inviteId: "e-i2", title: "Lunch", location: null })]);
    const events = html.indexOf(">Event invitations</h2>");
    expect(events).toBeGreaterThan(html.indexOf(">Invite someone</h2>"));
    expect(events).toBeLessThan(html.indexOf(">Invitations for you</h2>"));
    const section = html.slice(events, html.indexOf(">Invitations for you</h2>"));
    expect(section).toContain(">Group project meeting</p>");
    expect(section).toContain(">Library, room 4</p>");
    expect(section).toContain("Invited by Ana Lopes");
    expect(section.match(/role="group" aria-label="Your answer"/g)).toHaveLength(2);
    // The current answer pressed: none for the first, Decline for the second.
    expect(section.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(section).toMatch(/aria-pressed="true"[^>]*>(?:(?!<\/button>).)*Decline<\/button>/);
    expect(section).toContain("Your answer: declined");
  });

  it("the time on the viewer's clock and in their format (11:00 UTC is 11am in Lisbon in November)", () => {
    expect(render([invited("pending")])).toContain("Friday, November 20, 11am – 12pm");
    expect(render([invited("pending")], "24h")).toMatch(/Friday, November 20, 11:00 – 12:00/);
  });

  it("S6: other people's words are text only", () => {
    const html = render([invited("pending", { title: "<img src=x onerror=alert(1)>", location: "<b>x</b>", inviter: { userId: "a", name: "<i>Ana</i>", photoUrl: null } })]);
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>x</b>");
    expect(html).not.toContain("<i>Ana</i>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});
