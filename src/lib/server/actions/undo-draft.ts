import "server-only";

// Action undo_draft (spec 20; ontology section 5, R1, R3, R4, R21, R38):
//   1. same-origin check   2. signed in (R3)
//   3. one transaction: the user's draft, locked ("Not found" otherwise, R3); the chat is allowed
//      (R21, R5); then app.chat_undo_draft decides and does the rest in the database: allowed only
//      while the draft is "accepted" and every event it created or moved is unchanged since (the same
//      updated_at as right after accepting); it deletes the created events, moves the moved ones back
//      and creates the deleted ones again (a new id; a done event is done again), and the draft
//      becomes "undone". Otherwise "This can no longer be undone" and nothing changes (R1).
// What it writes comes only from the undo data the database itself took when the draft was applied.
import { chatAllowed } from "@/lib/chat/access";
import { MESSAGES } from "@/lib/messages";
import { findOwnDraft, readChatAccount } from "@/lib/server/chat/rows";
import { chatProOnly } from "@/lib/server/config";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { proOnlyError } from "./send-message";

const cannotUndo = () => new ActionError(409, "cannot_undo", MESSAGES.draftCannotUndo);

export function undoDraft(request: Request, deps: Pick<Deps, "auth" | "withUser">, id: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    try {
      return await deps.withUser(userId, async (query) => {
        const draft = await findOwnDraft(query, id);
        if (draft.status !== "accepted") throw cannotUndo();
        const account = await readChatAccount(query);
        if (!chatAllowed(account.plan, chatProOnly())) throw proOnlyError();

        await query("select app.chat_undo_draft($1)", [draft.id]);
        return jsonOk({ message: MESSAGES.draftUndone, draftId: draft.id });
      });
    } catch (error) {
      // The database's own refusal: an event was changed since, or the draft has no undo data.
      if ((error as { constraint?: unknown } | null)?.constraint === "draft_plans_undo") throw cannotUndo();
      throw error;
    }
  });
}
