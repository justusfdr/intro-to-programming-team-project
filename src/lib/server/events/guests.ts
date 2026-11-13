import "server-only";

// The checks of an event's guests (spec 24), shared by create_event and edit_event. Each throws the
// ontology's message; the database checks the same again (supabase/migrations/*_event_guests.sql).
// The addresses are never logged.
import { cleanGuestList } from "@/lib/events/guests";
import { MESSAGES } from "@/lib/messages";
import type { Query } from "@/lib/server/db";
import { ActionError } from "@/lib/server/errors";

/** The list from the body, cleaned (lower-case, each once), or undefined when the body leaves it out. */
export function checkGuests(raw: readonly string[] | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  const list = cleanGuestList(raw);
  if (list.ok) return list.guests;
  if (list.reason === "too_many") throw new ActionError(400, "too_many_guests", MESSAGES.tooManyGuests);
  throw new ActionError(400, "guest_invalid", MESSAGES.guestInvalid);
}

/**
 * Guests may be set or changed only while the user's Outlook is connected, because Outlook sends the
 * invitations; not on an event of a series or a demo event (decision 2 of spec 24).
 */
export async function assertMayInvite(query: Query, event: { seriesId: string | null | boolean; demo: boolean }): Promise<void> {
  if (event.seriesId) throw new ActionError(400, "guests_series", MESSAGES.guestsNotInSeries);
  if (event.demo) throw new ActionError(400, "guests_demo", MESSAGES.guestsNotDemo);
  const [row] = await query<{ ok: boolean }>("select exists (select 1 from app.calendar_connections where status = 'connected') as ok");
  if (!row?.ok) throw new ActionError(409, "guests_need_outlook", MESSAGES.guestsNeedOutlook);
}

/**
 * The database's refusal of guests (a disconnect at the same moment, or a list it refuses) as the
 * ontology's answer, so the failing row (with the addresses) never reaches the server log.
 */
export function asGuestError(error: unknown): unknown {
  const message = error instanceof Error ? error.message : "";
  if (message.includes(MESSAGES.guestsNeedOutlook)) return new ActionError(409, "guests_need_outlook", MESSAGES.guestsNeedOutlook);
  if (/events_guests_(shape|single)/.test(message)) return new ActionError(400, "guest_invalid", MESSAGES.guestInvalid);
  return error;
}
