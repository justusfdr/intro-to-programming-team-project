import "server-only";

// Action reject_draft (ontology section 5; spec 19): the user's draft ("Not found" otherwise, R3),
// locked; open -> rejected, else "This draft is no longer open". The calendar is not touched.
import { MESSAGES } from "@/lib/messages";
import { assertDraftOpen, findOwnDraft } from "@/lib/server/chat/rows";
import type { Deps } from "@/lib/server/deps";
import { handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

export function rejectDraft(request: Request, deps: Pick<Deps, "auth" | "withUser">, id: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    return deps.withUser(userId, async (query) => {
      const draft = await findOwnDraft(query, id);
      assertDraftOpen(draft);
      await query("update app.draft_plans set status = 'rejected' where id = $1", [draft.id]);
      return jsonOk({ message: MESSAGES.draftRejected, draftId: draft.id });
    });
  });
}
