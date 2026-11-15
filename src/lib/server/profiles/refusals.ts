import "server-only";

// The refusals the database functions of specs 28 and 31 raise, turned into the answers the user sees. The
// database raises the ontology's exact sentence; anything else is passed on unchanged (and becomes the
// neutral "Something went wrong" answer in handleAction).
import { MESSAGES } from "@/lib/messages";
import { ActionError } from "@/lib/server/errors";
import { notFound } from "@/lib/server/events/own-event";

const KNOWN: ReadonlyArray<readonly [string, number, string]> = [
  [MESSAGES.displayName, 400, "invalid_name"],
  [MESSAGES.bio, 400, "invalid_bio"],
  [MESSAGES.linkedin, 400, "invalid_linkedin"],
  [MESSAGES.photoType, 400, "photo_type"],
  [MESSAGES.photoSize, 413, "photo_size"],
  [MESSAGES.invalidEmail, 400, "invalid_email"],
  [MESSAGES.inviteSelf, 400, "invite_self"],
  [MESSAGES.tooManyInvitations, 409, "too_many_invitations"],
  [MESSAGES.invitationsPerHour, 429, "invitations_per_hour"],
  [MESSAGES.tooManyContacts, 409, "too_many_contacts"],
  [MESSAGES.theirContactsFull, 409, "their_contacts_full"],
];

/** Throws the matching ActionError for a refusal of the database, else the error itself. */
export function refusalOf(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if (message === MESSAGES.notFound) throw notFound();
  for (const [text, status, code] of KNOWN) if (message === text) throw new ActionError(status, code, text);
  throw error;
}
