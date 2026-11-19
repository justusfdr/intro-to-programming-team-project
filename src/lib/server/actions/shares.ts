import "server-only";

// Sharing a calendar with a contact (spec 53, from spec 29; ontology R55 to R58):
// - set_share (POST /api/contacts/[id]/share): what the signed-in user shares with the other person of
//   one of their contact rows;
// - reading a shared calendar for a window (GET /api/shares/[userId]/calendar?from=…&to=…).
// Each: same-origin check, signed in (R3), a uuid ("Not found" otherwise), then one database function
// that checks the share and the contact itself. A foreign, missing or malformed id gets the same
// "Not found"; nothing is ever written of the owner's (R57).
// The database's share also has a "focus" flag (the focus chart of spec 29, not offered by the app):
// set_share needs it, and the server always sends the STORED value back unchanged (R55): a "focus" in
// the body is accepted but ignored (security review I4).
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { notFound } from "@/lib/server/events/own-event";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { readSharedCalendar } from "@/lib/server/shares/read";
import { CALENDAR_LEVELS, MAX_WINDOW_DAYS, type CalendarLevel } from "@/lib/shares/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** An ISO time with its offset, as the calendar sends it ("2026-11-16T00:00:00.000Z"). */
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

type ActionDeps = Pick<Deps, "auth" | "withUser">;

const ShareBody = z.object({
  calendar: z.enum(CALENDAR_LEVELS as [CalendarLevel, ...CalendarLevel[]]),
  /** Accepted for older screens, never used: the stored flag is kept. */
  focus: z.boolean().optional(),
});

/** The database's refusals as answers; anything else goes on unchanged. */
function shareRefusal(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if (message === MESSAGES.notFound) throw notFound();
  if (message === MESSAGES.shareWindow) throw new ActionError(400, "share_window", MESSAGES.shareWindow);
  if (message === MESSAGES.shareChoice) throw new ActionError(400, "share_choice", MESSAGES.shareChoice);
  throw error;
}

/** set_share: what the user shares with this contact. The answer repeats what is saved now. */
export function setShare(request: Request, deps: ActionDeps, contactId: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    const body = await readJson(request, ShareBody);
    if (!body.ok) return body.response;
    if (!UUID.test(contactId)) throw notFound();
    let focus = false;
    try {
      focus = await deps.withUser(userId, async (query) => {
        // The flag as stored for this contact row (false without a row), read under the user's rights.
        const stored = await query<{ focus: boolean }>(
          "select focus from app.shares_overview() where direction = 'out' and contact_id = $1::uuid",
          [contactId],
        );
        const kept = stored[0]?.focus ?? false;
        await query("select app.set_share($1::uuid, $2::text, $3::boolean)", [contactId, body.data.calendar, kept]);
        return kept;
      });
    } catch (error) {
      shareRefusal(error);
    }
    return jsonOk({ message: MESSAGES.shareSaved, calendar: body.data.calendar, focus });
  });
}

/** A time from the address, or null when it is missing or not a full ISO time. */
function timeParam(value: string | null): Date | null {
  if (value === null || !ISO_TIME.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** GET: the owner's calendar between `from` and `to` (at most 62 days), in the shape of its level (R56). */
export function sharedCalendar(request: Request, deps: ActionDeps, ownerId: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    if (!UUID.test(ownerId)) throw notFound();
    const params = new URL(request.url).searchParams;
    const from = timeParam(params.get("from"));
    const to = timeParam(params.get("to"));
    if (!from || !to || to <= from || to.getTime() - from.getTime() > MAX_WINDOW_DAYS * DAY_MS) {
      throw new ActionError(400, "share_window", MESSAGES.shareWindow);
    }
    try {
      const answer = await deps.withUser(userId, (query) => readSharedCalendar(query, ownerId, from, to));
      return jsonOk(answer);
    } catch (error) {
      shareRefusal(error);
    }
  });
}
