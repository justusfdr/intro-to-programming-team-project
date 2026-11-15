// The markup of event invitations (spec 36, R59 to R64), as the browser first receives it: the marks with
// their names in words, the owner's block with its avatar stack and its name listing the answers, the
// invited person's read-only block in each look (pending dashed, maybe lighter with "Maybe", accepted
// solid), the small card with "Invited by" and the three answers (spec 38), the toolbar's button, and the editor's
// "People in LockedIn" section above "Guests by e-mail (Outlook)", disabled with a reason where R59 says so.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { WeekEvent } from "@/lib/events/types";
import type { InviteContact, InvitedEvent, InvitePerson } from "@/lib/invites/types";
import type { SharedBlock } from "@/lib/shares/place";
import { EditEventCard } from "./EventEditor";
import { AnswerButtons, AnswerMark, InvitationsButton, InvitedEventBody, InviteesList } from "./Invites";
import { SharedBlockView } from "./Shared";
import { TimeGrid } from "./TimeGrid";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const noop = () => {};
const RANGE = { startMin: 7 * 60, endMin: 21 * 60 };
const PEOPLE: InvitePerson[] = [
  { userId: "u1", name: "Emily Lea", photoUrl: null, answer: "accepted" },
  { userId: "u2", name: "Ben Brown", photoUrl: null, answer: "declined" },
  { userId: "u3", name: "Dora Dias", photoUrl: null, answer: "tentative" },
  { userId: "u4", name: "Carl Cruz", photoUrl: null, answer: "pending" },
];

function event(fields: Partial<WeekEvent> = {}): WeekEvent {
  return {
    id: "e1",
    title: "Group project meeting",
    allDay: false,
    startAt: "2026-11-20T10:00:00.000Z",
    endAt: "2026-11-20T12:00:00.000Z",
    firstDay: null,
    lastDay: null,
    mayOverlap: false,
    status: "planned",
    goalId: null,
    seriesId: null,
    source: "app",
    location: null,
    notSent: false,
    updatedAt: "2026-11-15T10:00:00.000Z",
    conflict: false,
    startTime: "10:00",
    endTime: "12:00",
    endDay: null,
    startLocal: "2026-11-20T10:00",
    endLocal: "2026-11-20T12:00",
    ...fields,
  };
}

describe("marks and lists", () => {
  it("each answer has its own mark, and each person's row is named in words", () => {
    for (const answer of ["accepted", "declined", "tentative", "pending"] as const) {
      expect(renderToStaticMarkup(<AnswerMark answer={answer} />)).toContain(`data-answer="${answer}"`);
    }
    const html = renderToStaticMarkup(<InviteesList people={PEOPLE} links={false} />);
    expect(html).toContain('aria-label="Emily Lea: accepted"');
    expect(html).toContain('aria-label="Ben Brown: declined"');
    expect(html).toContain('aria-label="Dora Dias: maybe"');
    expect(html).toContain('aria-label="Carl Cruz: no answer yet"');
    expect(html).not.toContain("@");
  });

  it("the three answers, the current one pressed", () => {
    const html = renderToStaticMarkup(<AnswerButtons answer="tentative" busy={false} onAnswer={noop} />);
    expect([...html.matchAll(/aria-pressed="(true|false)"[^>]*>.*?(Accept|Maybe|Decline)</g)].map((m) => [m[2], m[1]])).toEqual([
      ["Accept", "false"],
      ["Maybe", "true"],
      ["Decline", "false"],
    ]);
  });
});

describe("the owner's block", () => {
  it("shows a stack of three avatars with +1 and names everyone's answer; still the user's own draggable block", () => {
    const own = event();
    const day = { date: "2026-11-20", label: "Fri 20", isToday: false, events: [own], allDay: [] };
    const placed = [[{ event: own, startMin: 600, endMin: 720, continuesBefore: false, continuesAfter: false, lane: 0, lanes: 1 }]];
    const html = renderToStaticMarkup(
      <TimeGrid goals={[]} days={[day]} placed={placed} range={RANGE} nowMin={null} selectedDay="2026-11-20" onOpenEvent={noop} onDrop={noop} invitees={{ e1: PEOPLE }} />,
    );
    expect(html).toContain("4 invited: Emily Lea accepted, Ben Brown declined, Dora Dias maybe, Carl Cruz no answer yet");
    expect(html).toContain("data-avatar-stack");
    expect(html).toContain(">+1</span>");
    expect(html).toContain("cursor-grab");
  });
});

function invitedBlock(answer: "pending" | "tentative" | "accepted"): SharedBlock {
  return {
    person: { userId: "a", name: "Ana Lopes", photoUrl: null, calendar: "details", focus: false },
    level: "details",
    key: "invite-i1",
    title: "Group project meeting",
    location: "Library, room 4",
    startAt: "2026-11-20T10:00:00.000Z",
    endAt: "2026-11-20T12:00:00.000Z",
    startMin: 600,
    endMin: 720,
    continuesBefore: false,
    continuesAfter: false,
    lane: 0,
    lanes: 1,
    invite: { inviteId: "i1", answer },
  };
}

describe("the invited person's block (R61, R63)", () => {
  const render = (answer: "pending" | "tentative" | "accepted") =>
    renderToStaticMarkup(<SharedBlockView block={invitedBlock(answer)} range={RANGE} left={0.62} width={0.38} timeZone="Europe/Lisbon" onOpen={noop} />);

  it("a read-only button named with the inviter and the answer; never draggable", () => {
    const html = render("pending");
    expect(html).toMatch(/<button type="button" data-invite="pending" aria-label="Group project meeting, Friday, November 20, 10am – 12pm, invited by Ana Lopes, your answer: no answer yet"/);
    expect(html).not.toContain("cursor-grab");
    expect(html).not.toContain("ns-resize");
    expect(html).not.toContain("repeating-linear-gradient");
  });

  it("pending dashed, maybe lighter with 'Maybe', accepted solid", () => {
    expect(render("pending")).toContain("border-dashed");
    const maybe = render("tentative");
    expect(maybe).toContain("border-dashed");
    expect(maybe).toContain("opacity-80");
    expect(maybe).toContain("Maybe · 10am – 12pm");
    expect(render("accepted")).not.toContain("border-dashed");
  });
});

const INVITED: InvitedEvent = {
  inviteId: "i1",
  answer: "pending",
  inviter: { userId: "a", name: "Ana Lopes", photoUrl: null },
  title: "Group project meeting",
  location: "Library, room 4",
  allDay: false,
  startAt: "2026-11-20T10:00:00.000Z",
  endAt: "2026-11-20T12:00:00.000Z",
};

describe("the card of an invited event and the invitations button", () => {
  it("title, time, 'Invited by', the answers and the place as text; no Edit, no map", () => {
    const html = renderToStaticMarkup(
      <InvitedEventBody event={INVITED} answer="accepted" busy={false} note="You accepted." timeZone="Europe/Lisbon" onAnswer={noop} />,
    );
    const at = (text: string) => html.indexOf(text);
    expect(at("Group project meeting")).toBeGreaterThan(-1);
    expect(at("Fri, Nov 20")).toBeGreaterThan(at("Group project meeting"));
    expect(html).toContain("Invited by");
    expect(html).toContain('href="/people/a"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toMatch(/role="status"[^>]*>You accepted.<\/p>/);
    expect(html).toContain("Library, room 4");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain(">Edit<");
  });

  it("the button says how many are not answered, and is not there without invitations", () => {
    expect(renderToStaticMarkup(<InvitationsButton open={[]} answerOf={(e) => e.answer} busyId={null} timeZone="UTC" onAnswer={noop} />)).toBe("");
    const two = renderToStaticMarkup(
      <InvitationsButton open={[INVITED, { ...INVITED, inviteId: "i2" }]} answerOf={(e) => e.answer} busyId={null} timeZone="UTC" onAnswer={noop} />,
    );
    expect(two).toContain("2 invitations");
    const declinedOnly = renderToStaticMarkup(
      <InvitationsButton open={[{ ...INVITED, answer: "declined" }]} answerOf={(e) => e.answer} busyId={null} timeZone="UTC" onAnswer={noop} />,
    );
    expect(declinedOnly).toContain(">Invitations</button>");
  });
});

describe("the editor's People in LockedIn (R59)", () => {
  const CONTACTS: InviteContact[] = [
    { contactId: "c1", userId: "u1", name: "Emily Lea", photoUrl: null },
    { contactId: "c2", userId: "u2", name: "Ben Brown", photoUrl: null },
  ];
  const COMMON = { goals: [], timeZone: "Europe/Lisbon", today: "2026-11-16", anchor: null, onClose: noop, outlookConnected: true };
  const edit = (e: WeekEvent, invites: { contacts: InviteContact[]; own: Record<string, InvitePerson[]> } = { contacts: CONTACTS, own: { e1: [PEOPLE[0]] } }) => renderToStaticMarkup(<EditEventCard event={e} {...COMMON} invites={invites} />);

  it("above the guests by e-mail: the invited contact with their mark, and a list of the others to add", () => {
    const html = edit(event());
    const at = (text: string) => html.indexOf(text);
    expect(at(">People in LockedIn</p>")).toBeGreaterThan(at(">When</p>"));
    expect(at(">Guests by e-mail (Outlook)</p>")).toBeGreaterThan(at(">People in LockedIn</p>"));
    expect(html).toContain('aria-label="Emily Lea: accepted"');
    expect(html).toContain('aria-label="Remove Emily Lea"');
    expect(html).toContain('<option value="c2">Ben Brown</option>');
    expect(html).not.toContain('<option value="c1">');
    expect(html).toContain("Undo after a delete does not invite them again.");
  });

  it("says why it cannot invite: a series, an Outlook event, a demo event, an ended event", () => {
    expect(edit(event({ seriesId: "s1" }))).toContain("Events of a series cannot invite people.");
    expect(edit(event({ source: "outlook" }))).toContain("Outlook events cannot invite people.");
    expect(edit(event({ demo: true }))).toContain("Demo events cannot invite people.");
    expect(edit(event({ endLocal: "2026-11-10T12:00", startLocal: "2026-11-10T10:00" }))).toContain("This event has ended.");
    expect(edit(event({ seriesId: "s1" }))).not.toContain("<select");
  });

  it("without contacts: a link to People", () => {
    const html = edit(event(), { contacts: [], own: {} });
    expect(html).toContain('href="/people"');
    expect(html).toContain("Add contacts on People");
  });
});
