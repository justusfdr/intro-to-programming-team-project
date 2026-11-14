import { stripeWebhook } from "@/lib/server/actions/billing";
import { billingStore } from "@/lib/server/db";
import { realStripe } from "@/lib/server/stripe/client";

// Stripe's messages to our server (update_plan, spec 24). Stripe has no session with us, so this route
// is public in src/lib/route-guard.ts; the signature check in the action is what protects it.
export async function POST(request: Request): Promise<Response> {
  return stripeWebhook(request, { stripe: realStripe(), billing: billingStore, now: () => new Date() });
}
