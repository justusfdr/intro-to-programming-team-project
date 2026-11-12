import "server-only";

// Action remove_blocked_site (ontology: always allowed; past attempts stay).
//   1. same-origin check   2. signed in (R3)   3. inside withUser: the user's site ("Not found"
//   otherwise), delete it   4. one answer.
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { handleAction } from "@/lib/server/errors";
import { notFound } from "@/lib/server/events/own-event";
import { assertSameOrigin, jsonOk } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function removeBlockedSite(request: Request, deps: Pick<Deps, "auth" | "withUser">, id: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    return deps.withUser(userId, async (query) => {
      if (!UUID.test(id)) throw notFound();
      const deleted = await query("delete from app.blocked_sites where id = $1 returning id", [id]);
      if (deleted.length === 0) throw notFound();
      return jsonOk({ message: MESSAGES.siteRemoved });
    });
  });
}
