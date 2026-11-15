// Event invitations inside the app (spec 36, ontology R59 to R64): what the server hands out and the
// small pure rules the screens share. Only these shapes ever leave the owner's event row: for an invited
// person the title, the times or days, the place, who invited them and the other people's names,
// photos and answers. Never notes, to-dos, the goal, guests by e-mail, travel mode, updated_at, or any
// id other than the invitation's own (the people's user ids are there for their avatars and profile
// links, as everywhere else in the app).
import type { AvatarLook } from "@/lib/profiles/types";

export type InviteAnswer = "pending" | "accepted" | "tentative" | "declined";
export const INVITE_ANSWERS: readonly InviteAnswer[] = ["pending", "accepted", "tentative", "declined"];
/** What an invited person can answer (pending is only the start). */
export type GivenAnswer = Exclude<InviteAnswer, "pending">;
export const GIVEN_ANSWERS: readonly GivenAnswer[] = ["accepted", "tentative", "declined"];

/** Someone shown by name and photo (a demo contact by its initials and colour instead). */
export type InvitePersonCard = { userId: string; name: string; photoUrl: string | null; demo?: AvatarLook };

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
  /** Only for the made-up invitation from the demo contact Lea (answered in this browser only). */
  demo?: true;
};
export type InvitedTimed = InvitedCommon & { allDay: false; startAt: string; endAt: string };
export type InvitedAllDay = InvitedCommon & { allDay: true; firstDay: string; lastDay: string };
export type InvitedEvent = InvitedTimed | InvitedAllDay;

/** A contact the owner can invite (the contact row's id, for set_event_invites). Never an address. */
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
  /** The user's real contacts, for the editor's picker. */
  contacts: InviteContact[];
};

/** The keys an answer may have, at most. The tests fail when another appears. */
export const INVITED_EVENT_KEYS = ["inviteId", "answer", "inviter", "title", "location", "allDay", "startAt", "endAt", "firstDay", "lastDay", "demo"] as const;
export const INVITE_PERSON_CARD_KEYS = ["userId", "name", "photoUrl", "demo"] as const;
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

/** The quiet confirmation after answering. */
export function answeredText(answer: GivenAnswer): string {
  return answer === "accepted" ? "You accepted." : answer === "tentative" ? "You answered maybe." : "You declined.";
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
 * whole days on the screen (the server decides for the exact moment, with the same sentence).
 */
export function inviteBlockedReason(event: { source: string; demo?: boolean; seriesId: string | null }, ended: boolean): string | null {
  if (event.source === "outlook") return "Outlook events cannot invite people";
  if (event.demo) return "Demo events cannot invite people";
  if (event.seriesId) return "Events of a series cannot invite people";
  if (ended) return "This event has ended";
  return null;
}

/** Whether the chosen contacts differ from those invited now (the editor's Save shows then). */
export function sameInvitees(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/** Whether the invitations button shows: pending ones, or declined ones of events that have not ended. */
export function showInvitationsButton(open: readonly InvitedEvent[]): boolean {
  return open.length > 0;
}
