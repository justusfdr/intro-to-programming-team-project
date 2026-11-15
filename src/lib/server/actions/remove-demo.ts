import "server-only";

// Action remove_demo ("Remove the demo data" in Settings, ontology section 5; spec 13). Always allowed.
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the (empty) body
//   4. inside withUser, in one transaction: delete the user's rows that carry the demo mark (goals with
//      their rules, events, tasks)   5. one answer.
// A demo row the user has changed is still removed (the confirmation says so). Rows the user added
// stay: an own event or task under a demo goal stays, without goal (as delete_goal does).
// Spec 32: it also switches the demo contacts off (they are demo data too; nothing else to delete, as
// they live only in code).
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

const Empty = z.strictObject({});

export function removeDemo(request: Request, deps: Pick<Deps, "auth" | "withUser">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, Empty);
    if (!body.ok) return body.response;

    return deps.withUser(userId, async (query) => {
      // Row-level security limits each delete to the user's own rows.
      await query("delete from app.tasks where demo");
      await query("delete from app.events where demo");
      await query("delete from app.goals where demo");
      await query("select app.set_demo_contacts(false)");
      return jsonOk({ message: MESSAGES.demoRemoved });
    });
  });
}
