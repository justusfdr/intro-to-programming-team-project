// Tests for Free and Pro through Stripe (spec 24; ontology upgrade_to_pro, cancel_pro, update_plan,
// R1, R5, R6, R25). Stripe is the fake; its messages are signed here with the test webhook secret.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, OWN_ORIGIN, postJson, read, type TestApp } from "@test/support/app";
import { signPayload } from "@/lib/server/stripe/signature";
import { TEST_WEBHOOK_SECRET } from "@/lib/server/stripe/fake";
import { cancelPro, endDateText, stripeWebhook, upgradeToPro } from "./billing";

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.reset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const CROSS_SITE = { origin: "https://evil.example", "sec-fetch-site": "cross-site" };

async function profileOf(userId: string) {
  const [row] = await app.db.admin<{ plan: string; stripe_customer_id: string | null }>(
    "select plan, stripe_customer_id from app.profiles where id = $1",
    [userId],
  );
  return row;
}

async function setProfile(userId: string, plan: "free" | "pro", customer: string | null) {
  await app.db.admin("update app.profiles set plan = $2, stripe_customer_id = $3 where id = $1", [userId, plan, customer]);
}

const upgrade = (headers?: Record<string, string>) => upgradeToPro(postJson("/api/billing/checkout", {}, headers), app.deps);
const cancel = (headers?: Record<string, string>) => cancelPro(postJson("/api/billing/cancel", {}, headers), app.deps);

/** A message from Stripe as it arrives: the raw body and its signature header, made at the fake clock's time. */
function stripeMessage(event: Record<string, unknown>, options: { secret?: string; at?: Date; header?: string | null } = {}) {
  const body = JSON.stringify({ id: "evt_1", livemode: false, ...event });
  const header = options.header === undefined ? signPayload(body, options.secret ?? TEST_WEBHOOK_SECRET, options.at ?? app.now()) : options.header;
  // Stripe is not a browser: no Origin, no Sec-Fetch-Site.
  return new Request(`${OWN_ORIGIN}/api/billing/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(header === null ? {} : { "stripe-signature": header }) },
    body,
  });
}

const webhook = (request: Request) => stripeWebhook(request, app.deps);

function checkoutCompleted(userId: string, change: Record<string, unknown> = {}) {
  return {
    type: "checkout.session.completed",
    data: { object: { id: "cs_1", mode: "subscription", payment_status: "paid", client_reference_id: userId, customer: "cus_Alice1", ...change } },
  };
}

function subscription(type: string, status: string, change: Record<string, unknown> = {}) {
  return { type, data: { object: { id: "sub_1", customer: "cus_Alice1", status, metadata: {}, ...change } } };
}

describe("upgrade_to_pro", () => {
  it("answers Stripe's checkout address for a Free user and saves nothing (the plan waits for Stripe)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    expect(await read(await upgrade())).toEqual({ status: 200, body: { url: "https://checkout.stripe.test/c/1" } });
    expect(app.stripe.checkouts).toEqual([
      {
        userId: alice,
        customerId: null,
        successUrl: "http://localhost:3000/pricing?checkout=success",
        cancelUrl: "http://localhost:3000/pricing?checkout=cancelled",
      },
    ]);
    expect(await app.snapshot()).toEqual(before);
  });

  it("sends the saved customer of a user who had Pro before", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await setProfile(alice, "free", "cus_Alice1");
    await upgrade();
    expect(app.stripe.checkouts[0].customerId).toBe("cus_Alice1");
  });

  it("refuses a Pro user with 'You already have Pro'; Stripe not called; nothing changed", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await setProfile(alice, "pro", "cus_Alice1");
    const before = await app.snapshot();
    expect(await read(await upgrade())).toEqual({ status: 409, body: { error: "already_pro", message: "You already have Pro" } });
    expect(app.stripe.checkouts).toEqual([]);
    expect(await app.snapshot()).toEqual(before);
  });

  it("answers 'Payment is not available right now.' without Stripe on the server or when Stripe fails", async () => {
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    const noStripe = await upgradeToPro(postJson("/api/billing/checkout", {}), { ...app.deps, stripe: null });
    expect(await read(noStripe)).toEqual({ status: 503, body: { error: "payment_unavailable", message: "Payment is not available right now." } });
    app.stripe.nextCheckout = { ok: false, reason: "status_500" };
    expect((await read(await upgrade())).body.message).toBe("Payment is not available right now.");
    expect(await app.snapshot()).toEqual(before);
  });

  it("answers 401 without a session and 403 from another site; Stripe not called", async () => {
    await app.signedInAs("alice@example.com");
    expect((await upgrade(CROSS_SITE)).status).toBe(403);
    await app.auth.signOut();
    expect((await upgrade()).status).toBe(401);
    expect(app.stripe.checkouts).toEqual([]);
  });
});

describe("cancel_pro", () => {
  it("lets a Pro user's subscription end after the paid period; the plan stays Pro until Stripe says it ended", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    await setProfile(alice, "pro", "cus_Alice1");
    expect(await read(await cancel())).toEqual({
      status: 200,
      body: { endsAt: "2026-12-16T09:00:00.000Z", message: "Pro ends on 16 December 2026" },
    });
    expect(app.stripe.cancels).toEqual(["cus_Alice1"]);
    expect(await profileOf(alice)).toEqual({ plan: "pro", stripe_customer_id: "cus_Alice1" });
  });

  it("refuses a Free user with 'You do not have Pro'; Stripe not called; nothing changed", async () => {
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    expect(await read(await cancel())).toEqual({ status: 409, body: { error: "not_pro", message: "You do not have Pro" } });
    expect(app.stripe.cancels).toEqual([]);
    expect(await app.snapshot()).toEqual(before);
  });

  it("answers 'Payment is not available right now.' when Stripe fails, finds no subscription, or is not set up", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await setProfile(alice, "pro", "cus_Alice1");
    app.stripe.nextCancel = { ok: false, reason: "timeout" };
    expect((await read(await cancel())).status).toBe(503);
    app.stripe.nextCancel = { ok: true, value: null };
    expect((await read(await cancel())).status).toBe(503);
    expect((await cancelPro(postJson("/x", {}), { ...app.deps, stripe: null })).status).toBe(503);
    expect(await profileOf(alice)).toEqual({ plan: "pro", stripe_customer_id: "cus_Alice1" });
  });

  it("answers 401 without a session and 403 from another site", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await setProfile(alice, "pro", "cus_Alice1");
    expect((await cancel(CROSS_SITE)).status).toBe(403);
    await app.auth.signOut();
    expect((await cancel()).status).toBe(401);
    expect(app.stripe.cancels).toEqual([]);
  });

  it("writes the end date in the user's time zone", () => {
    expect(endDateText(new Date("2026-12-16T23:30:00Z"), "Europe/Berlin")).toBe("17 December 2026");
    expect(endDateText(new Date("2026-12-16T23:30:00Z"), "Europe/Lisbon")).toBe("16 December 2026");
  });
});

describe("update_plan: Stripe's signed messages (R6, R25)", () => {
  it("makes the user Pro and saves the customer when a paid subscription checkout completes", async () => {
    const alice = await app.signedInAs("alice@example.com");
    expect(await read(await webhook(stripeMessage(checkoutCompleted(alice))))).toEqual({ status: 200, body: { received: true } });
    expect(await profileOf(alice)).toEqual({ plan: "pro", stripe_customer_id: "cus_Alice1" });
  });

  it("changes only that user: another user stays Free", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const alice = await app.signedInAs("alice@example.com");
    await webhook(stripeMessage(checkoutCompleted(alice)));
    expect(await profileOf(bob)).toEqual({ plan: "free", stripe_customer_id: null });
  });

  it("does nothing for an unpaid checkout or one that is not a subscription", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    await webhook(stripeMessage(checkoutCompleted(alice, { payment_status: "unpaid" })));
    await webhook(stripeMessage(checkoutCompleted(alice, { mode: "payment" })));
    expect(await app.snapshot()).toEqual(before);
  });

  it("follows the subscription: active or trialing is Pro; canceled, unpaid or expired is Free; others change nothing", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await setProfile(alice, "free", "cus_Alice1");
    await webhook(stripeMessage(subscription("customer.subscription.updated", "active")));
    expect((await profileOf(alice)).plan).toBe("pro");
    await webhook(stripeMessage(subscription("customer.subscription.updated", "past_due")));
    expect((await profileOf(alice)).plan).toBe("pro");
    await webhook(stripeMessage(subscription("customer.subscription.updated", "unpaid")));
    expect((await profileOf(alice)).plan).toBe("free");
    await webhook(stripeMessage(subscription("customer.subscription.updated", "trialing")));
    expect((await profileOf(alice)).plan).toBe("pro");
    await webhook(stripeMessage(subscription("customer.subscription.updated", "canceled")));
    expect((await profileOf(alice)).plan).toBe("free");
  });

  it("makes the user Free again when the subscription is deleted (the paid period is over)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await setProfile(alice, "pro", "cus_Alice1");
    await webhook(stripeMessage(subscription("customer.subscription.deleted", "canceled")));
    expect(await profileOf(alice)).toEqual({ plan: "free", stripe_customer_id: "cus_Alice1" });
  });

  it("finds the user by the id in the subscription's metadata before the customer is saved", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await webhook(stripeMessage(subscription("customer.subscription.created", "active", { metadata: { user_id: alice } })));
    expect(await profileOf(alice)).toEqual({ plan: "pro", stripe_customer_id: "cus_Alice1" });
  });

  it("prefers the saved customer over the metadata, so a message cannot move Pro to another user", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const alice = await app.signedInAs("alice@example.com");
    await setProfile(alice, "free", "cus_Alice1");
    await webhook(stripeMessage(subscription("customer.subscription.updated", "active", { metadata: { user_id: bob } })));
    expect((await profileOf(alice)).plan).toBe("pro");
    expect((await profileOf(bob)).plan).toBe("free");
  });

  it("answers 200 and changes nothing for other events and for a customer nobody has", async () => {
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    expect((await webhook(stripeMessage({ type: "invoice.paid", data: { object: { id: "in_1", customer: "cus_Alice1" } } }))).status).toBe(200);
    expect((await webhook(stripeMessage(subscription("customer.subscription.updated", "active", { customer: "cus_Nobody9" })))).status).toBe(200);
    expect(await app.snapshot()).toEqual(before);
  });

  it("refuses a wrong secret, a changed body, a missing signature and an old message: 400, nothing changed (R1)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    const event = checkoutCompleted(alice);
    expect((await webhook(stripeMessage(event, { secret: "whsec_someone_else" }))).status).toBe(400);
    expect((await webhook(stripeMessage(event, { header: null }))).status).toBe(400);
    expect((await webhook(stripeMessage(event, { at: new Date(app.now().getTime() - 6 * 60_000) }))).status).toBe(400);
    const good = stripeMessage(event);
    const changed = new Request(good.url, { method: "POST", headers: good.headers, body: (await good.text()).replace("paid", "paid ") });
    expect((await webhook(changed)).status).toBe(400);
    expect(await app.snapshot()).toEqual(before);
  });

  it("refuses a live-mode message even with a right signature (R25)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    expect(await read(await webhook(stripeMessage({ ...checkoutCompleted(alice), livemode: true })))).toMatchObject({
      status: 400,
      body: { error: "live_mode" },
    });
    expect(await app.snapshot()).toEqual(before);
  });

  it("answers 503 without Stripe on the server, so Stripe tries again later; nothing changed", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    expect((await stripeWebhook(stripeMessage(checkoutCompleted(alice)), { ...app.deps, stripe: null })).status).toBe(503);
    expect(await app.snapshot()).toEqual(before);
  });

  it("refuses a body over 256 KB", async () => {
    await app.signedInAs("alice@example.com");
    const big = new Request(`${OWN_ORIGIN}/api/billing/webhook`, { method: "POST", body: "x".repeat(300 * 1024) });
    expect((await webhook(big)).status).toBe(400);
  });
});

describe("the coach after paying (R5, R21 with CHAT_PRO_ONLY=true)", () => {
  it("is Pro only: Free before the message, allowed after it", async () => {
    const { chatAllowed } = await import("@/lib/chat/access");
    const alice = await app.signedInAs("alice@example.com");
    expect(chatAllowed((await profileOf(alice)).plan as "free" | "pro", true)).toBe(false);
    await webhook(stripeMessage(checkoutCompleted(alice)));
    expect(chatAllowed((await profileOf(alice)).plan as "free" | "pro", true)).toBe(true);
  });
});
