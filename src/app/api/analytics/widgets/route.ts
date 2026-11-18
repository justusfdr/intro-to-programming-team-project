import { saveAnalyticsWidgets } from "@/lib/server/actions/save-analytics-widgets";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action (and its tests) live in src/lib/server/actions/save-analytics-widgets.ts.
export async function POST(request: Request): Promise<Response> {
  return saveAnalyticsWidgets(request, await realDeps());
}
