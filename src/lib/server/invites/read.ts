import "server-only";

// Reading event invitations (spec 54, ported from spec 36). Everything comes from the database functions
// of 20261210000000_event_invites.sql, which check the caller themselves (owner or invited person) and
// return only the reduced shape (R60). This module renames the columns, adds names and photos and keeps
// to the allow-lists of src/lib/invites/types.ts. It is the only module that names these functions (a
// test checks it, S7).
//
// Names and photos: the user's own contacts by their contact card (name and photo, R43); anyone else
// (a co-invited person who is not a contact) by app.invite_person_names, which gives a display name
// and never an e-mail address, and WITHOUT a photo address: the photo route serves a photo only when
// app.profile_card gives a row (R43), so such a person shows their initials (S4).
// Other people's titles, places and names are cleaned of hidden characters, as shared titles are (S6).
import type { Query } from "@/lib/server/db";
import { readPeople } from "@/lib/server/profiles/cards";
import type { PersonCard } from "@/lib/profiles/types";
import { stripHiddenCharacters } from "@/lib/text/shown-text";
import type { InviteAnswer, InviteContact, InvitedEvent, InvitePerson, InvitePersonCard } from "@/lib/invites/types";

export type InvitedRow = {
  invite_id: string;
  answer: InviteAnswer;
  owner_id: string;
  title: string;
  all_day: boolean;
  start_at: Date | string | null;
  end_at: Date | string | null;
  first_day: string | null;
  last_day: string | null;
  location: string | null;
};

const INVITED_COLUMNS =
  "invite_id, answer, owner_id, title, all_day, start_at, end_at, first_day::text as first_day, last_day::text as last_day, location";

const iso = (value: Date | string) => new Date(value).toISOString();

/** Shown when a person's name cannot be read (they are not someone the user may see any more). */
export const UNKNOWN_PERSON = "Invited person";

/** A person by id from a list of cards, or a nameless card (initials "I") when they are not in it. */
function cardFrom(cards: ReadonlyMap<string, InvitePersonCard>, userId: string): InvitePersonCard {
  return cards.get(userId) ?? { userId, name: UNKNOWN_PERSON, photoUrl: null };
}

function invitedOf(row: InvitedRow, cards: ReadonlyMap<string, InvitePersonCard>): InvitedEvent {
  const common = {
    inviteId: row.invite_id,
    answer: row.answer,
    inviter: cardFrom(cards, row.owner_id),
    title: stripHiddenCharacters(row.title),
    location: row.location === null ? null : stripHiddenCharacters(row.location),
  };
  return row.all_day
    ? { ...common, allDay: true, firstDay: row.first_day!, lastDay: row.last_day! }
    : { ...common, allDay: false, startAt: iso(row.start_at!), endAt: iso(row.end_at!) };
}

/** The user's contacts as cards by user id (the inviter of an invitation is always a contact, R59). */
export function cardsOfContacts(contacts: readonly PersonCard[]): Map<string, InvitePersonCard> {
  return new Map(contacts.map((c) => [c.userId, { userId: c.userId, name: stripHiddenCharacters(c.name), photoUrl: c.photoUrl }]));
}

/** The contacts for the editor's list: the contact row, name and photo; never the address. */
export function inviteContactsOf(contacts: readonly PersonCard[]): InviteContact[] {
  return contacts.map((c) => ({ contactId: c.id, userId: c.userId, name: stripHiddenCharacters(c.name), photoUrl: c.photoUrl }));
}

/** No calendar shows more invited events than this in one window (security review, 19 Nov 2026). */
export const MAX_INVITED_EVENTS = 500;

/**
 * The events between `from` and `to` (at most 62 days) the user is invited to. The database refuses a
 * longer window. At most MAX_INVITED_EVENTS, the earliest first (the function's own order): a contact who
 * invites to thousands of events cannot make the invited person's calendar page huge and slow.
 */
export async function readInvitedEvents(query: Query, from: Date, to: Date, cards: ReadonlyMap<string, InvitePersonCard>): Promise<InvitedEvent[]> {
  const rows = await query<InvitedRow>(`select ${INVITED_COLUMNS} from app.invited_events($1::timestamptz, $2::timestamptz) limit ${MAX_INVITED_EVENTS}`, [
    from.toISOString(),
    to.toISOString(),
  ]);
  return rows.map((row) => invitedOf(row, cards));
}

/** The raw rows of the open invitations (no parameters, so it can be started first). */
export function readOpenInviteRows(query: Query): Promise<InvitedRow[]> {
  return query<InvitedRow>(`select ${INVITED_COLUMNS} from app.open_event_invites()`);
}

export function openInvitesOf(rows: readonly InvitedRow[], cards: ReadonlyMap<string, InvitePersonCard>): InvitedEvent[] {
  return rows.map((row) => invitedOf(row, cards));
}

/** How many invitations the user has not answered yet (the badge). */
export async function readPendingInviteCount(query: Query): Promise<number> {
  const [row] = await query<{ count: number }>("select app.pending_invite_count() as count");
  return Number(row?.count ?? 0);
}

/** For the owner's shown events: the invited people with their answers, by event id. */
export async function readOwnInvitees(query: Query, eventIds: readonly string[], cards: ReadonlyMap<string, InvitePersonCard>): Promise<Record<string, InvitePerson[]>> {
  if (eventIds.length === 0) return {};
  const rows = await query<{ event_id: string; user_id: string; answer: InviteAnswer }>(
    "select event_id, user_id, answer from app.own_event_invitees($1::uuid[])",
    [[...eventIds]],
  );
  const byEvent: Record<string, InvitePerson[]> = {};
  for (const row of rows) (byEvent[row.event_id] ??= []).push({ ...cardFrom(cards, row.user_id), answer: row.answer });
  return byEvent;
}

type NameRow = { user_id: string; display_name: string | null; fallback_name: string | null };

/**
 * Cards of these people as the user may see them: a contact's card (name and photo), anyone else's
 * display name from app.invite_person_names and no photo (S4).
 */
async function readCards(query: Query, userIds: readonly string[]): Promise<{ cards: Map<string, InvitePersonCard>; contacts: ReadonlySet<string> }> {
  if (userIds.length === 0) return { cards: new Map(), contacts: new Set() };
  // Without parameters, so started first (see src/lib/server/pages/load.ts).
  const peopleRead = readPeople(query);
  const rows = await query<NameRow>("select user_id, display_name, fallback_name from app.invite_person_names($1::uuid[])", [[...userIds]]);
  const contacts = cardsOfContacts((await peopleRead).contacts);
  const cards = new Map(
    rows.map((r) => [
      r.user_id,
      contacts.get(r.user_id) ?? { userId: r.user_id, name: stripHiddenCharacters(r.display_name ?? r.fallback_name ?? UNKNOWN_PERSON), photoUrl: null },
    ]),
  );
  return { cards, contacts: new Set(contacts.keys()) };
}

/** The owner: the people of one of their events. The database refuses with "Not found" otherwise. */
export async function readEventInvitees(query: Query, eventId: string): Promise<InvitePerson[]> {
  const rows = await query<{ user_id: string; answer: InviteAnswer }>("select user_id, answer from app.event_invitees($1::uuid)", [eventId]);
  const { cards } = await readCards(query, rows.map((r) => r.user_id));
  return rows.map((r) => ({ ...cardFrom(cards, r.user_id), answer: r.answer }));
}

/**
 * The invited person: the other people of their invitation. The database refuses with "Not found" otherwise.
 * A person who is not one of the viewer's own contacts comes WITHOUT their user id (security review,
 * 19 Nov 2026): the screen needs only a key for its list, so "invited-1", "invited-2", … stand in for it.
 * The viewer's contacts keep their id (the viewer has it anyway, R43).
 */
export async function readInvitePeople(query: Query, inviteId: string): Promise<InvitePerson[]> {
  const rows = await query<{ user_id: string; answer: InviteAnswer }>("select user_id, answer from app.invite_people($1::uuid)", [inviteId]);
  const { cards, contacts } = await readCards(query, rows.map((r) => r.user_id));
  return rows.map((r, i) => {
    const card = cardFrom(cards, r.user_id);
    return { ...(contacts.has(r.user_id) ? card : { ...card, userId: `invited-${i + 1}` }), answer: r.answer };
  });
}
