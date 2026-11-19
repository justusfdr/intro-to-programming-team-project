// The markup of event invitations (spec 54, from spec 36): an invited event's block in each answer's look
// (R61, decided 19 Nov 2026: no stripes), its card (R60: title, time, place as text, "Invited by", the
// other people with their marks, Accept / Maybe / Decline with the current answer pressed, never "Edit"),
// the toolbar's list, the owner's block with the avatar stack and an accessible name that lists the
// people and their answers, and the editor's "People in LockedIn". S5: an invited block never gives the
// viewer's own event an overlap mark, and the calendar's overlap data never reads an invitation. S6:
// other people's words are rendered as text only.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { invitedCalendars, placeShared, type SharedBlock } from "@/lib/shares/place";
import type { InvitedEvent, InvitePerson } from "@/lib/invites/types";
import { InvitationsButton, InvitationsList, InvitedEventDetails } from "./Invites";
import { SharedAllDayChip, SharedBlockView, SharedMonthRow } from "./Shared";
import { PeopleSection } from "./editor/PeopleSection";

const RANGE = { startMin: 7 * 60, endMin: 21 * 60 };
const ANA = { userId: "a", name: "Ana Lopes", photoUrl: null };

const invited = (answer: InvitedEvent["answer"], extra: Partial<InvitedEvent> = {}): InvitedEvent =>
  ({
    inviteId: "i1",
    answer,
    inviter: ANA,
    title: "Group project meeting",
    location: "Library, room 4",
    allDay: false,
    startAt: "2026-11-20T11:00:00.000Z",
    endAt: "2026-11-20T12:00:00.000Z",
    ...extra,
  }) as InvitedEvent;

/** The block of one invited event as the calendar places it (UTC: 11:00 to 12:00). */
function blockOf(answer: InvitedEvent["answer"]): SharedBlock {
  const [[block]] = placeShared(invitedCalendars([invited(answer)], (e) => e.answer), ["2026-11-20"], "UTC");
  return block;
}

const renderBlock = (b: SharedBlock) => renderToStaticMarkup(<SharedBlockView block={b} range={RANGE} left={0} width={1} timeZone="UTC" onOpen={() => {}} />);

describe("an invited event's block in the invited person's calendar (R61)", () => {
  it("no answer yet: white, dashed in ink, the inviter's avatar and the title; a button that opens the card, never dragged", () => {
    const html = renderBlock(blockOf("pending"));
    expect(html).toMatch(/<button type="button" data-invite="pending" aria-label="Group project meeting, Friday, November 20, 11am – 12pm, invited by Ana Lopes, your answer: no answer yet"/);
    expect(html).toContain("bg-surface border border-dashed border-ink-3 text-ink");
    expect(html).toContain(">AL</span>");
    expect(html).toContain(">Group project meeting</span>");
    for (const never of ["cursor-grab", "ns-resize", "data-event-id", "repeating-linear-gradient", "border-l-[3px]"]) expect(html).not.toContain(never);
  });

  it("maybe: the same, lighter, with 'Maybe'", () => {
    const html = renderBlock(blockOf("tentative"));
    expect(html).toContain("bg-surface border border-dashed border-ink-3 text-ink-3");
    expect(html).toContain("Maybe · 11am – 12pm");
    expect(html).toContain("your answer: maybe");
  });

  it("accepted: solid like an own event without a goal, with the inviter's avatar", () => {
    const html = renderBlock(blockOf("accepted"));
    expect(html).toContain("bg-raised border border-line-subtle text-ink");
    expect(html).not.toContain("border-dashed");
    expect(html).toContain(">AL</span>");
  });

  it("declined: not in the grid at all", () => {
    expect(placeShared(invitedCalendars([invited("declined")], (e) => e.answer), ["2026-11-20"], "UTC")).toEqual([[]]);
  });

  it("an all-day invitation and a month row have the same looks", () => {
    const allDay = invited("tentative", { allDay: true, firstDay: "2026-11-20", lastDay: "2026-11-20" } as Partial<InvitedEvent>);
    const [calendar] = invitedCalendars([allDay], (e) => e.answer);
    const chip = renderToStaticMarkup(
      <SharedAllDayChip item={{ person: calendar.person, level: "details", key: "k", event: calendar.events[0] as never }} onOpen={() => {}} />,
    );
    expect(chip).toContain("border-dashed");
    expect(chip).toContain("Maybe · Group project meeting");
    const row = renderToStaticMarkup(<SharedMonthRow entry={{ key: "k", block: blockOf("pending") }} timeZone="UTC" onOpen={() => {}} />);
    expect(row).toContain('data-invite="pending"');
    expect(row).toContain("border-dashed");
    expect(row).not.toContain("repeating-linear-gradient");
  });

  it("S6: another person's title is text, never markup", () => {
    const [[block]] = placeShared(invitedCalendars([invited("pending", { title: "<img src=x onerror=alert(1)>" })], (e) => e.answer), ["2026-11-20"], "UTC");
    const html = renderBlock(block);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});

describe("the invitation's card (R60)", () => {
  const people: InvitePerson[] = [{ userId: "d", name: "Dora Dias", photoUrl: null, answer: "pending" }];

  it("shows title, time, place as text, who invited, the others with marks, and the answers with the current one pressed; never Edit", () => {
    const html = renderToStaticMarkup(<InvitedEventDetails event={invited("tentative")} answer="tentative" busy={false} note={null} timeZone="UTC" onAnswer={() => {}} people={people} />);
    expect(html).toContain(">Group project meeting</h2>");
    expect(html).toContain("Friday, November 20, 11am – 12pm");
    expect(html).toContain(">Library, room 4</p>");
    expect(html).toMatch(/Invited by<\/span><a [^>]*href="\/people\/a"/);
    expect(html).toContain('aria-label="Dora Dias: no answer yet"');
    expect(html).toContain('data-answer="pending"');
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*Maybe<\/button>/);
    expect(html).toMatch(/aria-pressed="false"[^>]*>.*Accept<\/button>/);
    expect(html).not.toContain("Edit");
    expect(html).not.toContain("@");
    // The co-invited person is not a link (not every co-invited person is a contact).
    expect(html).not.toContain('href="/people/d"');
  });

  it("says it is loading the others until they are read", () => {
    const html = renderToStaticMarkup(<InvitedEventDetails event={invited("pending")} answer="pending" busy={false} note={null} timeZone="UTC" onAnswer={() => {}} people={null} />);
    expect(html).toContain("Loading who else is invited");
  });
});

describe("the toolbar's invitations", () => {
  it("no button without invitations to look at", () => {
    expect(renderToStaticMarkup(<InvitationsButton open={[]} answerOf={(e) => e.answer} busyId={null} timeZone="UTC" onAnswer={() => {}} />)).toBe("");
  });

  it("'2 invitations' counts those not answered; the list has each with its answers", () => {
    const open = [invited("pending"), invited("pending", { inviteId: "i2" }), invited("declined", { inviteId: "i3" })];
    const button = renderToStaticMarkup(<InvitationsButton open={open} answerOf={(e) => e.answer} busyId={null} timeZone="UTC" onAnswer={() => {}} />);
    expect(button).toContain('aria-label="2 invitations"');
    const list = renderToStaticMarkup(<InvitationsList open={open} answerOf={(e) => e.answer} busyId={null} timeZone="UTC" onAnswer={() => {}} />);
    expect(list.match(/role="group" aria-label="Your answer"/g)).toHaveLength(3);
    expect(list).toContain("Invited by Ana Lopes");
    expect(list).toContain("Your answer: declined");
  });
});

describe("the owner's block (time grid)", () => {
  const own = {
    id: "e1", title: "Group project meeting", allDay: false as const, startAt: "2026-11-17T10:00:00.000Z", endAt: "2026-11-17T11:00:00.000Z",
    firstDay: null, lastDay: null, mayOverlap: false, status: "planned" as const, goalId: null, seriesId: null, source: "app" as const,
    location: null, notSent: false, updatedAt: "2026-11-15T10:00:00.000Z", conflict: false, startTime: "10:00", endTime: "11:00",
    endDay: null, startLocal: "2026-11-17T10:00", endLocal: "2026-11-17T11:00",
  };
  const day = { date: "2026-11-17", label: "Tue 17", isToday: false, events: [own], allDay: [] };
  const placed = [[{ event: own, startMin: 600, endMin: 660, continuesBefore: false, continuesAfter: false, lane: 0, lanes: 1 }]];
  const five: InvitePerson[] = ["Ben", "Dora", "Eve", "Finn", "Gil"].map((name, i) => ({ userId: `u${i}`, name, photoUrl: null, answer: i === 0 ? "accepted" : i === 1 ? "declined" : "pending" }));

  async function grid(props: Record<string, unknown>) {
    const { TimeGrid } = await import("./TimeGrid");
    return renderToStaticMarkup(
      <TimeGrid goals={[]} days={[day]} placed={placed} range={RANGE} nowMin={null} selectedDay="2026-11-17" onOpenEvent={() => {}} onCreate={() => {}} onDrop={() => {}} tripWarned={new Set()} timeZone="UTC" onOpenShared={() => {}} {...props} />,
    );
  }

  it("shows up to 3 avatars and '+2'; its name and title list each person with their answer", async () => {
    const html = await grid({ invitees: { e1: five } });
    const button = html.match(/<button[^>]*data-event-id="e1"[^>]*>/)?.[0] ?? "";
    expect(button).toContain("5 invited: Ben accepted, Dora declined, Eve no answer yet, Finn no answer yet, Gil no answer yet");
    expect(button).toMatch(/title="5 invited: Ben accepted/);
    expect(html).toContain("data-avatar-stack");
    expect(html).toContain(">+2</span>");
    expect(html.match(/>(BE|DO|EV|FI|GI|B|D|E|F|G)<\/span>/g)?.length).toBe(3);
  });

  it("without invited people: no stack and no title", async () => {
    const html = await grid({});
    expect(html).not.toContain("data-avatar-stack");
    expect(html.match(/<button[^>]*data-event-id="e1"[^>]*>/)?.[0]).not.toContain("title=");
  });

  it("S5: an own event at the same time as an invited block gets no overlap mark; only the overlapping part gives up width (b3eb6c0)", async () => {
    const [[shared]] = placeShared(invitedCalendars([invited("pending", { startAt: "2026-11-17T10:30:00.000Z", endAt: "2026-11-17T11:30:00.000Z" } as Partial<InvitedEvent>)], (e) => e.answer), ["2026-11-17"], "UTC");
    const html = await grid({ shared: [[shared]], sharedAllDay: [[]] });
    const button = html.match(/<button[^>]*data-event-id="e1"[^>]*>/)?.[0] ?? "";
    expect(button).not.toContain("overlaps another event");
    expect(button).not.toContain("border-l-warning");
    expect(button).toMatch(/width:calc\(62% - 4px\)/);
    expect(html).toContain('data-invite="pending"');
    // At another time of the day the own block keeps the whole column.
    const [[later]] = placeShared(invitedCalendars([invited("pending", { startAt: "2026-11-17T15:00:00.000Z", endAt: "2026-11-17T16:00:00.000Z" } as Partial<InvitedEvent>)], (e) => e.answer), ["2026-11-17"], "UTC");
    const apart = await grid({ shared: [[later]], sharedAllDay: [[]] });
    expect(apart.match(/<button[^>]*data-event-id="e1"[^>]*>/)?.[0]).toMatch(/width:calc\(100% - 4px\)/);
  });
});

describe("S5: the calendar's own data never reads an invitation", () => {
  const source = readFileSync(join(__dirname, "CalendarView.tsx"), "utf8");
  const statementOf = (start: string, end: RegExp) => {
    const from = source.indexOf(start);
    expect(from).toBeGreaterThan(-1);
    const rest = source.slice(from);
    const match = rest.match(end);
    return rest.slice(0, match!.index! + match![0].length);
  };

  it.each([
    ["const shownEvents = useMemo(", /;\n/],
    ["const timed = useMemo<NamedEvent[]>(", /\n {2}\);\n/],
    ["const tripWarned = useMemo(", /;\n/],
    ["overlapAt.current = (event, start, end) => {", /\n {4}\};\n/],
  ] as const)("%s never names an invitation", (start, end) => {
    expect(statementOf(start, end)).not.toMatch(/invit|Invit/);
  });

  it("the editor and dragging get only the user's own events (the grid's own blocks); invitations only as their people", () => {
    expect(source).toContain("invitees={invites.own}");
    expect(source).toContain("invites={{ contacts: invites.contacts, own: invites.own }}");
    expect(source).not.toMatch(/onOpenEvent=\{[^}]*invite/);
  });
});

describe("People in LockedIn in the editor (R59)", () => {
  const contacts = [
    { contactId: "c1", userId: "u1", name: "Ben Brown", photoUrl: null },
    { contactId: "c2", userId: "u2", name: "Dora Dias", photoUrl: null },
    { contactId: "c3", userId: "u3", name: "Eve Ek", photoUrl: null },
  ];

  it("each contact with a box; the invited ones ticked with their answer, a new one 'invited when you save'", () => {
    const html = renderToStaticMarkup(
      <PeopleSection mode="edit" contacts={contacts} chosen={["c1", "c3"]} answers={new Map([["u1", "accepted"], ["u2", "tentative"]])} error="" onToggle={() => {}} />,
    );
    expect(html).toContain(">People in LockedIn</p>");
    expect(html.match(/type="checkbox"/g)).toHaveLength(3);
    expect(html.match(/checked=""/g)).toHaveLength(2);
    expect(html).toContain(">accepted</span>");
    expect(html).toContain('data-answer="accepted"');
    expect(html).toContain(">invited when you save</span>");
    expect(html).toContain(">taken off when you save</span>");
    expect(html).not.toContain("@");
  });

  it("where R59 forbids it, the reason and who is invited; without contacts, a link to People", () => {
    const html = renderToStaticMarkup(<PeopleSection mode="unavailable" reason="Events of a series cannot invite people" people={[{ userId: "u1", name: "Ben Brown", photoUrl: null, answer: "declined" }]} />);
    expect(html).toContain("Events of a series cannot invite people.");
    expect(html).toContain('aria-label="Ben Brown: declined"');
    expect(html).not.toContain('type="checkbox"');
    const none = renderToStaticMarkup(<PeopleSection mode="no_contacts" />);
    expect(none).toMatch(/<a [^>]*href="\/people"[^>]*>Add contacts on People<\/a>/);
  });

  it("at 20 chosen, the others cannot be ticked", () => {
    const many = Array.from({ length: 21 }, (_, i) => ({ contactId: `c${i}`, userId: `u${i}`, name: `P${i}`, photoUrl: null }));
    const html = renderToStaticMarkup(<PeopleSection mode="edit" contacts={many} chosen={many.slice(0, 20).map((c) => c.contactId)} answers={new Map()} error="" onToggle={() => {}} />);
    expect(html.match(/disabled=""/g)).toHaveLength(1);
  });
});

describe("S6: no markup from other people's words anywhere in the invitation screens", () => {
  it.each(["Invites.tsx", "Shared.tsx", "editor/PeopleSection.tsx"])("%s never sets inner HTML", (file) => {
    expect(readFileSync(join(__dirname, file), "utf8")).not.toContain("dangerouslySetInnerHTML");
  });
});
