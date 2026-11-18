import "server-only";

// Action delete_chat (ontology section 5, always allowed; spec 44): deletes one of the user's chats with
// its messages and their drafts (the database deletes them with the chat). Events, also those made
// from one of its drafts, stay. Another user's chat, or one already deleted, is "This chat no longer
// exists" (R3), and nothing changes.
import { MESSAGES } from "@/lib/messages";
import { chatGone, findOwnChat } from "@/lib/server/chat/rows";
import type { Deps } from "@/lib/server/deps";
import { handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

export function deleteChat(request: Request, deps: Pick<Deps, "auth" | "withUser">, id: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    return deps.withUser(userId, async (query) => {
      // Waits for an answer being saved into this chat right now (saveTurn holds the same lock).
      await query("select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('chat:' || auth.uid()::text))");
      const chat = await findOwnChat(query, id);
      if (!chat) throw chatGone();
      await query("delete from app.chats where id = $1", [chat.id]);
      return jsonOk({ message: MESSAGES.chatDeleted, chatId: chat.id });
    });
  });
}
