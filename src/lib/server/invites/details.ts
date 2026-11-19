import "server-only";

// Reading an accepted invitation (spec 55; ontology R65 to R67). Everything comes from the database
// functions of 20261220000000_accepted_invite_details.sql, which find only the caller's own ACCEPTED
// invitation and return only its reduced shape; anything else is "Not found". This module renames the
// columns, adds the inviter's name and photo (always one of the user's contacts, R59) and keeps to the
// allow-lists of src/lib/invites/types.ts (ACCEPTED_INVITE_KEYS, SHARED_TODO_KEYS). It is the only
// module that names the reading functions (src/lib/server/invites/details-hygiene.test.ts).
// Other people's words (title, place, notes, to-dos) are cleaned of hidden characters, as the titles of
// invitations are.
import type { Query } from "@/lib/server/db";
import { readPeople } from "@/lib/server/profiles/cards";
import { stripHiddenCharacters } from "@/lib/text/shown-text";
import type { AcceptedInviteDetails, InviteTravelMode, SharedTodo } from "@/lib/invites/types";
import { cardsOfContacts, UNKNOWN_PERSON } from "./read";

type DetailsRow = {
  invite_id: string;
  owner_id: string;
  title: string;
  all_day: boolean;
  start_at: Date | string | null;
  end_at: Date | string | null;
  first_day: string | null;
  last_day: string | null;
  location: string | null;
  notes: string | null;
  goal_id: string | null;
  travel_mode: InviteTravelMode | null;
  travel_from: string | null;
  status: "planned" | "done";
};

const DETAILS_COLUMNS =
  "invite_id, owner_id, title, all_day, start_at, end_at, first_day::text as first_day, last_day::text as last_day, location, notes, goal_id, travel_mode, travel_from, status";

const iso = (value: Date | string) => new Date(value).toISOString();

/** The shared to-dos of the user's accepted invitation, in their order. "Not found" otherwise. */
export async function readSharedTodos(query: Query, inviteId: string): Promise<SharedTodo[]> {
  const rows = await query<{ id: string; title: string; done: boolean }>("select id, title, done from app.accepted_invite_todos($1::uuid)", [inviteId]);
  return rows.map((r) => ({ id: r.id, title: stripHiddenCharacters(r.title), done: r.done }));
}

/** The event's raw times and place as the invited person may see them, for the travel time. "Not found" otherwise. */
export async function readAcceptedRow(query: Query, inviteId: string): Promise<DetailsRow> {
  const [row] = await query<DetailsRow>(`select ${DETAILS_COLUMNS} from app.accepted_invite_details($1::uuid)`, [inviteId]);
  // The function refuses everything that is not the caller's accepted invitation; an event deleted in the
  // same moment gives no row, which is "Not found" too.
  if (!row) throw Object.assign(new Error("Not found"), { code: "P0002" });
  return row;
}

/** The whole card of the user's accepted invitation (R65). "Not found" for anything else. */
export async function readAcceptedInvite(query: Query, inviteId: string): Promise<AcceptedInviteDetails> {
  // Without parameters, so it can go out first (see src/lib/server/pages/load.ts).
  const peopleRead = readPeople(query);
  const row = await readAcceptedRow(query, inviteId);
  const todos = await readSharedTodos(query, inviteId);
  const inviter = cardsOfContacts((await peopleRead).contacts).get(row.owner_id) ?? { userId: row.owner_id, name: UNKNOWN_PERSON, photoUrl: null };
  const common = {
    inviteId: row.invite_id,
    answer: "accepted" as const,
    inviter,
    title: stripHiddenCharacters(row.title),
    location: row.location === null ? null : stripHiddenCharacters(row.location),
    // As saved, not cleaned: the screen sends it back as "the notes I last read" (the notes action
    // compares them), and a textarea shows text as text anyway.
    notes: row.notes,
    todos,
    goalId: row.all_day ? null : row.goal_id,
    travelMode: row.travel_mode,
    travelFrom: row.travel_from,
    done: row.status === "done",
  };
  return row.all_day
    ? { ...common, allDay: true, firstDay: row.first_day!, lastDay: row.last_day! }
    : { ...common, allDay: false, startAt: iso(row.start_at!), endAt: iso(row.end_at!) };
}
