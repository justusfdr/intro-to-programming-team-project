// What the server sends to the People page and the settings (spec 28) and to the profile pages (spec 31).

/** Another user as the signed-in user may see them: a contact, or someone who invited them. */
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

/** An invitation the user sent: only the address they typed and the date (R44). */
export type SentInvitation = { id: string; email: string; sentAt: string };

/** The signed-in user's own profile. */
export type OwnProfile = {
  userId: string;
  /** Empty until set. */
  displayName: string | null;
  /** The name shown: the display name or the part of the address before the "@". */
  name: string;
  email: string;
  photoUrl: string | null;
};

export type PeopleData = {
  me: OwnProfile;
  contacts: PersonCard[];
  received: PersonCard[];
  sent: SentInvitation[];
};

/**
 * One person's whole card (spec 31): the signed-in user's own, a contact's, or that of someone who invited
 * them (R43). The time zone is the person's own, from their settings.
 */
export type ProfileCardData = {
  userId: string;
  /** Empty until set. */
  displayName: string | null;
  /** The name shown: the display name or the part of the address before the "@". */
  name: string;
  email: string;
  photoUrl: string | null;
  bio: string | null;
  /** Only ever https://www.linkedin.com/in/<slug>; checked again when it is read. */
  linkedinUrl: string | null;
  timeZone: string;
};

/** The signed-in user as the sidebar shows them (spec 31): the shown name and the photo. */
export type SidebarMe = { name: string; photoUrl: string | null };

/**
 * How a demo contact (spec 32) is drawn instead of a photo: their initials on their own colour. Only the
 * fixed people in src/lib/demo/people.ts have one; real people have a photo or the plain initials.
 */
export type AvatarLook = { initials: string; color: string };
