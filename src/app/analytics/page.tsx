import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AnalyticsScreen } from "@/components/analytics/AnalyticsScreen";
import { AppShell } from "@/components/shell/AppShell";
import { TABS, type Tab } from "@/lib/analytics/report-types";
import { pageDeps } from "@/lib/server/deps";
import { loadAnalyticsTabsPage } from "@/lib/server/pages/load";

export const metadata: Metadata = { title: "Analytics" };

/** The tab named in the address, when it is one of the six; else the Overview. */
function tabOf(value: string | string[] | undefined): Tab {
  return typeof value === "string" && (TABS as readonly string[]).includes(value) ? (value as Tab) : "overview";
}

// The Analytics page in tabs (spec 49). Opening it saves nothing. ?week= picks the week, ?tab= the tab
// it opens on; changing the tab afterwards happens in the page without asking the server again. The
// layout of widgets is the user's saved one, or the standard one.
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ week?: string | string[]; tab?: string | string[] }> }) {
  const deps = await pageDeps();
  // The proxy already sends signed-out visitors away; the page checks again (R3).
  const userId = await deps.auth.currentUserId();
  if (!userId) redirect("/sign-in");

  const { week, tab } = await searchParams;
  // Everything in one transaction (src/lib/server/pages/load.ts).
  const { display, report, layout } = await loadAnalyticsTabsPage(deps, userId, typeof week === "string" ? week : undefined);

  return (
    <AppShell current="/analytics" display={display}>
      <AnalyticsScreen report={report} layout={layout} tab={tabOf(tab)} />
    </AppShell>
  );
}
