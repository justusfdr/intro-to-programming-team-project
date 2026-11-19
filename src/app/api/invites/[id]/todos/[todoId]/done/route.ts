import { tickInviteTodo } from "@/lib/server/actions/event-invites";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/event-invites.ts.
// POST { done }: a shared to-do done or not done again (spec 55, R66).
export async function POST(request: Request, { params }: { params: Promise<{ id: string; todoId: string }> }): Promise<Response> {
  const { id, todoId } = await params;
  return tickInviteTodo(request, await realDeps(), id, todoId);
}
