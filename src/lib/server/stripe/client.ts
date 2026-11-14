import "server-only";

// The Stripe module: the only place that talks to Stripe's API (AGENTS.md: one module per service).
// Plain `fetch` with form-encoded bodies, as Stripe's API expects; no extra package. A 10-second
// timeout per call. The secret key comes from config.ts and is never logged; only the kind of a
// failure and its HTTP status are logged, never what was sent or answered.
import { stripeConfig, type StripeConfig } from "@/lib/server/config";
import type { CheckoutRequest, Stripe, StripeApi, StripeResult } from "./types";

const API = "https://api.stripe.com/v1";
const TIMEOUT_MS = 10_000;

/** Stripe's form encoding of a flat list of fields ("line_items[0][price]" and so on). */
export function formBody(fields: Record<string, string | number | boolean | null | undefined>): string {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) continue;
    body.append(key, String(value));
  }
  return body.toString();
}

/** The fields of the Checkout session for Pro, built separately so a test can check them. */
export function checkoutFields(priceId: string, request: CheckoutRequest): Record<string, string | number | null> {
  return {
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": 1,
    client_reference_id: request.userId,
    "metadata[user_id]": request.userId,
    "subscription_data[metadata][user_id]": request.userId,
    customer: request.customerId,
    success_url: request.successUrl,
    cancel_url: request.cancelUrl,
  };
}

/** When a subscription set to cancel ends: `cancel_at`, else the end of the current period. */
export function endOfSubscription(subscription: Record<string, unknown>): Date | null {
  const items = (subscription.items as { data?: Array<Record<string, unknown>> } | undefined)?.data ?? [];
  // Newer API versions keep the period on the subscription's items; older ones on the subscription.
  const seconds = [subscription.cancel_at, items[0]?.current_period_end, subscription.current_period_end].find(
    (value): value is number => typeof value === "number" && value > 0,
  );
  return seconds === undefined ? null : new Date(seconds * 1000);
}

/** `testing` lets the tests hand in a stand-in for the network (they never call the real service). */
export function createStripeApi(config: StripeConfig, testing: { fetch?: typeof fetch } = {}): StripeApi {
  const send = testing.fetch ?? fetch;

  async function call(method: "GET" | "POST", path: string, body?: string): Promise<StripeResult<Record<string, unknown>>> {
    let response: Response;
    try {
      response = await send(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${config.secretKey}`,
          ...(body === undefined ? {} : { "Content-Type": "application/x-www-form-urlencoded" }),
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      const kind = error instanceof Error && error.name === "TimeoutError" ? "timeout" : "connection";
      console.error("Stripe call failed:", kind);
      return { ok: false, reason: kind };
    }
    if (!response.ok) {
      console.error("Stripe call failed:", "status", response.status);
      return { ok: false, reason: `status_${response.status}` };
    }
    try {
      return { ok: true, value: (await response.json()) as Record<string, unknown> };
    } catch {
      console.error("Stripe call failed:", "not_json");
      return { ok: false, reason: "not_json" };
    }
  }

  return {
    async createCheckout(request) {
      const answer = await call("POST", "/checkout/sessions", formBody(checkoutFields(config.priceId, request)));
      if (!answer.ok) return answer;
      const url = answer.value.url;
      if (typeof url !== "string" || !url.startsWith("https://")) return { ok: false, reason: "no_url" };
      return { ok: true, value: { url } };
    },

    async cancelAtPeriodEnd(customerId) {
      const query = new URLSearchParams({ customer: customerId, status: "active", limit: "1" });
      const list = await call("GET", `/subscriptions?${query}`);
      if (!list.ok) return list;
      const first = (list.value.data as Array<Record<string, unknown>> | undefined)?.[0];
      if (!first || typeof first.id !== "string") return { ok: true, value: null };
      const updated = await call("POST", `/subscriptions/${encodeURIComponent(first.id)}`, formBody({ cancel_at_period_end: true }));
      if (!updated.ok) return updated;
      const endsAt = endOfSubscription(updated.value);
      if (!endsAt) return { ok: false, reason: "no_period_end" };
      return { ok: true, value: { endsAt } };
    },
  };
}

/** Stripe for this server, or null when it is not set up (or not in test mode, R25). */
export function realStripe(): Stripe | null {
  const config = stripeConfig();
  if (!config) return null;
  return { api: createStripeApi(config), webhookSecret: config.webhookSecret };
}
