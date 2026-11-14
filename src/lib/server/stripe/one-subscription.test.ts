// Tests for one subscription per user (Issue #42) and for reading when Pro ends (Issue #43) in the
// Stripe module, with a stand-in for the network that answers by address. No test calls the real service.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStripeApi } from "./client";

const CONFIG = { secretKey: "sk_test_not_a_real_key", webhookSecret: "whsec_x", priceId: "price_PRO" };
const USER = "11111111-1111-4111-8111-111111111111";
const URLS = { successUrl: "http://localhost:3000/pricing?checkout=success", cancelUrl: "http://localhost:3000/pricing?checkout=cancelled" };
const NOW = new Date("2026-11-16T09:00:00Z");
const END_1 = Date.parse("2026-12-16T09:00:00Z") / 1000;
const END_2 = Date.parse("2026-12-20T09:00:00Z") / 1000;

type Sent = { method: string; path: string; query: URLSearchParams; headers: Headers; body: Record<string, string> };
type Answer = { status: number; body: unknown } | "hang";

/** Answers by "METHOD /path" (without the query); an address without an answer gets a 500. */
function stripeAt(answers: Record<string, Answer | ((sent: Sent) => Answer)>) {
  const sent: Sent[] = [];
  const fake = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const request: Sent = {
      method: init?.method ?? "GET",
      path: url.pathname.replace("/v1", ""),
      query: url.searchParams,
      headers: new Headers(init?.headers),
      body: init?.body ? Object.fromEntries(new URLSearchParams(String(init.body))) : {},
    };
    sent.push(request);
    const entry = answers[`${request.method} ${request.path}`];
    const answer = (typeof entry === "function" ? entry(request) : entry) ?? { status: 500, body: {} };
    if (answer === "hang") {
      // Like a Stripe that does not answer: only the timeout ends the wait.
      return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)));
    }
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { api: createStripeApi(CONFIG, { fetch: fake, now: () => NOW }), sent };
}

const list = (...data: unknown[]) => ({ status: 200, body: { data } });
const NONE = list();
const SESSION = { status: 200, body: { id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1" } };
const posts = (sent: Sent[], path: string) => sent.filter((s) => s.method === "POST" && s.path === path);

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("startCheckout: one customer per user", () => {
  it("makes the customer first, with our user id and a fixed idempotency key, and always sends it to the checkout", async () => {
    const { api, sent } = stripeAt({
      "GET /customers/search": NONE,
      "POST /customers": { status: 200, body: { id: "cus_New1" } },
      "GET /subscriptions": NONE,
      "GET /subscriptions/search": NONE,
      "GET /checkout/sessions": NONE,
      "POST /checkout/sessions": SESSION,
    });
    expect(await api.startCheckout({ userId: USER, customerId: null, ...URLS })).toEqual({
      ok: true,
      value: { kind: "created", url: "https://checkout.stripe.com/c/pay/cs_1" },
    });
    expect(sent.find((s) => s.path === "/customers/search")!.query.get("query")).toBe(`metadata['user_id']:'${USER}'`);
    const [customer] = posts(sent, "/customers");
    expect(customer.body).toEqual({ "metadata[user_id]": USER });
    expect(customer.headers.get("idempotency-key")).toBe(`lockedin-customer-${USER}`);
    const [checkout] = posts(sent, "/checkout/sessions");
    expect(checkout.body.customer).toBe("cus_New1");
    expect(checkout.body.client_reference_id).toBe(USER);
    // Closes after 31 minutes if nobody pays, so an abandoned checkout does not block a new one for a day.
    expect(Number(checkout.body.expires_at)).toBe(NOW.getTime() / 1000 + 31 * 60);
  });

  it("finds the user's existing customer (the oldest) instead of making another", async () => {
    const { api, sent } = stripeAt({
      "GET /customers/search": list({ id: "cus_Late2", created: 200 }, { id: "cus_Early1", created: 100 }),
      "GET /subscriptions": NONE,
      "GET /subscriptions/search": NONE,
      "GET /checkout/sessions": NONE,
      "POST /checkout/sessions": SESSION,
    });
    expect((await api.startCheckout({ userId: USER, customerId: null, ...URLS })).ok).toBe(true);
    expect(posts(sent, "/customers")).toEqual([]);
    expect(posts(sent, "/checkout/sessions")[0].body.customer).toBe("cus_Early1");
  });

  it("uses the saved customer without searching", async () => {
    const { api, sent } = stripeAt({
      "GET /subscriptions": NONE,
      "GET /subscriptions/search": NONE,
      "GET /checkout/sessions": NONE,
      "POST /checkout/sessions": SESSION,
    });
    expect((await api.startCheckout({ userId: USER, customerId: "cus_Saved1", ...URLS })).ok).toBe(true);
    expect(sent.some((s) => s.path.startsWith("/customers"))).toBe(false);
    expect(sent.find((s) => s.path === "/subscriptions")!.query.get("customer")).toBe("cus_Saved1");
    expect(sent.find((s) => s.path === "/checkout/sessions" && s.method === "GET")!.query.get("status")).toBe("open");
    expect(posts(sent, "/checkout/sessions")[0].body.customer).toBe("cus_Saved1");
  });

  it.each(["active", "trialing", "past_due", "incomplete"])("opens no second checkout while a subscription is %s", async (status) => {
    const { api, sent } = stripeAt({
      "GET /subscriptions": list({ id: "sub_1", status }),
      "GET /subscriptions/search": NONE,
      "GET /checkout/sessions": NONE,
      "POST /checkout/sessions": SESSION,
    });
    expect(await api.startCheckout({ userId: USER, customerId: "cus_Saved1", ...URLS })).toEqual({ ok: true, value: { kind: "already_open" } });
    expect(posts(sent, "/checkout/sessions")).toEqual([]);
  });

  it("opens no second checkout while one is still open (the other tab)", async () => {
    const { api, sent } = stripeAt({
      "GET /subscriptions": NONE,
      "GET /subscriptions/search": NONE,
      "GET /checkout/sessions": list({ id: "cs_Other", mode: "subscription", status: "open" }),
      "POST /checkout/sessions": SESSION,
    });
    expect(await api.startCheckout({ userId: USER, customerId: "cus_Saved1", ...URLS })).toEqual({ ok: true, value: { kind: "already_open" } });
    expect(posts(sent, "/checkout/sessions")).toEqual([]);
  });

  it("opens a new checkout when the old subscriptions have ended", async () => {
    const { api } = stripeAt({
      "GET /subscriptions": list({ id: "sub_1", status: "canceled" }, { id: "sub_2", status: "incomplete_expired" }),
      "GET /subscriptions/search": NONE,
      "GET /checkout/sessions": NONE,
      "POST /checkout/sessions": SESSION,
    });
    expect((await api.startCheckout({ userId: USER, customerId: "cus_Saved1", ...URLS })).ok).toBe(true);
  });

  it("opens nothing when Stripe cannot say whether the user already pays", async () => {
    const { api, sent } = stripeAt({ "GET /subscriptions/search": NONE, "GET /checkout/sessions": NONE, "POST /checkout/sessions": SESSION });
    expect((await api.startCheckout({ userId: USER, customerId: "cus_Saved1", ...URLS })).ok).toBe(false);
    expect(posts(sent, "/checkout/sessions")).toEqual([]);
  });

  it("refuses a user id that is not ours before asking Stripe anything", async () => {
    const { api, sent } = stripeAt({});
    expect((await api.startCheckout({ userId: "x' OR '1", customerId: null, ...URLS })).ok).toBe(false);
    expect(sent).toEqual([]);
  });
});

describe("cancelAllAtPeriodEnd: nothing is left that cannot be cancelled", () => {
  it("lets every subscription that has not ended stop after its period, also one on another customer; the latest end", async () => {
    const { api, sent } = stripeAt({
      "GET /subscriptions": list(
        { id: "sub_Active", status: "active" },
        { id: "sub_Late", status: "past_due" },
        { id: "sub_Done", status: "canceled" },
        { id: "sub_Ending", status: "active", cancel_at_period_end: true, cancel_at: END_1 },
      ),
      // Found by our user id: one again (counted once) and one on a second customer from before the fix.
      "GET /subscriptions/search": list({ id: "sub_Active", status: "active" }, { id: "sub_OtherCustomer", status: "trialing" }),
      "POST /subscriptions/sub_Active": { status: 200, body: { id: "sub_Active", cancel_at: END_1 } },
      "POST /subscriptions/sub_Late": { status: 200, body: { id: "sub_Late", cancel_at: END_2 } },
      "POST /subscriptions/sub_OtherCustomer": { status: 200, body: { id: "sub_OtherCustomer", cancel_at: END_1 } },
    });
    expect(await api.cancelAllAtPeriodEnd("cus_A1", USER)).toEqual({ ok: true, value: { endsAt: new Date(END_2 * 1000) } });
    const cancelled = sent.filter((s) => s.method === "POST").map((s) => [s.path, s.body]);
    expect(cancelled).toEqual([
      ["/subscriptions/sub_Active", { cancel_at_period_end: "true" }],
      ["/subscriptions/sub_Late", { cancel_at_period_end: "true" }],
      ["/subscriptions/sub_OtherCustomer", { cancel_at_period_end: "true" }],
    ]);
    expect(sent.find((s) => s.path === "/subscriptions")!.query.get("status")).toBe("all");
  });

  it("stops a never-paid (incomplete) subscription right away", async () => {
    const { api, sent } = stripeAt({
      "GET /subscriptions": list({ id: "sub_Unpaid", status: "incomplete" }, { id: "sub_Active", status: "active" }),
      "GET /subscriptions/search": NONE,
      "DELETE /subscriptions/sub_Unpaid": { status: 200, body: { id: "sub_Unpaid", status: "canceled" } },
      "POST /subscriptions/sub_Active": { status: 200, body: { id: "sub_Active", cancel_at: END_1 } },
    });
    expect(await api.cancelAllAtPeriodEnd("cus_A1", USER)).toEqual({ ok: true, value: { endsAt: new Date(END_1 * 1000) } });
    expect(sent.filter((s) => s.method === "DELETE").map((s) => s.path)).toEqual(["/subscriptions/sub_Unpaid"]);
  });

  it("still tries the others when one fails, then reports the failure", async () => {
    const { api, sent } = stripeAt({
      "GET /subscriptions": list({ id: "sub_Broken", status: "active" }, { id: "sub_Fine", status: "active" }),
      "GET /subscriptions/search": NONE,
      "POST /subscriptions/sub_Fine": { status: 200, body: { id: "sub_Fine", cancel_at: END_1 } },
    });
    expect((await api.cancelAllAtPeriodEnd("cus_A1", USER)).ok).toBe(false);
    expect(posts(sent, "/subscriptions/sub_Fine")).toHaveLength(1);
  });

  it("answers null when there is nothing left to cancel, and changes nothing", async () => {
    const { api, sent } = stripeAt({ "GET /subscriptions": list({ id: "sub_Done", status: "canceled" }), "GET /subscriptions/search": NONE });
    expect(await api.cancelAllAtPeriodEnd("cus_A1", USER)).toEqual({ ok: true, value: null });
    expect(sent.filter((s) => s.method !== "GET")).toEqual([]);
  });
});

describe("scheduledEnd: when Pro ends (Issue #43)", () => {
  it("answers the latest end when every live subscription is set to end", async () => {
    const { api } = stripeAt({
      "GET /subscriptions": list(
        { id: "sub_1", status: "active", cancel_at_period_end: true, items: { data: [{ current_period_end: END_1 }] } },
        { id: "sub_2", status: "active", cancel_at: END_2 },
        { id: "sub_Old", status: "canceled" },
      ),
      "GET /subscriptions/search": NONE,
    });
    expect(await api.scheduledEnd("cus_A1", USER)).toEqual({ ok: true, value: { endsAt: new Date(END_2 * 1000) } });
  });

  it("answers null while a subscription still renews, or when there is none", async () => {
    const renewing = stripeAt({
      "GET /subscriptions": list({ id: "sub_1", status: "active", cancel_at_period_end: true, cancel_at: END_1 }, { id: "sub_2", status: "active", cancel_at_period_end: false, current_period_end: END_2 }),
      "GET /subscriptions/search": NONE,
    });
    expect(await renewing.api.scheduledEnd("cus_A1", USER)).toEqual({ ok: true, value: null });
    const none = stripeAt({ "GET /subscriptions": NONE, "GET /subscriptions/search": NONE });
    expect(await none.api.scheduledEnd("cus_A1", USER)).toEqual({ ok: true, value: null });
  });

  it("gives up after the short timeout when Stripe does not answer, and only reads", async () => {
    const { api, sent } = stripeAt({ "GET /subscriptions": "hang", "GET /subscriptions/search": "hang" });
    const started = Date.now();
    expect(await api.scheduledEnd("cus_A1", USER, 50)).toEqual({ ok: false, reason: "timeout" });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(sent.every((s) => s.method === "GET")).toBe(true);
  });
});
