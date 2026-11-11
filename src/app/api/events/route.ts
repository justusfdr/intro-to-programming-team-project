import { createEvent } from "@/lib/server/actions/create-event";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/create-event.ts.
export async function POST(request: Request): Promise<Response> {
  return createEvent(request, await realDeps());
}
