// The markup of an accepted invitation's card (spec 55; R65 to R67): laid out like the own editor, with
// the owner's title, date, time and place read only, the shared to-dos and notes, the user's own goal and
// route, the other people, and Accept / Maybe / Decline with Accept pressed. A maybe, a decline and no
// answer yet keep the small card of spec 54. Other people's words are rendered as text only.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SavedPlacesProvider } from "@/components/places/SavedPlaces";
import { acceptedReadOnlyText, showsFullCard, type AcceptedInviteDetails, type InvitedEvent, type InvitePerson } from "@/lib/invites/types";
import { AcceptedInviteView } from "./AcceptedInvite";
import { RouteSection } from "./editor/RouteSection";
import { travelUrl } from "./editor/TravelLine";

const ANA = { userId: "a", name: "Ana Lopes", photoUrl: null };
const GOALS = [
  { id: "g1", title: "Uni", look: { color: "teal", icon: "book" } },
  { id: "g2", title: "Run", look: { color: "rose", icon: "footprints" } },
] as never;

const invited: InvitedEvent = {
  inviteId: "i1",
  answer: "accepted",
  inviter: ANA,
  title: "Group project meeting",
  location: "Library, room 4",
  allDay: false,
  startAt: "2026-11-20T11:00:00.000Z",
  endAt: "2026-11-20T12:00:00.000Z",
};

const details = (extra: Partial<AcceptedInviteDetails> = {}): AcceptedInviteDetails =>
  ({
    ...invited,
    answer: "accepted",
    notes: "Bring the slides",
    todos: [
      { id: "t1", title: "Book the room", done: true },
      { id: "t2", title: "Print handouts", done: false },
    ],
    goalId: "g1",
    travelMode: "transit",
    travelFrom: null,
    done: false,
    ...extra,
  }) as AcceptedInviteDetails;

const people: InvitePerson[] = [{ userId: "d", name: "Dora Dias", photoUrl: null, answer: "tentative" }];
const noop = () => {};
const notes = (extra: Partial<Parameters<typeof AcceptedInviteView>[0]["notes"]> = {}) => ({
  value: "Bring the slides",
  changed: false,
  saving: false,
  error: null,
  onChange: noop,
  onSave: noop,
  onDiscard: noop,
  onReload: noop,
  ...extra,
});
const todos = { onAdd: noop, onRename: noop, onToggle: noop, onMove: noop, onDelete: noop };

function render(d: AcceptedInviteDetails | null, extra: { now?: number; notes?: ReturnType<typeof notes>; event?: InvitedEvent } = {}) {
  return renderToStaticMarkup(
    <SavedPlacesProvider places={[]} home="Rua Augusta 10" travelMode="driving">
      <AcceptedInviteView
        event={extra.event ?? invited}
        details={d}
        people={people}
        busy={false}
        note={null}
        timeZone="UTC"
        goals={GOALS}
        onAnswer={noop}
        onClose={noop}
        notes={extra.notes ?? notes()}
        todos={todos}
        onGoal={noop}
        onFrom={noop}
        onMode={noop}
        onDone={noop}
        now={extra.now ?? Date.parse("2026-11-19T09:00:00Z")}
      />
    </SavedPlacesProvider>,
  );
}

describe("the full card of an accepted invitation (R65)", () => {
  it("shows the owner's title, date and time read only, who invited, and the answers with Accept pressed", () => {
    const html = render(details());
    expect(html).toContain(">Group project meeting</p>");
    expect(html).not.toContain('aria-label="Title"');
    expect(html).toContain("Friday, November 20, 11am – 12pm");
    expect(html).toMatch(/Invited by<\/span><a [^>]*href="\/people\/a"/);
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*Accept<\/button>/);
    expect(html).toMatch(/aria-pressed="false"[^>]*>.*Maybe<\/button>/);
    expect(html).not.toContain("Edit");
    // No e-mail address (the to-do list's own class names contain "[@media…]", so look for an address).
    expect(html).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
  });

  it("has the shared to-dos with their count and the field to add one, and the shared notes", () => {
    const html = render(details());
    expect(html).toContain("Book the room");
    expect(html).toContain("Print handouts");
    expect(html).toContain("1/2");
    expect(html).toContain('placeholder="Add a to-do"');
    expect(html).toMatch(/<textarea[^>]*aria-label="Notes"[^>]*>Bring the slides<\/textarea>/);
    // Nothing typed: no Save button for the notes.
    expect(html).not.toContain("Save notes");
  });

  it("has the user's own goal chips with their goal pressed, and the route with From and the way changeable, To read only", () => {
    const html = render(details());
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*Uni<\/span><\/button>/);
    expect(html).toContain('aria-label="From: Last event"');
    expect(html).toContain("Public transport");
    expect(html).toContain('aria-label="To: Library, room 4"');
    // "To" is text, not a picker button: the place is the owner's.
    expect(html).not.toContain('aria-label="To: Library, room 4" aria-expanded');
    expect(html).not.toContain("Save as place");
  });

  it("lists the others with their answers and says what is read only and what is shared", () => {
    const html = render(details());
    expect(html).toContain('aria-label="Dora Dias: maybe"');
    expect(html).toContain(acceptedReadOnlyText("Ana Lopes"));
    expect(acceptedReadOnlyText("Ana Lopes")).toContain("Title, time and place are read only");
    expect(acceptedReadOnlyText("Ana Lopes")).toContain("To-dos and notes are shared");
  });

  it("offers Mark done once the event has started, and Reopen when the user marked it done", () => {
    expect(render(details())).not.toContain("Mark done");
    const during = Date.parse("2026-11-20T11:30:00Z");
    expect(render(details(), { now: during })).toContain("Mark done");
    const done = render(details({ done: true }), { now: during });
    expect(done).toContain("Reopen");
    expect(done).toContain("Done for you");
  });

  it("an all-day invitation has no goal and no route, only the place as text", () => {
    const allDay = { ...invited, allDay: true, firstDay: "2026-11-20", lastDay: "2026-11-21" } as unknown as InvitedEvent;
    const html = render(details({ allDay: true, firstDay: "2026-11-20", lastDay: "2026-11-21", goalId: null } as Partial<AcceptedInviteDetails>), { event: allDay });
    expect(html).not.toContain('aria-label="Goal"');
    expect(html).not.toContain("From:");
    expect(html).toContain(">Library, room 4</p>");
  });

  it("while it is read, shows the title from the calendar and a quiet line", () => {
    const html = render(null);
    expect(html).toContain(">Group project meeting</p>");
    expect(html).toContain("Loading the event…");
    expect(html).not.toContain('aria-label="Notes"');
  });

  it("typed notes show Save notes and Discard; notes changed meanwhile show the message and Reload", () => {
    expect(render(details(), { notes: notes({ value: "New", changed: true }) })).toContain("Save notes");
    const stale = render(details(), { notes: notes({ error: { text: "The notes were changed meanwhile. Reload to see the latest version", stale: true } }) });
    expect(stale).toContain("The notes were changed meanwhile");
    expect(stale).toContain(">Reload</button>");
  });

  it("renders other people's words as text only", () => {
    const html = render(details({ title: "<img src=x onerror=alert(1)>", notes: "<script>x</script>", todos: [{ id: "t", title: "<b>bold</b>", done: false }] }));
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>bold");
  });
});

describe("which card opens", () => {
  it("only an accepted invitation opens the full card; maybe, declined and no answer keep the small one", () => {
    expect(showsFullCard("accepted")).toBe(true);
    expect(showsFullCard("tentative")).toBe(false);
    expect(showsFullCard("declined")).toBe(false);
    expect(showsFullCard("pending")).toBe(false);
  });
});

describe("the route of an accepted invitation", () => {
  it("asks the invitation's own travel answer", () => {
    expect(travelUrl("i1", undefined, "/api/invites/i1/travel")).toBe("/api/invites/i1/travel");
    expect(new URL(travelUrl("i1", { location: "x", mode: "cycling", from: null }, "/api/invites/i1/travel"), "http://x").pathname).toBe("/api/invites/i1/travel");
  });

  it("RouteSection without toReadOnly keeps the To picker", () => {
    const html = renderToStaticMarkup(
      <SavedPlacesProvider places={[]} home="" travelMode="driving">
        <RouteSection from={null} onFrom={noop} mode={null} onMode={noop} location="Library" onLocation={noop} />
      </SavedPlacesProvider>,
    );
    expect(html).toMatch(/aria-label="To: Library" aria-expanded="false"/);
  });
});
