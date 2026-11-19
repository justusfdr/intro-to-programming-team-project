import { renameInviteTodo } from "@/lib/server/actions/event-invites";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/event-invites.ts.
// POST { title }: a new title for a shared to-do (spec 55, R66).
export async function POST(request: Request, { params }: { params: Promise<{ id: string; todoId: string }> }): Promise<Response> {
  const { id, todoId } = await params;
  return renameInviteTodo(request, await realDeps(), id, todoId);
}
