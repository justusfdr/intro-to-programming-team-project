import "server-only";

// disconnect_outlook (always allowed, R26), sync_outlook (by itself, when the calendar opens) and
// sending app events right after a change. Same pattern as the other actions: same-origin check,
// signed in, then the work. None of them returns or logs anything of the stored access.
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk } from "@/lib/server/http";
import { readOutlookState, sendToOutlook, syncOutlook, type OutlookDeps } from "@/lib/server/outlook/sync";
import { requireUser } from "@/lib/server/session";

/** The connection and the imported events go; what the app wrote stays in Outlook (R26). */
export function disconnectOutlook(request: Request, deps: Pick<Deps, "auth" | "withUser">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    await deps.withUser(userId, (q) => q("select app.outlook_disconnect()"));
    return jsonOk({ message: MESSAGES.outlookDisconnected });
  });
}

/** sync_outlook. Answers whether anything ran (the page then reloads) and the connection's state. */
export function syncOutlookNow(request: Request, deps: Deps, outlook: OutlookDeps): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    const result = await syncOutlook(deps, outlook, userId);
    const state = await deps.withUser(userId, readOutlookState);
    return jsonOk({ ran: result.ran, ok: result.ran ? result.ok : null, ...state });
  });
}

/** Sends pending app events now (after a save or delete), without waiting for the next sync. */
export function sendOutlookNow(request: Request, deps: Deps, outlook: OutlookDeps): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);
    const sent = await sendToOutlook(deps, outlook, userId);
    return jsonOk({ sent });
  });
}
