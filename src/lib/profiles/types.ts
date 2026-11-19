// What the server sends to the profile page, the row "Your profile" in Settings and the sidebar
// (spec 40), and to the People page and another person's page (spec 53).

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

/** Another user as the signed-in user may see them: a contact, or someone who invited them (spec 53). */
export type PersonCard = {
  /** The contact row's id (for "Remove") or the invitation's id (for "Accept" and "Decline"). */
  id: string;
  /** The person's user id. */
  userId: string;
  /** Their display name, or the part of their address before the "@". */
  name: string;
  email: string;
  /** The photo's address on our site, or null for the initials. */
  photoUrl: string | null;
  /** When they became contacts, or when the invitation was sent (ISO). */
  since: string;
};

/** An invitation the user sent: only the address they typed and the date (R52). */
export type SentInvitation = { id: string; email: string; sentAt: string };

export type PeopleData = {
  me: OwnProfile;
  contacts: PersonCard[];
  received: PersonCard[];
  sent: SentInvitation[];
};

/**
 * What the People page's cards show of a person beyond the contact list: the first line of the bio and
 * the time zone (for the local time). Read through app.profile_card, so only for people the user may see
 * (R43).
 */
export type PersonFacts = { userId: string; bio: string | null; timeZone: string };
