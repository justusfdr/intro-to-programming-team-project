// What the server sends to the People page and the settings' Profile card (spec 28).

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
