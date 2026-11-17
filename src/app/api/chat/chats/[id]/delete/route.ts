import { deleteChat } from "@/lib/server/actions/delete-chat";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/delete-chat.ts.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return deleteChat(request, await realDeps(), id);
}
