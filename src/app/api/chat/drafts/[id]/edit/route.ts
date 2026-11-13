import { editDraft } from "@/lib/server/actions/edit-draft";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/edit-draft.ts.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return editDraft(request, await realDeps(), id);
}
