import "server-only";

// Sharing a calendar and the focus chart with a contact (spec 29; ontology R47 to R51):
// - set_share (POST /api/contacts/[id]/share): what the signed-in user shares with the other person of
//   one of their contact rows;
// - reading a shared calendar for a window (GET /api/shares/[userId]/calendar?from=…&to=…);
// - reading a shared focus chart (GET /api/shares/[userId]/focus).
// Each: same-origin check, signed in (R3), a uuid ("Not found" otherwise), then one database function
// that checks the share and the contact itself. A foreign, missing or malformed id gets the same
// "Not found"; nothing is ever written of the owner's (R50).
// Spec 32: the two reads also know the three demo contacts by their fixed ids, before the uuid check.
// They answer from the generated demo data only while the user has the demo contacts on, and only what
// that demo person shares; otherwise the same "Not found" as for any unknown id. set_share never knows
// them: their ids are not uuids, so it answers "Not found" (nothing is ever shared with a demo contact).
import { z } from "zod";
import { demoCalendar, demoFocus, demoPerson, isDemoId, type DemoPerson } from "@/lib/demo/people";
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { notFound } from "@/lib/server/events/own-event";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { readDemoContactsOn } from "@/lib/server/demo/people";
import { readSharedCalendar, readSharedFocus } from "@/lib/server/shares/read";
import { CALENDAR_LEVELS, MAX_WINDOW_DAYS, type CalendarLevel } from "@/lib/shares/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** An ISO time with its offset, as the calendar sends it ("2026-11-16T00:00:00.000Z"). */
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

type ActionDeps = Pick<Deps, "auth" | "withUser">;
type ReadDeps = Pick<Deps, "auth" | "withUser" | "now">;

const ShareBody = z.object({
  calendar: z.enum(CALENDAR_LEVELS as [CalendarLevel, ...CalendarLevel[]]),
  focus: z.boolean(),
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
    try {
      await deps.withUser(userId, (query) =>
        query("select app.set_share($1::uuid, $2::text, $3::boolean)", [contactId, body.data.calendar, body.data.focus]),
      );
    } catch (error) {
      shareRefusal(error);
    }
    return jsonOk({ message: MESSAGES.shareSaved, calendar: body.data.calendar, focus: body.data.focus });
  });
}

/** The demo person for this id if the user has the demo contacts on, else "Not found". */
async function demoOwner(deps: ActionDeps, userId: string, id: string): Promise<DemoPerson> {
  const person = demoPerson(id);
  const on = await deps.withUser(userId, readDemoContactsOn);
  if (!person || !on) throw notFound();
  return person;
}

/** A time from the address, or null when it is missing or not a full ISO time. */
function timeParam(value: string | null): Date | null {
  if (value === null || !ISO_TIME.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** GET: the owner's calendar between `from` and `to` (at most 62 days), in the shape of its level (R48). */
export function sharedCalendar(request: Request, deps: ActionDeps, ownerId: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    const demo = isDemoId(ownerId) ? await demoOwner(deps, userId, ownerId) : null;
    if (demo && demo.shares.calendar === "none") throw notFound();
    if (!demo && !UUID.test(ownerId)) throw notFound();
    const params = new URL(request.url).searchParams;
    const from = timeParam(params.get("from"));
    const to = timeParam(params.get("to"));
    if (!from || !to || to <= from || to.getTime() - from.getTime() > MAX_WINDOW_DAYS * DAY_MS) {
      throw new ActionError(400, "share_window", MESSAGES.shareWindow);
    }
    if (demo) {
      const answer = demoCalendar(demo, from, to);
      if (!answer) throw notFound();
      return jsonOk(answer);
    }
    try {
      const answer = await deps.withUser(userId, (query) => readSharedCalendar(query, ownerId, from, to));
      return jsonOk(answer);
    } catch (error) {
      shareRefusal(error);
    }
  });
}

/** GET: the owner's focus chart (R49): 8 weeks and this week's days. */
export function sharedFocus(request: Request, deps: ReadDeps, ownerId: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    if (isDemoId(ownerId)) {
      const answer = demoFocus(await demoOwner(deps, userId, ownerId), deps.now());
      if (!answer) throw notFound();
      return jsonOk(answer);
    }
    if (!UUID.test(ownerId)) throw notFound();
    try {
      const answer = await deps.withUser(userId, (query) => readSharedFocus(query, ownerId));
      return jsonOk(answer);
    } catch (error) {
      shareRefusal(error);
    }
  });
}
