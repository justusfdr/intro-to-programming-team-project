import { signOut } from "@/lib/server/actions/sign-out";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/sign-out.ts.
export async function POST(request: Request): Promise<Response> {
  return signOut(request, await realDeps());
}
