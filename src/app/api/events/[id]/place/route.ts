import { eventPlace } from "@/lib/server/actions/event-place";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/event-place.ts.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return eventPlace(request, await realDeps(), id);
}
