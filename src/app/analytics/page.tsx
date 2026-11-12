import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AnalyticsView } from "@/components/analytics/AnalyticsView";
import { AppShell } from "@/components/shell/AppShell";
import { loadAnalytics } from "@/lib/server/analytics/load";
import { pageDeps } from "@/lib/server/deps";
import { readDisplay } from "@/lib/server/settings";

export const metadata: Metadata = { title: "Analytics" };

// The Analytics page (spec 06). Read only: it saves nothing.
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ week?: string | string[] }> }) {
  const deps = await pageDeps();
  // The proxy already sends signed-out visitors away; the page checks again (R3).
  const userId = await deps.auth.currentUserId();
  if (!userId) redirect("/sign-in");
  const display = await deps.withUser(userId, readDisplay);

  const { week } = await searchParams;
  const data = await loadAnalytics(deps, userId, typeof week === "string" ? week : undefined);

  return (
    <AppShell current="/analytics" display={display}>
      <AnalyticsView data={data} />
    </AppShell>
  );
}
