// Event invitations inside the app (spec 54, ported from spec 36; ontology R59 to R64): what the server
// hands out and the small pure rules the screens share. Only these shapes ever leave the owner's event
// row: for an invited person the title, the times or days, the place, who invited them and the other
// people's names, photos and answers. Never notes, to-dos, the goal, guests by e-mail, travel mode,
// updated_at, an e-mail address or any id other than the invitation's own (the people's user ids are
// there for their avatars and profile links, as everywhere else in the app).

export type InviteAnswer = "pending" | "accepted" | "tentative" | "declined";
export const INVITE_ANSWERS: readonly InviteAnswer[] = ["pending", "accepted", "tentative", "declined"];
/** What an invited person can answer (pending is only the start). */
export type GivenAnswer = Exclude<InviteAnswer, "pending">;
export const GIVEN_ANSWERS: readonly GivenAnswer[] = ["accepted", "tentative", "declined"];

/**
 * Someone shown by name and photo. The photo is set only for the user's own contacts (R43). `userId` is
 * the person's id for the user's own contacts; for a co-invited person who is not a contact it is only a
 * key for the list ("invited-1"), never their id (src/lib/server/invites/read.ts).
 */
export type InvitePersonCard = { userId: string; name: string; photoUrl: string | null };

/** One invited person of an event, with their answer. */
export type InvitePerson = InvitePersonCard & { answer: InviteAnswer };

/** An event the user is invited to, in the reduced shape of R60. */
type InvitedCommon = {
  /** The invitation's own id: the only id of this event that ever reaches the invited person. */
  inviteId: string;
  answer: InviteAnswer;
  inviter: InvitePersonCard;
  title: string;
  location: string | null;
};
export type InvitedTimed = InvitedCommon & { allDay: false; startAt: string; endAt: string };
export type InvitedAllDay = InvitedCommon & { allDay: true; firstDay: string; lastDay: string };
export type InvitedEvent = InvitedTimed | InvitedAllDay;

/** A contact the owner can invite (the contact row's id, which the invitation action takes). Never an address. */
export type InviteContact = { contactId: string; userId: string; name: string; photoUrl: string | null };

/** What the calendar page gets about invitations, in its one transaction. */
export type CalendarInvites = {
  /** The events of the shown days the user is invited to (declined ones too: the grid leaves them out). */
  invited: InvitedEvent[];
  /** Invitations still to look at (not answered, or declined), of events that have not ended. */
  open: InvitedEvent[];
  /** How many are not answered yet (the badge and the toolbar button). */
  pending: number;
  /** For the user's own shown events: the invited people with their answers, by event id. */
  own: Record<string, InvitePerson[]>;
  /** The user's real contacts, for the editor's list. */
  contacts: InviteContact[];
};

export const NO_INVITES: CalendarInvites = { invited: [], open: [], pending: 0, own: {}, contacts: [] };

/** The keys an answer may have, at most. The tests fail when another appears (S2). */
export const INVITED_EVENT_KEYS = ["inviteId", "answer", "inviter", "title", "location", "allDay", "startAt", "endAt", "firstDay", "lastDay"] as const;
export const INVITE_PERSON_CARD_KEYS = ["userId", "name", "photoUrl"] as const;
export const INVITE_PERSON_KEYS = [...INVITE_PERSON_CARD_KEYS, "answer"] as const;
export const INVITE_CONTACT_KEYS = ["contactId", "userId", "name", "photoUrl"] as const;

/** At most this many people per event (R59). */
export const MAX_INVITEES = 20;

/** The answer in words, as each mark's accessible name says it. */
export function answerWords(answer: InviteAnswer): string {
  switch (answer) {
    case "accepted":
      return "accepted";
    case "declined":
      return "declined";
    case "tentative":
      return "maybe";
    default:
      return "no answer yet";
  }
}

/** "Emily Lea: accepted". */
export function personAnswerLabel(name: string, answer: InviteAnswer): string {
  return `${name}: ${answerWords(answer)}`;
}

/** "2 invited: Emily Lea accepted, Ben no answer yet", for a block's accessible name. */
export function inviteesSummary(people: readonly InvitePerson[]): string {
  if (people.length === 0) return "";
  return `${people.length} invited: ${people.map((p) => `${p.name} ${answerWords(p.answer)}`).join(", ")}`;
}

/** How an invited event looks in the invited person's grid (R61); null: not drawn (declined). */
export type InviteLook = "dashed" | "tentative" | "solid";
export function inviteLook(answer: InviteAnswer): InviteLook | null {
  if (answer === "declined") return null;
  if (answer === "accepted") return "solid";
  if (answer === "tentative") return "tentative";
  return "dashed";
}

/**
 * The class names of an invited block, chip or month row (decided 19 Nov 2026, no stripes anywhere):
 * no answer yet white with a dashed border in ink; maybe the same with lighter text; accepted solid,
 * like one of the viewer's own events without a goal. Declined ones are never drawn.
 */
export function inviteClass(answer: InviteAnswer): string {
  const look = inviteLook(answer);
  if (look === "solid") return "bg-raised border border-line-subtle text-ink";
  if (look === "tentative") return "bg-surface border border-dashed border-ink-3 text-ink-3";
  return "bg-surface border border-dashed border-ink-3 text-ink";
}

/** The quiet confirmation after answering. */
export function answeredText(answer: GivenAnswer): string {
  return answer === "accepted" ? "You accepted." : answer === "tentative" ? "You answered maybe." : "You declined.";
}

/**
 * Whether an invited event has ended at `now`, on the viewer's clock: a timed event at its end, an
 * all-day event after its last day. Then only "Decline" is offered (spec 64): it takes the event out of
 * the calendar. The database decides for itself (by the owner's time zone for all-day events), so a
 * difference of a day only changes which buttons are shown, never what is saved.
 */
export function invitedEventEnded(event: { allDay: false; endAt: string } | { allDay: true; lastDay: string }, now: number, timeZone: string): boolean {
  if (!event.allDay) return Date.parse(event.endAt) <= now;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return event.lastDay < today;
}

/** The three buttons' words. */
export const ANSWER_BUTTONS: readonly { answer: GivenAnswer; label: string }[] = [
  { answer: "accepted", label: "Accept" },
  { answer: "tentative", label: "Maybe" },
  { answer: "declined", label: "Decline" },
];

/** "2 invitations" on the toolbar's button. */
export function invitationsText(count: number): string {
  return count === 1 ? "1 invitation" : `${count} invitations`;
}

/**
 * Why the owner cannot invite people to this event (R59), or null when they can. `ended` is decided by
 * whole days on the screen (the server decides for the exact moment, with its own sentence). Since spec
 * 65 an event of a series can invite people too.
 */
export function inviteBlockedReason(event: { source: string; demo?: boolean; seriesId: string | null }, ended: boolean): string | null {
  if (event.source === "outlook") return "Outlook events cannot invite people";
  if (event.demo) return "Demo events cannot invite people";
  if (ended) return "This event has ended";
  return null;
}

/** Whether two lists of chosen contacts hold the same members (the editor's Save shows when not). */
export function sameInvitees(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

// ---------- Spec 55: an accepted invitation, almost like an own event (R65 to R67) ----------
// A NEW shape beside InvitedEvent (which stays exactly as R60 says, for the calendar's blocks and the
// small card of an invitation not accepted). It is read only for the caller's own accepted invitation
// (`read_accepted_invite_details`): the owner's title, times or days, place and notes, the to-dos the
// owner and everyone who accepted share, and the invited person's OWN goal, way of getting there, start
// of the trip and done mark. Never the event's id, the owner's goal, travel mode, start or status,
// guests by e-mail, the source, the series or updated_at.

/** A to-do of the shared list: its id (to change it), title and whether it is done. */
export type SharedTodo = { id: string; title: string; done: boolean };

/** The invited person's own way of getting there (R27); null is the standard from their settings. */
export type InviteTravelMode = "driving" | "cycling" | "walking" | "transit";

type AcceptedCommon = {
  inviteId: string;
  answer: "accepted";
  inviter: InvitePersonCard;
  title: string;
  location: string | null;
  /** The event's notes, shared with the owner and the others who accepted; null when there are none. */
  notes: string | null;
  todos: SharedTodo[];
  /** One of the invited person's own goals, or null (an all-day event has none, R29). */
  goalId: string | null;
  travelMode: InviteTravelMode | null;
  /** Where the invited person's trip starts, as stored (src/lib/places/saved.ts); null is the standard. */
  travelFrom: string | null;
  /** The invited person marked it done for themselves (it then counts for their goal, R8). */
  done: boolean;
};
export type AcceptedTimed = AcceptedCommon & { allDay: false; startAt: string; endAt: string };
export type AcceptedAllDay = AcceptedCommon & { allDay: true; firstDay: string; lastDay: string };
export type AcceptedInviteDetails = AcceptedTimed | AcceptedAllDay;

/** The keys the details may have, at most (S2 for spec 55). The tests fail when another appears. */
export const ACCEPTED_INVITE_KEYS = [
  "inviteId",
  "answer",
  "inviter",
  "title",
  "location",
  "notes",
  "todos",
  "goalId",
  "travelMode",
  "travelFrom",
  "done",
  "allDay",
  "startAt",
  "endAt",
  "firstDay",
  "lastDay",
] as const;
export const SHARED_TODO_KEYS = ["id", "title", "done"] as const;

/** Whether the full card of an accepted invitation shows: only "accepted"; maybe, declined and no answer keep the small card. */
export function showsFullCard(answer: InviteAnswer): boolean {
  return answer === "accepted";
}

/** The line at the bottom of the full card: what is read only, what is shared, what is the user's own (spec 55). */
export function acceptedReadOnlyText(inviterName: string): string {
  return `Title, time and place are read only: only ${inviterName} can change them. To-dos and notes are shared with ${inviterName} and everyone who accepted. Your goal and route are only yours. Not sent to your Outlook.`;
}
