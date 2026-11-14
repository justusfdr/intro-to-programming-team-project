import "server-only";

// A stand-in for Stripe in tests: answers what the test tells it to and remembers every request, so a
// test can check what would have been sent and that Stripe was not called at all.
import type { CheckoutRequest, Stripe, StripeApi, StripeResult } from "./types";

/** The webhook secret in tests. Not a secret. */
export const TEST_WEBHOOK_SECRET = "whsec_test_secret_for_the_tests";

export class FakeStripeApi implements StripeApi {
  readonly checkouts: CheckoutRequest[] = [];
  readonly cancels: string[] = [];
  /** The next answers; without one, a call succeeds. */
  nextCheckout: StripeResult<{ url: string }> | null = null;
  nextCancel: StripeResult<{ endsAt: Date } | null> | null = null;

  async createCheckout(request: CheckoutRequest): Promise<StripeResult<{ url: string }>> {
    this.checkouts.push(request);
    return this.nextCheckout ?? { ok: true, value: { url: `https://checkout.stripe.test/c/${this.checkouts.length}` } };
  }

  async cancelAtPeriodEnd(customerId: string): Promise<StripeResult<{ endsAt: Date } | null>> {
    this.cancels.push(customerId);
    return this.nextCancel ?? { ok: true, value: { endsAt: new Date("2026-12-16T09:00:00Z") } };
  }

  reset(): void {
    this.checkouts.length = 0;
    this.cancels.length = 0;
    this.nextCheckout = null;
    this.nextCancel = null;
  }
}

export function fakeStripe(api = new FakeStripeApi()): Stripe & { api: FakeStripeApi } {
  return { api, webhookSecret: TEST_WEBHOOK_SECRET };
}
