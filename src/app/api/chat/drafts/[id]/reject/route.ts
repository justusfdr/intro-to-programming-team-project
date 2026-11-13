import { rejectDraft } from "@/lib/server/actions/reject-draft";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/reject-draft.ts.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return rejectDraft(request, await realDeps(), id);
}
