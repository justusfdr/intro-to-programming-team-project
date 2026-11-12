import { updateSettings } from "@/lib/server/actions/update-settings";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/update-settings.ts.
export async function POST(request: Request): Promise<Response> {
  return updateSettings(request, await realDeps());
}
