import "server-only";

// A stand-in for Stripe in tests: answers what the test tells it to and remembers every request, so a
// test can check what would have been sent and that Stripe was not called at all. Like Stripe after
// Issue #42, it keeps one open checkout per user: a second checkout while one is open, or while the user
// has a subscription, answers "already_open" and opens nothing.
import type { CheckoutRequest, CheckoutStart, Stripe, StripeApi, StripeResult } from "./types";

/** The webhook secret in tests. Not a secret. */
export const TEST_WEBHOOK_SECRET = "whsec_test_secret_for_the_tests";

export class FakeStripeApi implements StripeApi {
  /** Every checkout the app asked for, also the refused ones. */
  readonly checkouts: CheckoutRequest[] = [];
  readonly cancels: string[] = [];
  /** The customers whose end of Pro the app asked for. */
  readonly endLookups: string[] = [];
  /** Users with an open checkout page or a subscription, as Stripe would see them. */
  readonly paying = new Set<string>();
  /** The next answers; without one, a call succeeds. */
  nextCheckout: StripeResult<{ url: string }> | null = null;
  nextCancel: StripeResult<{ endsAt: Date } | null> | null = null;
  /** What scheduledEnd answers; by default nothing is set to end. */
  nextEnd: StripeResult<{ endsAt: Date } | null> = { ok: true, value: null };
  private opened = 0;

  async startCheckout(request: CheckoutRequest): Promise<StripeResult<CheckoutStart>> {
    this.checkouts.push(request);
    if (this.nextCheckout && !this.nextCheckout.ok) return this.nextCheckout;
    if (this.paying.has(request.userId)) return { ok: true, value: { kind: "already_open" } };
    this.paying.add(request.userId);
    this.opened += 1;
    const url = this.nextCheckout?.value.url ?? `https://checkout.stripe.test/c/${this.opened}`;
    return { ok: true, value: { kind: "created", url } };
  }

  async cancelAllAtPeriodEnd(customerId: string): Promise<StripeResult<{ endsAt: Date } | null>> {
    this.cancels.push(customerId);
    return this.nextCancel ?? { ok: true, value: { endsAt: new Date("2026-12-16T09:00:00Z") } };
  }

  async scheduledEnd(customerId: string): Promise<StripeResult<{ endsAt: Date } | null>> {
    this.endLookups.push(customerId);
    return this.nextEnd;
  }

  reset(): void {
    this.checkouts.length = 0;
    this.cancels.length = 0;
    this.endLookups.length = 0;
    this.paying.clear();
    this.nextCheckout = null;
    this.nextCancel = null;
    this.nextEnd = { ok: true, value: null };
    this.opened = 0;
  }
}

export function fakeStripe(api = new FakeStripeApi()): Stripe & { api: FakeStripeApi } {
  return { api, webhookSecret: TEST_WEBHOOK_SECRET };
}
