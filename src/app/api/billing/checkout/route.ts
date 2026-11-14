import { upgradeToPro } from "@/lib/server/actions/billing";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: upgrade_to_pro and its tests live in src/lib/server/actions/billing.ts.
export async function POST(request: Request): Promise<Response> {
  return upgradeToPro(request, await realDeps());
}
