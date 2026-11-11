import { signIn } from "@/lib/server/actions/sign-in";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/sign-in.ts.
export async function POST(request: Request): Promise<Response> {
  return signIn(request, await realDeps());
}
