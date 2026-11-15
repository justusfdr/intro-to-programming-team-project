import { setDemoContacts } from "@/lib/server/actions/demo-contacts";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/demo-contacts.ts.
export async function POST(request: Request): Promise<Response> {
  return setDemoContacts(request, await realDeps());
}
