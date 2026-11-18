// The People page's markup (spec 53, from specs 28 and 33): the four sections in order, the labelled
// invite field, accept and decline with the sentence about what the other person sees, sent invitations
// with their date and Withdraw, and one quiet sentence for each empty section. The inviter is a chip with
// name and photo, a plain link to their profile page (the address is shown there), and a contact is a
// card linking to their profile, without address or Remove (those are on the profile page).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PeopleData } from "@/lib/profiles/types";
import { PeopleView } from "./PeopleView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const ME = { userId: "u1", displayName: null, name: "alice", email: "alice@example.com", photoUrl: null };
const EMPTY: PeopleData = { me: ME, contacts: [], received: [], sent: [] };
const FULL: PeopleData = {
  me: ME,
  received: [{ id: "i1", userId: "u2", name: "Bob Stone", email: "bob@example.com", photoUrl: "/api/profiles/u2/photo?v=5", since: "2026-11-15T10:00:00.000Z" }],
  sent: [{ id: "i2", email: "carol@example.com", sentAt: "2026-11-14T23:30:00.000Z" }],
  contacts: [{ id: "c1", userId: "u3", name: "dave", email: "dave@example.com", photoUrl: null, since: "2026-11-10T10:00:00.000Z" }],
};

const render = (data: PeopleData) => renderToStaticMarkup(<PeopleView data={data} timeZone="Europe/Lisbon" />);

describe("People page", () => {
  it("has the title and the four sections in order", () => {
    const html = render(EMPTY);
    expect(html).toContain(">People</h1>");
    const order = ["Invite someone", "Invitations for you", "Invitations you sent", "Your contacts"].map((t) => html.indexOf(`>${t}</h2>`));
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("labels the invite field and keeps a live place for the neutral answer", () => {
    const html = render(EMPTY);
    expect(html).toMatch(/<label for="([^"]+)" class="sr-only">E-mail address<\/label><input id="\1" type="email"[^>]*name="email"/);
    expect(html).toMatch(/<p id="[^"]+" role="status" class="sr-only"><\/p>/);
    expect(html).toContain(">Send invitation</button>");
  });

  it("shows one quiet sentence for each empty section", () => {
    const html = render(EMPTY);
    for (const text of ["No one has invited you.", "You have no open invitations.", "No contacts yet."]) expect(html).toContain(text);
  });

  it("lists an invitation with the inviter's photo and name as a chip to their profile, Accept and Decline, and what accepting shows", () => {
    const html = render(FULL);
    expect(html).toContain("They will see your name, photo and e-mail address.");
    expect(html).toMatch(/<img src="\/api\/profiles\/u2\/photo\?v=5" alt=""/);
    expect(html).toMatch(/<a class="[^"]*" href="\/people\/u2">/);
    expect(html).not.toContain("aria-haspopup");
    expect(html).toContain(">Bob Stone</span>");
    // The address is on the inviter's profile page, never on this page itself.
    expect(html).not.toContain("bob@example.com");
    expect(html).toMatch(/aria-label="Accept the invitation from Bob Stone\. They will see your name, photo and e-mail address\."[^>]*>Accept<\/button>/);
    expect(html).toMatch(/aria-label="Decline the invitation from Bob Stone"[^>]*>Decline<\/button>/);
  });

  it("lists a sent invitation with only its address and date (in the user's time zone) and Withdraw", () => {
    const html = render(FULL);
    expect(html).toContain(">carol@example.com</p>");
    expect(html).toContain(">Sent Nov 14</p>");
    expect(html).toMatch(/aria-label="Withdraw the invitation to carol@example.com"[^>]*>Withdraw<\/button>/);
  });

  it("shows a contact as a card linking to their profile, with the initials and name, without address or Remove", () => {
    const html = render(FULL);
    expect(html).toMatch(/<a class="[^"]*" href="\/people\/u3"><span aria-hidden="true"[^>]*>D<\/span>/);
    expect(html).toContain(">dave</span>");
    expect(html).not.toContain("dave@example.com");
    expect(html).not.toContain(">Remove</button>");
  });
});
