import "server-only";

// Reading shared lists (spec 30) as the signed-in user. Row-level security decides which lists,
// members and entries come back (owner or member, R55); the people's names and photos come from
// app.list_people, which never returns an e-mail address. Every answer is built here from an explicit
// list of fields, so nothing else of a row can slip into what the browser receives.
import type { Query } from "@/lib/server/db";
import { photoUrlOf } from "@/lib/server/profiles/cards";
import { shownName } from "@/lib/profiles/display-name";
import type { ListDetail, ListEntry, ListPerson, ListSummary, ShareContact } from "@/lib/lists/types";

/** The name shown for a member without a display name whom the viewer may not know by address. */
export const UNNAMED_MEMBER = "Member";

type PersonRow = {
  list_id?: string;
  user_id: string;
  is_owner: boolean;
  display_name: string | null;
  fallback_name: string | null;
  photo_at: Date | string | null;
};

type EntryRow = {
  id: string;
  title: string;
  done: boolean;
  position: number;
  updated_at: Date | string;
  added_by: string | null;
  done_by: string | null;
};

const iso = (value: Date | string) => new Date(value).toISOString();

function personOf(row: PersonRow, me: string): ListPerson {
  return {
    userId: row.user_id,
    name: row.display_name ?? row.fallback_name ?? UNNAMED_MEMBER,
    photoUrl: photoUrlOf(row.user_id, row.photo_at),
    isOwner: row.is_owner,
    isMe: row.user_id === me,
  };
}

/** An entry; who added or ticked it only while that person is still in the list (else nobody). */
function entryOf(row: EntryRow, present: ReadonlySet<string>): ListEntry {
  return {
    id: row.id,
    title: row.title,
    done: row.done,
    position: Number(row.position),
    updatedAt: iso(row.updated_at),
    addedBy: row.added_by !== null && present.has(row.added_by) ? row.added_by : null,
    doneBy: row.done_by !== null && present.has(row.done_by) ? row.done_by : null,
  };
}

const PEOPLE = "select user_id, is_owner, display_name, fallback_name, photo_at from app.list_people($1::uuid)";

/** One list with its people and entries, or null when the user may not use it (or it does not exist). */
export async function readListDetail(query: Query, me: string, listId: string): Promise<ListDetail | null> {
  const [lists, peopleRows, entryRows] = await Promise.all([
    query<{ id: string; title: string; is_owner: boolean; updated_at: Date | string }>(
      "select id, title, owner = (select auth.uid()) as is_owner, updated_at from app.lists where id = $1::uuid",
      [listId],
    ),
    query<PersonRow>(PEOPLE, [listId]),
    query<EntryRow>(
      "select id, title, done, position, updated_at, added_by, done_by from app.list_items where list_id = $1::uuid order by position",
      [listId],
    ),
  ]);
  const list = lists[0];
  if (!list) return null;
  const people = peopleRows.map((row) => personOf(row, me));
  const present = new Set(people.map((p) => p.userId));
  return {
    id: list.id,
    title: list.title,
    updatedAt: iso(list.updated_at),
    isOwner: list.is_owner,
    people,
    entries: entryRows.map((row) => entryOf(row, present)),
  };
}

/** Every list the user may use (their own and those shared with them), oldest first. */
export async function readListSummaries(query: Query, me: string): Promise<ListSummary[]> {
  // Two reads without parameters: they travel together (see db/with-user.ts).
  const [lists, peopleRows] = await Promise.all([
    query<{ id: string; title: string; is_owner: boolean; open_count: number }>(
      `select l.id, l.title, l.owner = (select auth.uid()) as is_owner,
              (select count(*)::integer from app.list_items i where i.list_id = l.id and not i.done) as open_count
         from app.lists l
        order by l.created_at, l.id`,
    ),
    query<PersonRow & { list_id: string }>(
      `select l.id as list_id, p.user_id, p.is_owner, p.display_name, p.fallback_name, p.photo_at
         from app.lists l cross join lateral app.list_people(l.id) p`,
    ),
  ]);
  return lists.map((list) => {
    const people = peopleRows.filter((row) => row.list_id === list.id).map((row) => personOf(row, me));
    return {
      id: list.id,
      title: list.title,
      isOwner: list.is_owner,
      ownerName: people.find((p) => p.isOwner)?.name ?? UNNAMED_MEMBER,
      openCount: Number(list.open_count),
      people,
    };
  });
}

/** The user's own contacts, by name, for the owner's "Share" panel (their own contacts' addresses only). */
export async function readShareContacts(query: Query): Promise<ShareContact[]> {
  const rows = await query<{ id: string; user_id: string; display_name: string | null; email: string; photo_at: Date | string | null }>(
    "select id, user_id, display_name, email, photo_at from app.contact_cards() where kind = 'contact'",
  );
  return rows
    .map((row) => ({
      contactId: row.id,
      userId: row.user_id,
      name: shownName(row.display_name, row.email),
      email: row.email,
      photoUrl: photoUrlOf(row.user_id, row.photo_at),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email));
}
