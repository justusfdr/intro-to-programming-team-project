// Tests for the Stripe module (spec 24) with a stand-in for the network: what it sends, and how each
// answer or failure comes back. No test calls the real service. Also R25: only test-mode keys count.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stripeConfig } from "@/lib/server/config";
import { checkoutFields, createStripeApi, endOfSubscription } from "./client";

const CONFIG = { secretKey: "sk_test_not_a_real_key", webhookSecret: "whsec_x", priceId: "price_PRO" };
const USER = "11111111-1111-4111-8111-111111111111";
const URLS = { successUrl: "http://localhost:3000/pricing?checkout=success", cancelUrl: "http://localhost:3000/pricing?checkout=cancelled" };

type Sent = { url: string; method: string; headers: Headers; body: URLSearchParams | null };

function network(answers: Array<{ status: number; body: unknown } | Error>) {
  const sent: Sent[] = [];
  const fake = (async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: init?.body ? new URLSearchParams(String(init.body)) : null,
    });
    const answer = answers.shift() ?? { status: 500, body: {} };
    if (answer instanceof Error) throw answer;
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fake, sent };
}

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errors.mockRestore();
  vi.unstubAllEnvs();
});

/** Everything that was logged, as one string. */
const logged = () => JSON.stringify(errors.mock.calls);

describe("createCheckout", () => {
  it("asks for a monthly subscription to the Pro price, for our user, and answers Stripe's address", async () => {
    const { fake, sent } = network([{ status: 200, body: { id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1" } }]);
    const api = createStripeApi(CONFIG, { fetch: fake });
    expect(await api.createCheckout({ userId: USER, customerId: null, ...URLS })).toEqual({
      ok: true,
      value: { url: "https://checkout.stripe.com/c/pay/cs_1" },
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(sent[0].method).toBe("POST");
    expect(sent[0].headers.get("authorization")).toBe(`Bearer ${CONFIG.secretKey}`);
    expect(Object.fromEntries(sent[0].body!)).toEqual({
      mode: "subscription",
      "line_items[0][price]": "price_PRO",
      "line_items[0][quantity]": "1",
      client_reference_id: USER,
      "metadata[user_id]": USER,
      "subscription_data[metadata][user_id]": USER,
      success_url: URLS.successUrl,
      cancel_url: URLS.cancelUrl,
    });
  });

  it("sends the saved customer so a returning customer is not created twice", () => {
    expect(checkoutFields("price_PRO", { userId: USER, customerId: "cus_A1", ...URLS }).customer).toBe("cus_A1");
  });

  it("fails on an error answer, a missing address, a timeout or no connection, and logs no key", async () => {
    for (const answer of [
      { status: 401, body: { error: { message: "Invalid API Key provided: sk_test_***" } } },
      { status: 200, body: { id: "cs_1" } },
      Object.assign(new Error("timed out"), { name: "TimeoutError" }),
      new TypeError("fetch failed"),
    ]) {
      const api = createStripeApi(CONFIG, { fetch: network([answer]).fake });
      const result = await api.createCheckout({ userId: USER, customerId: null, ...URLS });
      expect(result.ok).toBe(false);
    }
    expect(logged()).not.toContain(CONFIG.secretKey);
    expect(logged()).not.toContain("Invalid API Key");
  });
});

describe("cancelAtPeriodEnd", () => {
  it("finds the customer's active subscription and lets it end after the paid period", async () => {
    const end = Date.parse("2026-12-16T09:00:00Z") / 1000;
    const { fake, sent } = network([
      { status: 200, body: { data: [{ id: "sub_1", status: "active" }] } },
      { status: 200, body: { id: "sub_1", cancel_at_period_end: true, cancel_at: end } },
    ]);
    const result = await createStripeApi(CONFIG, { fetch: fake }).cancelAtPeriodEnd("cus_A1");
    expect(result).toEqual({ ok: true, value: { endsAt: new Date(end * 1000) } });
    expect(sent[0].method).toBe("GET");
    expect(sent[0].url).toBe("https://api.stripe.com/v1/subscriptions?customer=cus_A1&status=active&limit=1");
    expect(sent[1].method).toBe("POST");
    expect(sent[1].url).toBe("https://api.stripe.com/v1/subscriptions/sub_1");
    expect(Object.fromEntries(sent[1].body!)).toEqual({ cancel_at_period_end: "true" });
  });

  it("answers null when the customer has no active subscription, and changes nothing", async () => {
    const { fake, sent } = network([{ status: 200, body: { data: [] } }]);
    expect(await createStripeApi(CONFIG, { fetch: fake }).cancelAtPeriodEnd("cus_A1")).toEqual({ ok: true, value: null });
    expect(sent).toHaveLength(1);
  });

  it("reads the end of the period from the subscription or its first item", () => {
    expect(endOfSubscription({ current_period_end: 100 })).toEqual(new Date(100_000));
    expect(endOfSubscription({ items: { data: [{ current_period_end: 200 }] } })).toEqual(new Date(200_000));
    expect(endOfSubscription({ cancel_at: 300, current_period_end: 100 })).toEqual(new Date(300_000));
    expect(endOfSubscription({})).toBeNull();
  });
});

describe("stripeConfig (R25: test mode only)", () => {
  function set(values: Record<string, string>) {
    for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
  }

  it("uses a test-mode key with the webhook secret and the price", () => {
    set({ STRIPE_SECRET_KEY: "sk_test_abc", STRIPE_WEBHOOK_SECRET: "whsec_abc", STRIPE_PRICE_ID: "price_abc" });
    expect(stripeConfig()).toEqual({ secretKey: "sk_test_abc", webhookSecret: "whsec_abc", priceId: "price_abc" });
  });

  it("turns payment off for a live key, and logs why without the key", () => {
    set({ STRIPE_SECRET_KEY: "sk_live_secret_value", STRIPE_WEBHOOK_SECRET: "whsec_abc", STRIPE_PRICE_ID: "price_abc" });
    expect(stripeConfig()).toBeNull();
    expect(logged()).toContain("R25");
    expect(logged()).not.toContain("sk_live_secret_value");
    set({ STRIPE_SECRET_KEY: "rk_test_restricted" });
    expect(stripeConfig()).toBeNull();
  });

  it("turns payment off when any of the three is missing", () => {
    for (const missing of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_ID"]) {
      set({ STRIPE_SECRET_KEY: "sk_test_abc", STRIPE_WEBHOOK_SECRET: "whsec_abc", STRIPE_PRICE_ID: "price_abc", [missing]: "" });
      expect(stripeConfig(), missing).toBeNull();
    }
  });
});
