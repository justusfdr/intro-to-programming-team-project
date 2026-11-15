import "server-only";

// The actions of shared lists (spec 30; ontology section 5, R52 to R57): create_list, rename_list,
// delete_list, add_list_member, remove_list_member, leave_list, add_entry, rename_entry, tick_entry,
// move_entry, delete_entry. Each, in the pattern of the other actions:
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the body (at most 4 kB)
//   4. a malformed id is "Not found" before anything is asked (the same answer as a foreign or missing one)
//   5. inside withUser: one database function that checks the caller's role in the list itself, locks
//      the list and writes; then the list as it is now, read as the user
//   6. one answer: the message and the list (or, after deleting or leaving it, where to go next).
// The server checks the titles first so the answer comes quickly; the database checks them again.
// An answer names other people only by name and photo address, never by e-mail address (R55).
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import { cleanEntryTitle, cleanListTitle } from "@/lib/lists/text";
import type { Query } from "@/lib/server/db";
import type { Deps } from "@/lib/server/deps";
import { handleAction } from "@/lib/server/errors";
import { notFound } from "@/lib/server/events/own-event";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { readListDetail } from "@/lib/server/lists/read";
import { listRefusal, listRefusalOf } from "@/lib/server/lists/refusals";
import { requireUser } from "@/lib/server/session";

type ListDeps = Pick<Deps, "auth" | "withUser">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The updated_at the screen last saw, exactly as the server sent it (R4). */
const VERSION = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
/** Large enough for a 200-character title in any script; everything else is tiny. */
const BODY_LIMIT = 4 * 1024;

const Empty = z.object({});
const TitleBody = z.object({ title: z.string().max(1000) });
const RenameBody = z.object({ title: z.string().max(1000), updatedAt: VERSION });
const ContactBody = z.object({ contactId: z.string().max(64) });
const UserBody = z.object({ userId: z.string().max(64) });
const TickBody = z.object({ done: z.boolean(), updatedAt: VERSION });
const MoveBody = z.object({ toIndex: z.number().int().min(0).max(199), updatedAt: VERSION });
const DeleteBody = z.object({ updatedAt: VERSION });

/** Runs one list action: same-origin, signed in, the body, then `run` in one transaction as the user. */
function listAction<S extends z.ZodType>(
  request: Request,
  deps: ListDeps,
  schema: S,
  ids: (body: z.infer<S>) => string[],
  run: (query: Query, userId: string, body: z.infer<S>) => Promise<Response>,
): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    const body = await readJson(request, schema, BODY_LIMIT);
    if (!body.ok) return body.response;
    if (ids(body.data).some((id) => !UUID.test(id))) throw notFound();
    try {
      return await deps.withUser(userId, (query) => run(query, userId, body.data));
    } catch (error) {
      listRefusalOf(error);
    }
  });
}

/** The answer of every change inside a list: the message and the list as it is now. */
async function listAnswer(query: Query, userId: string, listId: string, message: string, status = 200): Promise<Response> {
  const list = await readListDetail(query, userId, listId);
  if (!list) throw notFound();
  return jsonOk({ message, list }, status);
}

function listTitleOf(raw: string): string {
  const title = cleanListTitle(raw);
  if (title === null) throw listRefusal(MESSAGES.listTitle);
  return title;
}

function entryTitleOf(raw: string): string {
  const title = cleanEntryTitle(raw);
  if (title === null) throw listRefusal(MESSAGES.entryTitle);
  return title;
}

/** create_list: a new list of the user's own, without members. */
export function createList(request: Request, deps: ListDeps): Promise<Response> {
  return listAction(request, deps, TitleBody, () => [], async (query, _userId, body) => {
    const title = listTitleOf(body.title);
    const [row] = await query<{ id: string }>("select app.create_list($1::text) as id", [title]);
    return jsonOk({ message: MESSAGES.listCreated, id: row.id, next: `/lists/${row.id}` }, 201);
  });
}

/** rename_list: the owner only, with the list's updated_at (R4). */
export function renameList(request: Request, deps: ListDeps, id: string): Promise<Response> {
  return listAction(request, deps, RenameBody, () => [id], async (query, userId, body) => {
    const title = listTitleOf(body.title);
    await query("select app.rename_list($1::uuid, $2::text, $3::timestamptz)", [id, title, body.updatedAt]);
    return listAnswer(query, userId, id, MESSAGES.listRenamed);
  });
}

/** delete_list: the owner only; the members and entries go with it. */
export function deleteList(request: Request, deps: ListDeps, id: string): Promise<Response> {
  return listAction(request, deps, Empty, () => [id], async (query) => {
    await query("select app.delete_list($1::uuid)", [id]);
    return jsonOk({ message: MESSAGES.listDeleted, next: "/lists" });
  });
}

/** add_list_member: the owner adds one of their contacts, named by the contact row (R53). */
export function addListMember(request: Request, deps: ListDeps, id: string): Promise<Response> {
  // The contact row's id is checked like the list's: a malformed one is "Not found".
  return listAction(request, deps, ContactBody, (body) => [id, body.contactId], async (query, userId, body) => {
    await query("select app.add_list_member($1::uuid, $2::uuid)", [id, body.contactId]);
    return listAnswer(query, userId, id, MESSAGES.memberAdded);
  });
}

/** remove_list_member: the owner takes a member out. */
export function removeListMember(request: Request, deps: ListDeps, id: string): Promise<Response> {
  return listAction(request, deps, UserBody, (body) => [id, body.userId], async (query, userId, body) => {
    await query("select app.remove_list_member($1::uuid, $2::uuid)", [id, body.userId]);
    return listAnswer(query, userId, id, MESSAGES.memberRemoved);
  });
}

/** leave_list: a member leaves; the owner cannot. */
export function leaveList(request: Request, deps: ListDeps, id: string): Promise<Response> {
  return listAction(request, deps, Empty, () => [id], async (query) => {
    await query("select app.leave_list($1::uuid)", [id]);
    return jsonOk({ message: MESSAGES.listLeft, next: "/lists" });
  });
}

/** add_entry: anyone of the list, at the end, not done. */
export function addListEntry(request: Request, deps: ListDeps, id: string): Promise<Response> {
  return listAction(request, deps, TitleBody, () => [id], async (query, userId, body) => {
    const title = entryTitleOf(body.title);
    await query("select app.add_list_item($1::uuid, $2::text)", [id, title]);
    return listAnswer(query, userId, id, MESSAGES.entryAdded, 201);
  });
}

/** Runs a change of one entry; the database function returns the entry's list. */
async function entryChange(query: Query, userId: string, sql: string, params: unknown[], message: string): Promise<Response> {
  const [row] = await query<{ list_id: string }>(sql, params);
  return listAnswer(query, userId, row.list_id, message);
}

/** rename_entry: anyone of the list, with the entry's updated_at (R4). */
export function renameListEntry(request: Request, deps: ListDeps, entryId: string): Promise<Response> {
  return listAction(request, deps, RenameBody, () => [entryId], (query, userId, body) => {
    const title = entryTitleOf(body.title);
    return entryChange(
      query,
      userId,
      "select app.rename_list_item($1::uuid, $2::text, $3::timestamptz) as list_id",
      [entryId, title, body.updatedAt],
      MESSAGES.entrySaved,
    );
  });
}

/** tick_entry: done or not done, with the entry's updated_at (R4). */
export function tickListEntry(request: Request, deps: ListDeps, entryId: string): Promise<Response> {
  return listAction(request, deps, TickBody, () => [entryId], (query, userId, body) =>
    entryChange(
      query,
      userId,
      "select app.tick_list_item($1::uuid, $2::boolean, $3::timestamptz) as list_id",
      [entryId, body.done, body.updatedAt],
      body.done ? MESSAGES.entryDone : MESSAGES.entryOpen,
    ),
  );
}

/** move_entry: to another place in the list (from 0), with the entry's updated_at (R4). */
export function moveListEntry(request: Request, deps: ListDeps, entryId: string): Promise<Response> {
  return listAction(request, deps, MoveBody, () => [entryId], (query, userId, body) =>
    entryChange(
      query,
      userId,
      "select app.move_list_item($1::uuid, $2::integer, $3::timestamptz) as list_id",
      [entryId, body.toIndex, body.updatedAt],
      MESSAGES.entryMoved,
    ),
  );
}

/** delete_entry: with the entry's updated_at (R4); the later ones move up. */
export function deleteListEntry(request: Request, deps: ListDeps, entryId: string): Promise<Response> {
  return listAction(request, deps, DeleteBody, () => [entryId], (query, userId, body) =>
    entryChange(query, userId, "select app.delete_list_item($1::uuid, $2::timestamptz) as list_id", [entryId, body.updatedAt], MESSAGES.entryDeleted),
  );
}
