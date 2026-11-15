// What the server sends to the lists pages (spec 30). Other people appear only with a name and a photo
// address, never with an e-mail address (R55); the owner's own contacts, for "Share",
// are named the way the People page names them (the part of the address before the "@" without a
// display name), and their addresses are not sent either.

export const MAX_LIST_TITLE = 60;
export const MAX_ENTRY_TITLE = 200;
export const MAX_LISTS = 20;
export const MAX_MEMBERS = 20;
export const MAX_ENTRIES = 200;

/** Someone of a list: its owner or a member. */
export type ListPerson = {
  userId: string;
  /** Their display name; for the user and their contacts without one, the part of the address before the "@"; else "Member". */
  name: string;
  /** The photo's address on our site, or null for the initials. */
  photoUrl: string | null;
  isOwner: boolean;
  /** The signed-in user. */
  isMe: boolean;
};

/** An entry of a list. `addedBy` and `doneBy` are user ids of people still in the list, else null. */
export type ListEntry = {
  id: string;
  title: string;
  done: boolean;
  /** Its place in the list, from 0. */
  position: number;
  /** For R4: sent back with every change of the entry. */
  updatedAt: string;
  addedBy: string | null;
  doneBy: string | null;
};

/** One list on the overview. */
export type ListSummary = {
  id: string;
  title: string;
  isOwner: boolean;
  ownerName: string;
  openCount: number;
  /** The owner first, then the members. */
  people: ListPerson[];
};

/** One list with everything in it. */
export type ListDetail = {
  id: string;
  title: string;
  /** For R4 when the owner renames it. */
  updatedAt: string;
  isOwner: boolean;
  people: ListPerson[];
  entries: ListEntry[];
};

/** One of the owner's own contacts, for the "Share" panel. */
export type ShareContact = {
  /** The contact row's id: what add_list_member takes. */
  contactId: string;
  userId: string;
  name: string;
  photoUrl: string | null;
};

export type ListPageData = {
  list: ListDetail;
  /** The owner's contacts; empty for a member. */
  contacts: ShareContact[];
};
