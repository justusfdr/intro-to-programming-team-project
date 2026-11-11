import { startSession } from "@/lib/server/actions/start-session";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/start-session.ts.
export async function POST(request: Request): Promise<Response> {
  return startSession(request, await realDeps());
}
