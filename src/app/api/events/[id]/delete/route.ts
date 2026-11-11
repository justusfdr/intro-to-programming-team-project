import { deleteEvent } from "@/lib/server/actions/delete-event";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/delete-event.ts.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return deleteEvent(request, await realDeps(), id);
}
