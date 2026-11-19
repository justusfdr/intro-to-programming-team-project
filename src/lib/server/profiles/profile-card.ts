import "server-only";

// Reading one person's whole card (spec 53, from spec 31): the signed-in user's own, a contact's, or that of someone
// whose invitation to them is open. Everything comes from app.profile_card, which checks the relation in
// the database (R43) and gives no row in every other case.
import type { Query } from "@/lib/server/db";
import { shownName } from "@/lib/profiles/display-name";
import { isLinkedInUrl } from "@/lib/profiles/linkedin";
import type { ProfileCardData } from "@/lib/profiles/types";
import { photoUrlOf } from "./own-profile";

type CardRow = {
  user_id: string;
  display_name: string | null;
  bio: string | null;
  linkedin_url: string | null;
  time_zone: string;
  photo_at: Date | string | null;
  email: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether an id has the form of a user id (anything else is "Not found" without asking the database). */
export const isUserId = (id: string): boolean => UUID.test(id);

/** The card of `userId` as the signed-in user may see it, or null (not allowed, no such user, malformed id). */
export async function readProfileCard(query: Query, userId: string): Promise<ProfileCardData | null> {
  if (!isUserId(userId)) return null;
  const [row] = await query<CardRow>(
    "select user_id, display_name, bio, linkedin_url, time_zone, photo_at, email from app.profile_card($1::uuid)",
    [userId],
  );
  // The address comes with every row the function gives; a row without one is not shown at all.
  if (!row || row.email === null) return null;
  return cardOf(row as ShownRow);
}

/**
 * The cards of several people at once (the People page's cards), in one
 * question: app.profile_card for each id, so the database checks R43 for every one of them and gives
 * nothing for anyone the user may not see. Malformed ids are left out before asking.
 */
export async function readProfileCards(query: Query, userIds: readonly string[]): Promise<ProfileCardData[]> {
  const ids = [...new Set(userIds.filter(isUserId))];
  if (ids.length === 0) return [];
  const rows = await query<CardRow>(
    `select c.user_id, c.display_name, c.bio, c.linkedin_url, c.time_zone, c.photo_at, c.email
       from unnest($1::text[]) as wanted(id), lateral app.profile_card(wanted.id::uuid) c`,
    [ids],
  );
  return rows.filter((row): row is ShownRow => row.email !== null).map(cardOf);
}

/** A row with its address (every row app.profile_card gives has one). */
type ShownRow = CardRow & { email: string };

function cardOf(row: ShownRow): ProfileCardData {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    name: shownName(row.display_name, row.email),
    email: row.email,
    photoUrl: photoUrlOf(row.user_id, row.photo_at),
    bio: row.bio,
    // The database allows nothing else; checked once more before it can reach a page.
    linkedinUrl: isLinkedInUrl(row.linkedin_url) ? row.linkedin_url : null,
    timeZone: row.time_zone,
  };
}
