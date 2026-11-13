import { sendMessage } from "@/lib/server/actions/send-message";
import { realDeps } from "@/lib/server/deps";

// Claude may take up to 60 seconds, and the call is tried at most twice.
export const maxDuration = 150;

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/send-message.ts.
export async function POST(request: Request): Promise<Response> {
  return sendMessage(request, await realDeps());
}
