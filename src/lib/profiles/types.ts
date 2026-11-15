// What the server sends to the profile page, the row "Your profile" in Settings and the sidebar
// (spec 40). Only ever the signed-in user's own profile.

/** The signed-in user's own profile, as Settings shows it. */
export type OwnProfile = {
  userId: string;
  /** Empty until set. */
  displayName: string | null;
  /** The name shown: the display name or the part of the address before the "@". */
  name: string;
  email: string;
  photoUrl: string | null;
};

/** The user's whole profile, as the profile page shows it. The time zone is the one in their settings. */
export type ProfileCardData = OwnProfile & {
  bio: string | null;
  /** Only ever https://www.linkedin.com/in/<name>; checked again when it is read. */
  linkedinUrl: string | null;
  timeZone: string;
};

/** The signed-in user as the sidebar shows them: the shown name and the photo. */
export type SidebarMe = { name: string; photoUrl: string | null };
