import "server-only";

// Free and Pro through Stripe in test mode (spec 24; ontology `upgrade_to_pro`, `cancel_pro`,
// `update_plan`, R5, R6, R25).
//
// upgrade_to_pro: same origin, signed in, plan free ("You already have Pro"), Stripe set up ("Payment
//   is not available right now."); answers the address of Stripe's checkout page. Nothing is saved:
//   the plan changes only when Stripe's signed message arrives (update_plan), never from the browser.
// cancel_pro: same origin, signed in, plan pro ("You do not have Pro"), Stripe set up; the subscription
//   ends after the paid period. The plan stays pro until Stripe says the subscription ended.
// update_plan: Stripe's message to our server. No session and no same-origin check (Stripe is not a
//   browser); the signature with our webhook secret is the check. A wrong signature, a message older
//   than five minutes or a live-mode message changes nothing (R1, R25).
import { MESSAGES } from "@/lib/messages";
import { appUrl } from "@/lib/server/config";
import type { Deps } from "@/lib/server/deps";
import type { Plan } from "@/lib/server/db/billing";
import { ActionError, handleAction } from "@/lib/server/errors";
import { assertSameOrigin, jsonError, jsonOk, readLimitedText } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { readTimeZone } from "@/lib/server/settings";
import { verifyEvent } from "@/lib/server/stripe/signature";
import type { StripeEvent } from "@/lib/server/stripe/types";

type Account = { plan: Plan; customerId: string | null };

async function readAccount(deps: Pick<Deps, "withUser">, userId: string): Promise<Account & { timeZone: string }> {
  return deps.withUser(userId, async (query) => {
    const [[row], timeZone] = await Promise.all([
      query<{ plan: Plan; stripe_customer_id: string | null }>("select plan, stripe_customer_id from app.profiles"),
      readTimeZone(query),
    ]);
    return { plan: row?.plan ?? "free", customerId: row?.stripe_customer_id ?? null, timeZone };
  });
}

const unavailable = () => new ActionError(503, "payment_unavailable", MESSAGES.paymentUnavailable);

/** Where Stripe sends the browser back to. The pricing page only shows a note; it changes nothing. */
export function returnUrls(): { successUrl: string; cancelUrl: string } {
  return { successUrl: `${appUrl()}/pricing?checkout=success`, cancelUrl: `${appUrl()}/pricing?checkout=cancelled` };
}

export function upgradeToPro(request: Request, deps: Pick<Deps, "auth" | "withUser" | "stripe">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);

    const account = await readAccount(deps, userId);
    if (account.plan === "pro") throw new ActionError(409, "already_pro", MESSAGES.alreadyPro);
    if (!deps.stripe) throw unavailable();

    const checkout = await deps.stripe.api.createCheckout({ userId, customerId: account.customerId, ...returnUrls() });
    if (!checkout.ok) throw unavailable();
    return jsonOk({ url: checkout.value.url });
  });
}

/** "16 December 2026", in the user's time zone. */
export function endDateText(endsAt: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone }).format(endsAt);
}

export function cancelPro(request: Request, deps: Pick<Deps, "auth" | "withUser" | "stripe">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;
    const userId = await requireUser(deps.auth);

    const account = await readAccount(deps, userId);
    if (account.plan !== "pro") throw new ActionError(409, "not_pro", MESSAGES.notPro);
    // Pro without a Stripe customer cannot be cancelled through Stripe (only set by hand in the database).
    if (!deps.stripe || !account.customerId) throw unavailable();

    const cancelled = await deps.stripe.api.cancelAtPeriodEnd(account.customerId);
    if (!cancelled.ok || cancelled.value === null) throw unavailable();
    const date = endDateText(cancelled.value.endsAt, account.timeZone);
    return jsonOk({ endsAt: cancelled.value.endsAt.toISOString(), message: `Pro ends on ${date}` });
  });
}

/** Stripe's messages are small; anything bigger is not one of them. */
const MAX_WEBHOOK_BYTES = 256 * 1024;

const ACTIVE = new Set(["active", "trialing"]);
const ENDED = new Set(["canceled", "unpaid", "incomplete_expired"]);

const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
/** A field that may be an id or the expanded object with that id. */
const idOf = (value: unknown): string | null => text(value) ?? text((value as { id?: unknown } | null)?.id);
const metadataUser = (object: Record<string, unknown>): string | null =>
  text((object.metadata as Record<string, unknown> | null | undefined)?.user_id);

/** What a verified event means for the plan, or null when it changes nothing. */
export function planChangeOf(event: StripeEvent): { userId: string | null; customerId: string | null; plan: Plan } | null {
  const object = event.object;
  const customerId = idOf(object.customer);
  switch (event.type) {
    case "checkout.session.completed":
      // Only a paid subscription checkout makes the user Pro.
      if (object.mode !== "subscription" || object.payment_status !== "paid") return null;
      return { userId: text(object.client_reference_id) ?? metadataUser(object), customerId, plan: "pro" };
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const status = text(object.status) ?? "";
      const plan: Plan | null = ACTIVE.has(status) ? "pro" : ENDED.has(status) ? "free" : null;
      return plan === null ? null : { userId: metadataUser(object), customerId, plan };
    }
    case "customer.subscription.deleted":
      return { userId: metadataUser(object), customerId, plan: "free" };
    default:
      return null;
  }
}

export function stripeWebhook(request: Request, deps: Pick<Deps, "stripe" | "billing" | "now">): Promise<Response> {
  return handleAction(async () => {
    if (!deps.stripe) {
      // Stripe tries again later; nothing changes now.
      console.error("Stripe message received, but Stripe is not set up on this server.");
      return jsonError(503, "payment_unavailable", MESSAGES.paymentUnavailable);
    }
    const body = await readLimitedText(request, MAX_WEBHOOK_BYTES);
    if (body.kind !== "ok") return jsonError(400, "bad_request", MESSAGES.badRequest);

    const event = verifyEvent(body.text, request.headers.get("stripe-signature"), deps.stripe.webhookSecret, deps.now());
    if (!event) {
      console.error("Stripe message refused: wrong or old signature.");
      return jsonError(400, "bad_signature", MESSAGES.badRequest);
    }
    if (event.livemode) {
      console.error("Stripe message refused: live mode (R25).");
      return jsonError(400, "live_mode", MESSAGES.badRequest);
    }

    const change = planChangeOf(event);
    if (!change) return jsonOk({ received: true });
    const userId = await deps.billing.applyPlan(change);
    if (!userId) console.error("Stripe message for no known user:", event.type);
    return jsonOk({ received: true });
  });
}
