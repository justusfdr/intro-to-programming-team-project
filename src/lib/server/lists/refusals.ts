import "server-only";

// The refusals the list functions of spec 30 raise, turned into the answers the user sees. The
// database raises the ontology's exact sentence; anything else is passed on unchanged (and becomes the
// neutral "Something went wrong" answer in handleAction).
import { MESSAGES } from "@/lib/messages";
import { ActionError } from "@/lib/server/errors";
import { notFound } from "@/lib/server/events/own-event";

const KNOWN: ReadonlyArray<readonly [string, number, string]> = [
  [MESSAGES.listTitle, 400, "list_title"],
  [MESSAGES.tooManyLists, 409, "too_many_lists"],
  [MESSAGES.listOwnerOnly, 403, "owner_only"],
  [MESSAGES.tooManyMembers, 409, "too_many_members"],
  [MESSAGES.memberLeft, 409, "member_left"],
  [MESSAGES.memberListsFull, 409, "member_lists_full"],
  [MESSAGES.ownerCannotLeave, 409, "owner_cannot_leave"],
  [MESSAGES.entryTitle, 400, "entry_title"],
  [MESSAGES.tooManyEntries, 409, "too_many_entries"],
  [MESSAGES.changedBySomeoneElse, 409, "changed_elsewhere"],
];

/** Throws the matching ActionError for a refusal of the database (or one of ours), else the error itself. */
export function listRefusalOf(error: unknown): never {
  if (error instanceof ActionError) throw error;
  const message = error instanceof Error ? error.message : "";
  if (message === MESSAGES.notFound) throw notFound();
  for (const [text, status, code] of KNOWN) if (message === text) throw new ActionError(status, code, text);
  throw error;
}

/** The refusal with this message, for checks the server makes before asking the database. */
export function listRefusal(message: string): ActionError {
  const known = KNOWN.find(([text]) => text === message);
  return known ? new ActionError(known[1], known[2], known[0]) : new ActionError(400, "bad_request", message);
}
