import { undoDraft } from "@/lib/server/actions/undo-draft";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/undo-draft.ts.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return undoDraft(request, await realDeps(), id);
}
