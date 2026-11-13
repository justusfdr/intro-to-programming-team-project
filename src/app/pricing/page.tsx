import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PricingView } from "@/components/billing/PricingView";
import { AppShell } from "@/components/shell/AppShell";
import { pageDeps } from "@/lib/server/deps";
import { loadPricingPage } from "@/lib/server/pages/load";

export const metadata: Metadata = { title: "Plans" };

// The pricing page (spec 24): Free and Pro. Reads only; Stripe's return here (?checkout=success)
// changes nothing, the plan changes on Stripe's signed message (R25).
export default async function PricingPage({ searchParams }: { searchParams: Promise<{ checkout?: string | string[] }> }) {
  const deps = await pageDeps();
  // The proxy already sends signed-out visitors away; the page checks again (R3).
  const userId = await deps.auth.currentUserId();
  if (!userId) redirect("/sign-in");

  const { checkout } = await searchParams;
  const data = await loadPricingPage(deps, userId);

  return (
    <AppShell current="/settings" display={data.display}>
      <PricingView plan={data.plan} paymentReady={data.paymentReady} checkout={typeof checkout === "string" ? checkout : undefined} />
    </AppShell>
  );
}
