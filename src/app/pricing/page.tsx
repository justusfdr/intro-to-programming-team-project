import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PricingView } from "@/components/billing/PricingView";
import { AppShell } from "@/components/shell/AppShell";
import { proEndsOn } from "@/lib/server/actions/billing";
import { pageDeps } from "@/lib/server/deps";
import { loadPricingPage } from "@/lib/server/pages/load";

export const metadata: Metadata = { title: "Pricing" };

// The pricing page (spec 24): Free and Pro. Reads only; Stripe's return here (?checkout=success)
// changes nothing, the plan changes on Stripe's signed message (R25). For a Pro user it asks Stripe
// whether Pro is set to end, so "Pro ends on ..." is still there after a reload (Issue #43); when Stripe
// does not answer within two seconds the page shows as before.
export default async function PricingPage({ searchParams }: { searchParams: Promise<{ checkout?: string | string[] }> }) {
  const deps = await pageDeps();
  // The proxy already sends signed-out visitors away; the page checks again (R3).
  const userId = await deps.auth.currentUserId();
  if (!userId) redirect("/sign-in");

  const { checkout } = await searchParams;
  const [data, endsOn] = await Promise.all([loadPricingPage(deps, userId), proEndsOn(deps, userId)]);

  return (
    <AppShell current="/pricing" display={data.display}>
      <PricingView
        plan={data.plan}
        paymentReady={data.paymentReady}
        endsOn={endsOn}
        checkout={typeof checkout === "string" ? checkout : undefined}
      />
    </AppShell>
  );
}
