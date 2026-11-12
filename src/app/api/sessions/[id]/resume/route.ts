import { resumeSession } from "@/lib/server/actions/session-pause";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/session-pause.ts.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return resumeSession(request, await realDeps(), id);
}
