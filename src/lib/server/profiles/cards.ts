import "server-only";

// Reading what the signed-in user may see of people (spec 28): their own profile, their contacts, the
// open invitations to them (with the inviter's card) and the invitations they sent (address and date
// only). Everything comes from app.contact_cards(), which checks the relations in the database (R43).
import type { Query } from "@/lib/server/db";
import { shownName } from "@/lib/profiles/display-name";
import type { OwnProfile, PeopleData, PersonCard } from "@/lib/profiles/types";

type CardRow = {
  kind: "self" | "contact" | "received" | "sent";
  id: string | null;
  user_id: string | null;
  display_name: string | null;
  email: string;
  photo_at: Date | string | null;
  created_at: Date | string | null;
};

const iso = (value: Date | string | null): string => (value === null ? "" : new Date(value).toISOString());

/** The address of a user's photo. The time makes a new photo a new address, so caches never show an old one. */
export function photoUrlOf(userId: string, photoAt: Date | string | null): string | null {
  return photoAt === null ? null : `/api/profiles/${userId}/photo?v=${new Date(photoAt).getTime()}`;
}

function ownProfile(row: CardRow | undefined): OwnProfile {
  if (!row || !row.user_id) throw new Error("The signed-in user has no profile.");
  return {
    userId: row.user_id,
    displayName: row.display_name,
    name: shownName(row.display_name, row.email),
    email: row.email,
    photoUrl: photoUrlOf(row.user_id, row.photo_at),
  };
}

function personCard(row: CardRow): PersonCard {
  return {
    id: row.id!,
    userId: row.user_id!,
    name: shownName(row.display_name, row.email),
    email: row.email,
    photoUrl: photoUrlOf(row.user_id!, row.photo_at),
    since: iso(row.created_at),
  };
}

const CARDS = "select kind, id, user_id, display_name, email, photo_at, created_at from app.contact_cards()";

/** Everything for the People page. Contacts by name; invitations newest first. */
export async function readPeople(query: Query): Promise<PeopleData> {
  const rows = await query<CardRow>(CARDS);
  const byName = (a: PersonCard, b: PersonCard) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email);
  return {
    me: ownProfile(rows.find((r) => r.kind === "self")),
    contacts: rows.filter((r) => r.kind === "contact").map(personCard).sort(byName),
    received: rows
      .filter((r) => r.kind === "received")
      .map(personCard)
      .sort((a, b) => b.since.localeCompare(a.since)),
    sent: rows
      .filter((r) => r.kind === "sent")
      .map((r) => ({ id: r.id!, email: r.email, sentAt: iso(r.created_at) }))
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt)),
  };
}

/** Only the signed-in user's own profile (the settings' Profile card). */
export async function readOwnProfile(query: Query): Promise<OwnProfile> {
  const rows = await query<CardRow>(`${CARDS} where kind = 'self'`);
  return ownProfile(rows[0]);
}

/** The number of open invitations to the signed-in user (the badge on "People"). */
export async function readInvitationCount(query: Query): Promise<number> {
  const [row] = await query<{ count: number }>("select app.received_invitation_count() as count");
  return Number(row?.count ?? 0);
}
