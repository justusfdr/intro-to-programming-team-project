import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AnalyticsView } from "@/components/analytics/AnalyticsView";
import { AppShell } from "@/components/shell/AppShell";
import { pageDeps } from "@/lib/server/deps";
import { loadAnalyticsPage } from "@/lib/server/pages/load";

export const metadata: Metadata = { title: "Analytics" };

// The Analytics page (spec 06). Read only: it saves nothing.
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ week?: string | string[] }> }) {
  const deps = await pageDeps();
  // The proxy already sends signed-out visitors away; the page checks again (R3).
  const userId = await deps.auth.currentUserId();
  if (!userId) redirect("/sign-in");

  const { week } = await searchParams;
  // Everything in one transaction (src/lib/server/pages/load.ts).
  const { display, analytics: data } = await loadAnalyticsPage(deps, userId, typeof week === "string" ? week : undefined);

  return (
    <AppShell current="/analytics" display={display}>
      <AnalyticsView data={data} />
    </AppShell>
  );
}
