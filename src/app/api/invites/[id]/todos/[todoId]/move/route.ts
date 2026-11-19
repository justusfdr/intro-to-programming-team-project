import { moveInviteTodo } from "@/lib/server/actions/event-invites";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/event-invites.ts.
// POST { toIndex }: a shared to-do to another place in the list (spec 55, R66).
export async function POST(request: Request, { params }: { params: Promise<{ id: string; todoId: string }> }): Promise<Response> {
  const { id, todoId } = await params;
  return moveInviteTodo(request, await realDeps(), id, todoId);
}
