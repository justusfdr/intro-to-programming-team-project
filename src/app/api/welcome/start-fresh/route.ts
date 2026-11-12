import { startFresh } from "@/lib/server/actions/start-fresh";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/start-fresh.ts.
export async function POST(request: Request): Promise<Response> {
  return startFresh(request, await realDeps());
}
