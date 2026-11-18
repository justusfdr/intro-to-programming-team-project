import { exportReport } from "@/lib/server/actions/export-report";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action (and its tests) live in src/lib/server/actions/export-report.ts.
export async function GET(request: Request): Promise<Response> {
  return exportReport(request, await realDeps());
}
