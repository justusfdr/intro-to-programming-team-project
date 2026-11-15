import "server-only";

// Reading the signed-in user's own profile (spec 40): for the profile page, the row "Your profile" in
// Settings and the sidebar. Everything comes from app.profile_card, asked for the signed-in user's own
// id (auth.uid() inside the database), so this reader cannot be pointed at anyone else (R43).
import type { Query } from "@/lib/server/db";
import { shownName } from "@/lib/profiles/display-name";
import { isLinkedInUrl } from "@/lib/profiles/linkedin";
import type { OwnProfile, ProfileCardData } from "@/lib/profiles/types";

type CardRow = {
  user_id: string;
  display_name: string | null;
  bio: string | null;
  linkedin_url: string | null;
  time_zone: string;
  photo_at: Date | string | null;
  email: string | null;
};

/** The address of the user's photo. The time makes a new photo a new address, so caches never show an old one. */
export function photoUrlOf(userId: string, photoAt: Date | string | null): string | null {
  return photoAt === null ? null : `/api/profiles/${userId}/photo?v=${new Date(photoAt).getTime()}`;
}

/** The signed-in user's whole profile; their time zone is the one in their settings. */
export async function readOwnCard(query: Query): Promise<ProfileCardData> {
  const [row] = await query<CardRow>(
    "select user_id, display_name, bio, linkedin_url, time_zone, photo_at, email from app.profile_card((select auth.uid()))",
  );
  if (!row || row.email === null) throw new Error("The signed-in user has no profile.");
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

/** Only what Settings and the sidebar show: id, name, address and photo. */
export async function readOwnProfile(query: Query): Promise<OwnProfile> {
  const card = await readOwnCard(query);
  return { userId: card.userId, displayName: card.displayName, name: card.name, email: card.email, photoUrl: card.photoUrl };
}
