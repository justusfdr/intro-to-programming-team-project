import "server-only";

// Action export_report (spec 49, "Export"): the signed-in user's numbers of a period as a PDF file.
//   1. signed in (R3)   2. the period and the parts are checked (src/lib/analytics/period.ts): a bad
//   request is refused with its message   3. sessions that ran out are finished first, so they count (R13)
//   4. one transaction with all the reads (row-level security keeps them to the user's own rows)
//   5. the PDF is drawn from those numbers and sent as a download. Nothing is saved or kept.
// It only reads, so it is a GET that a link can start; the address carries the period and the parts,
// never any personal data.
import { checkPeriod, lastDayOf } from "@/lib/analytics/period";
import { APP_NAME } from "@/lib/app-name";
import { renderReportPdf } from "@/lib/server/analytics/pdf";
import { readPeriodReport } from "@/lib/server/analytics/period";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { settleSessions } from "@/lib/server/focus/sessions";
import { requireUser } from "@/lib/server/session";
import { readTimeZone } from "@/lib/server/settings";
import { localDateOf } from "@/lib/time/zoned";

export function exportReport(request: Request, deps: Pick<Deps, "auth" | "withUser" | "now">): Promise<Response> {
  return handleAction(async () => {
    const userId = await requireUser(deps.auth);
    const now = deps.now();
    const params = new URL(request.url).searchParams;

    await settleSessions(deps, userId, now);
    const { report, parts } = await deps.withUser(userId, async (query) => {
      const timeZone = await readTimeZone(query);
      const checked = checkPeriod({ from: params.get("from"), to: params.get("to"), parts: params.get("parts") ?? "" }, localDateOf(now, timeZone));
      if (!checked.ok) throw new ActionError(400, "invalid_report", checked.message);
      return { report: await readPeriodReport(query, now, checked.period, timeZone), parts: checked.parts };
    });

    const bytes = await renderReportPdf(report, parts);
    const name = `${APP_NAME}-report-${report.period.from}-to-${lastDayOf(report.period)}.pdf`;
    return new Response(bytes as BodyInit, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${name}"`,
        "content-length": String(bytes.byteLength),
        // The user's own numbers: no shared cache may keep them.
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  });
}
