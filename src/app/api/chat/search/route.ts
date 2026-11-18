import { searchChats } from "@/lib/server/actions/search-chats";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/search-chats.ts.
export async function GET(request: Request): Promise<Response> {
  return searchChats(request, await realDeps());
}
