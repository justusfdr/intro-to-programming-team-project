import "server-only";

// The extension's state request (R16): only the block list, whether blocking is on and until when.
//   1. only from our extension (origin rule, blocker design)   2. signed in (R3, 401 otherwise)
//   3. let due sessions finish (R13)   4. note that the extension asked (R18), read the state
// It has no body; it changes nothing but extension_seen_at.
import type { Deps } from "@/lib/server/deps";
import { handleAction } from "@/lib/server/errors";
import { assertFromExtension } from "@/lib/server/blocker/extension-request";
import { readBlockedSites, readBlockingState } from "@/lib/server/blocker/load";
import { settleSessions } from "@/lib/server/focus/sessions";
import { jsonOk } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

export function extensionState(request: Request, deps: Pick<Deps, "auth" | "withUser" | "now">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertFromExtension(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);
    const now = deps.now();
    await settleSessions(deps, userId, now);

    return deps.withUser(userId, async (query) => {
      // R18: the app shows "Blocker not connected" when this has not happened for 2 minutes.
      await query("select app.mark_extension_seen()");
      const sites = await readBlockedSites(query);
      const state = await readBlockingState(query, now);
      return jsonOk({
        sites: sites.map((site) => site.domain),
        blockingOn: state.blockingOn,
        blockingUntil: state.blockingUntil ? state.blockingUntil.toISOString() : null,
      });
    });
  });
}
