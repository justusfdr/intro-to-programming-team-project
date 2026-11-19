import { addInviteTodo } from "@/lib/server/actions/event-invites";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/event-invites.ts.
// POST { title }: a shared to-do at the end of the list of the accepted invitation's event (spec 55, R66).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return addInviteTodo(request, await realDeps(), id);
}
