import "server-only";

// What the app needs from Stripe (spec 24). The real module (client.ts) talks to Stripe's API; the
// tests use the fake (fake.ts) and never call the real service.

/** A Stripe call either worked or failed for a reason we log (never the key, never what was sent). */
export type StripeResult<T> = { ok: true; value: T } | { ok: false; reason: string };

export type CheckoutRequest = {
  /** Our user id: sent as client_reference_id and in the subscription's metadata. */
  userId: string;
  /** The user's saved Stripe customer, so a returning customer is not created twice. */
  customerId: string | null;
  successUrl: string;
  cancelUrl: string;
  /** When Stripe closes the checkout page if nobody pays (at least 30 minutes away). */
  expiresAt?: Date;
};

/** What starting a checkout gave: Stripe's address, or a refusal because Pro is already bought or being paid for. */
export type CheckoutStart = { kind: "created"; url: string } | { kind: "already_open" };

export interface StripeApi {
  /**
   * A Checkout session for the monthly Pro price, for the user's one Stripe customer (Issue #42). Without
   * a saved customer, the customer with our user id in its metadata is used, or made. Before anything is
   * created, Stripe is asked whether this customer already has a live subscription or an open checkout;
   * then the answer is "already_open" and no session is made.
   */
  startCheckout(request: CheckoutRequest): Promise<StripeResult<CheckoutStart>>;
  /**
   * Lets every subscription of the user that has not ended stop after its paid period: the ones of the
   * saved customer and the ones with our user id in their metadata (Issue #42). The value is the latest
   * end, or null when there was nothing to cancel.
   */
  cancelAllAtPeriodEnd(customerId: string, userId: string): Promise<StripeResult<{ endsAt: Date } | null>>;
  /**
   * When Pro ends, if every live subscription of the user is set to end after its paid period; null when
   * one still renews or there is none (Issue #43). `timeoutMs` keeps a page from waiting long for Stripe.
   */
  scheduledEnd(customerId: string, userId: string, timeoutMs?: number): Promise<StripeResult<{ endsAt: Date } | null>>;
}

/** Stripe as the server sees it: the API and the secret that signs Stripe's messages to us. */
export type Stripe = { api: StripeApi; webhookSecret: string };

/** A message from Stripe whose signature was checked (signature.ts). */
export type StripeEvent = {
  id: string;
  type: string;
  livemode: boolean;
  /** `data.object` of the event: the checkout session or the subscription it is about. */
  object: Record<string, unknown>;
};
