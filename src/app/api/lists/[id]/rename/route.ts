import { renameList } from "@/lib/server/actions/lists";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/lists.ts.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return renameList(request, await realDeps(), id);
}
