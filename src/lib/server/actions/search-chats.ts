import "server-only";

// Search through the coach's chats (spec 44): GET /api/chat/search?q=<words>. Finds the user's own chats
// whose title or one of whose messages contains every word, ignoring case; % and _ are searched as
// typed. Newest first, at most 30, each with an excerpt around the first hit and that message's id
// (the page jumps to it). Nothing is changed and nothing leaves our server. An empty search finds
// nothing; one longer than 100 characters is refused.
import { searchWords } from "@/lib/chat/search";
import { MESSAGES } from "@/lib/messages";
import { searchOwnChats } from "@/lib/server/chat/rows";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonOk } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

export function searchChats(request: Request, deps: Pick<Deps, "auth" | "withUser">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);

    const words = searchWords(new URL(request.url).searchParams.get("q") ?? "");
    if (words === null) throw new ActionError(400, "search_length", MESSAGES.chatSearchLength);
    if (words.length === 0) return jsonOk({ results: [] });

    const results = await deps.withUser(userId, (query) => searchOwnChats(query, words));
    return jsonOk({ results });
  });
}
