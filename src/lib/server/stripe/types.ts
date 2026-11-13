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
};

export interface StripeApi {
  /** A Checkout session for the monthly Pro price; its address is where the browser goes to pay. */
  createCheckout(request: CheckoutRequest): Promise<StripeResult<{ url: string }>>;
  /**
   * Lets the customer's active subscription end after the paid period. The value is when it ends,
   * or null when the customer has no active subscription.
   */
  cancelAtPeriodEnd(customerId: string): Promise<StripeResult<{ endsAt: Date } | null>>;
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
