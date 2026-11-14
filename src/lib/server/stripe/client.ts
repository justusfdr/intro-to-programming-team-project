import "server-only";

// The Stripe module: the only place that talks to Stripe's API (AGENTS.md: one module per service).
// Plain `fetch` with form-encoded bodies, as Stripe's API expects; no extra package. A 10-second
// timeout per call. The secret key comes from config.ts and is never logged; only the kind of a
// failure and its HTTP status are logged, never what was sent or answered.
//
// One subscription per user (Issue #42): every checkout goes to the user's one Stripe customer, a new
// checkout is refused while the customer has a live subscription or an open checkout, and "Cancel Pro"
// cancels every subscription that has not ended. What is left: two clicks in the same split second can
// both pass the check before either session exists; "Cancel Pro" then still cancels both.
import { stripeConfig, type StripeConfig } from "@/lib/server/config";
import type { CheckoutRequest, CheckoutStart, Stripe, StripeApi, StripeResult } from "./types";

const API = "https://api.stripe.com/v1";
const TIMEOUT_MS = 10_000;
/**
 * How long our checkout page stays open if nobody pays. Stripe's shortest is 30 minutes; a minute more
 * so a slow clock never asks for less. An abandoned checkout blocks a new one only this long.
 */
const CHECKOUT_OPEN_MS = 31 * 60_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Subscriptions that are over: nothing to cancel, and they do not stop a new checkout. */
const ENDED = new Set(["canceled", "incomplete_expired"]);
/** Subscriptions that mean "you already have Pro, or a payment is still open". */
const BLOCKS_CHECKOUT = new Set(["active", "trialing", "past_due", "incomplete"]);

type StripeObject = Record<string, unknown>;

/** The objects of one of Stripe's lists or search answers. */
const listOf = (answer: StripeObject): StripeObject[] =>
  ((answer.data as unknown[] | undefined) ?? []).filter(
    (item): item is StripeObject => typeof item === "object" && item !== null && typeof (item as StripeObject).id === "string",
  );

/** Stripe's search query for objects with our user id in their metadata. Only called with a checked UUID. */
const taggedWith = (userId: string) => `metadata['user_id']:'${userId}'`;

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
    expires_at: request.expiresAt ? Math.floor(request.expiresAt.getTime() / 1000) : null,
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

/** The single calls behind StripeApi. The app uses StripeApi; the tests also check these on their own. */
export type StripeCalls = {
  /** One Checkout session with exactly the given request (no checks; startCheckout checks first). */
  createCheckout(request: CheckoutRequest): Promise<StripeResult<{ url: string }>>;
  /**
   * The first version of "Cancel Pro": only the customer's first active subscription. The app no longer
   * calls it (Issue #42: a second subscription stayed uncancellable); it is kept because its tests pin
   * its exact requests. Remove both together once the team agrees.
   */
  cancelAtPeriodEnd(customerId: string): Promise<StripeResult<{ endsAt: Date } | null>>;
};

type CallOptions = { timeoutMs?: number; idempotencyKey?: string };

/**
 * `testing` lets the tests hand in a stand-in for the network (they never call the real service) and a
 * clock for the checkout's closing time.
 */
export function createStripeApi(config: StripeConfig, testing: { fetch?: typeof fetch; now?: () => Date } = {}): StripeApi & StripeCalls {
  const send = testing.fetch ?? fetch;
  const now = testing.now ?? (() => new Date());

  async function call(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: string,
    options: CallOptions = {},
  ): Promise<StripeResult<StripeObject>> {
    let response: Response;
    try {
      response = await send(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${config.secretKey}`,
          ...(body === undefined ? {} : { "Content-Type": "application/x-www-form-urlencoded" }),
          // Stripe answers a repeated request with the same key with the first answer (for 24 hours).
          ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
        },
        body,
        signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
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

  async function createCheckout(request: CheckoutRequest): Promise<StripeResult<{ url: string }>> {
    const answer = await call("POST", "/checkout/sessions", formBody(checkoutFields(config.priceId, request)));
    if (!answer.ok) return answer;
    const url = answer.value.url;
    if (typeof url !== "string" || !url.startsWith("https://")) return { ok: false, reason: "no_url" };
    return { ok: true, value: { url } };
  }

  /**
   * The user's one Stripe customer: the oldest with our user id in its metadata, else a new one. The
   * idempotency key makes a second "create" within 24 hours (another tab, before Stripe's search sees
   * the first) answer the same customer instead of a new one. The id is not saved here: as before, only
   * Stripe's signed message saves it on the user (spec 24, R6).
   */
  async function customerFor(userId: string): Promise<StripeResult<string>> {
    const found = await call("GET", `/customers/search?${new URLSearchParams({ query: taggedWith(userId), limit: "10" })}`);
    if (!found.ok) return found;
    const created = (customer: StripeObject) => (typeof customer.created === "number" ? customer.created : Infinity);
    const [oldest] = listOf(found.value).sort((a, b) => created(a) - created(b));
    if (oldest) return { ok: true, value: oldest.id as string };
    const made = await call("POST", "/customers", formBody({ "metadata[user_id]": userId }), {
      idempotencyKey: `lockedin-customer-${userId}`,
    });
    if (!made.ok) return made;
    return typeof made.value.id === "string" ? { ok: true, value: made.value.id } : { ok: false, reason: "no_customer_id" };
  }

  /**
   * Every subscription of the user that has not ended: the customer's, and those with our user id in
   * their metadata (a second customer from before Issue #42 was fixed). Each one once.
   */
  async function subscriptionsOf(customerId: string, userId: string, timeoutMs?: number): Promise<StripeResult<StripeObject[]>> {
    if (!UUID.test(userId)) return { ok: false, reason: "bad_user_id" };
    const [own, tagged] = await Promise.all([
      call("GET", `/subscriptions?${new URLSearchParams({ customer: customerId, status: "all", limit: "100" })}`, undefined, { timeoutMs }),
      call("GET", `/subscriptions/search?${new URLSearchParams({ query: taggedWith(userId), limit: "100" })}`, undefined, { timeoutMs }),
    ]);
    if (!own.ok) return own;
    if (!tagged.ok) return tagged;
    const byId = new Map<string, StripeObject>();
    for (const subscription of [...listOf(own.value), ...listOf(tagged.value)]) byId.set(subscription.id as string, subscription);
    return { ok: true, value: [...byId.values()].filter((subscription) => !ENDED.has(String(subscription.status))) };
  }

  return {
    createCheckout,

    async startCheckout(request): Promise<StripeResult<CheckoutStart>> {
      if (!UUID.test(request.userId)) return { ok: false, reason: "bad_user_id" };
      const customer = request.customerId ? { ok: true as const, value: request.customerId } : await customerFor(request.userId);
      if (!customer.ok) return customer;

      const [subscriptions, sessions] = await Promise.all([
        subscriptionsOf(customer.value, request.userId),
        call("GET", `/checkout/sessions?${new URLSearchParams({ customer: customer.value, status: "open", limit: "10" })}`),
      ]);
      if (!subscriptions.ok) return subscriptions;
      if (!sessions.ok) return sessions;
      const paying = subscriptions.value.some((subscription) => BLOCKS_CHECKOUT.has(String(subscription.status)));
      const open = listOf(sessions.value).some((session) => session.mode === "subscription");
      if (paying || open) return { ok: true, value: { kind: "already_open" } };

      const expiresAt = new Date(now().getTime() + CHECKOUT_OPEN_MS);
      const created = await createCheckout({ ...request, customerId: customer.value, expiresAt });
      if (!created.ok) return created;
      return { ok: true, value: { kind: "created", url: created.value.url } };
    },

    async cancelAllAtPeriodEnd(customerId, userId) {
      const subscriptions = await subscriptionsOf(customerId, userId);
      if (!subscriptions.ok) return subscriptions;
      let latest: Date | null = null;
      let failed: string | null = null;
      // Every one is tried, so one failure does not leave the others running; asking again is harmless.
      for (const subscription of subscriptions.value) {
        const path = `/subscriptions/${encodeURIComponent(subscription.id as string)}`;
        if (subscription.status === "incomplete") {
          // Never paid: there is no paid period to keep, so it stops now.
          const stopped = await call("DELETE", path);
          if (!stopped.ok) failed = stopped.reason;
          continue;
        }
        const updated =
          subscription.cancel_at_period_end === true
            ? { ok: true as const, value: subscription }
            : await call("POST", path, formBody({ cancel_at_period_end: true }));
        if (!updated.ok) {
          failed = updated.reason;
          continue;
        }
        const endsAt = endOfSubscription(updated.value);
        if (!endsAt) failed = "no_period_end";
        else if (!latest || endsAt > latest) latest = endsAt;
      }
      if (failed) return { ok: false, reason: failed };
      return { ok: true, value: latest ? { endsAt: latest } : null };
    },

    async scheduledEnd(customerId, userId, timeoutMs) {
      const subscriptions = await subscriptionsOf(customerId, userId, timeoutMs);
      if (!subscriptions.ok) return subscriptions;
      // An unpaid first try ("incomplete") gives no Pro, so it does not decide when Pro ends.
      const live = subscriptions.value.filter((subscription) => subscription.status !== "incomplete");
      let latest: Date | null = null;
      for (const subscription of live) {
        const ending = subscription.cancel_at_period_end === true || typeof subscription.cancel_at === "number";
        const endsAt = ending ? endOfSubscription(subscription) : null;
        // One that still renews (or whose end we cannot read) means Pro does not end.
        if (!endsAt) return { ok: true, value: null };
        if (!latest || endsAt > latest) latest = endsAt;
      }
      return { ok: true, value: latest ? { endsAt: latest } : null };
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
