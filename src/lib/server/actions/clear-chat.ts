import "server-only";

// Action clear_chat (ontology section 5, always allowed; spec 19): deletes all the user's chats (spec 44),
// messages and drafts (the drafts go with their messages); events, also those made from a draft, stay.
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

export function clearChat(request: Request, deps: Pick<Deps, "auth" | "withUser">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    return deps.withUser(userId, async (query) => {
      await query("delete from app.draft_plans");
      await query("delete from app.chat_messages");
      await query("delete from app.chats");
      return jsonOk({ message: MESSAGES.chatCleared });
    });
  });
}
