import { removeDraftPerson } from "@/lib/server/actions/remove-draft-person";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/remove-draft-person.ts.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return removeDraftPerson(request, await realDeps(), id);
}
