import { clearChat } from "@/lib/server/actions/clear-chat";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/clear-chat.ts.
export async function POST(request: Request): Promise<Response> {
  return clearChat(request, await realDeps());
}
