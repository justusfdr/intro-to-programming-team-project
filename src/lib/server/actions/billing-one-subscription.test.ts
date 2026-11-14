// Tests for Issue #42 (two checkouts in two tabs gave two subscriptions) and Issue #43 ("Pro ends on"
// was forgotten after a reload), through the actions with the fake Stripe and a temporary database.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, OWN_ORIGIN, postJson, read, type TestApp } from "@test/support/app";
import { signPayload } from "@/lib/server/stripe/signature";
import { TEST_WEBHOOK_SECRET } from "@/lib/server/stripe/fake";
import { cancelPro, proEndsOn, stripeWebhook, upgradeToPro } from "./billing";

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

const upgrade = () => upgradeToPro(postJson("/api/billing/checkout", {}), app.deps);

function stripeMessage(event: Record<string, unknown>) {
  const body = JSON.stringify({ id: "evt_1", livemode: false, ...event });
  return new Request(`${OWN_ORIGIN}/api/billing/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signPayload(body, TEST_WEBHOOK_SECRET, app.now()) },
    body,
  });
}

const subscriptionActive = (customer: string, userId: string) => ({
  type: "customer.subscription.updated",
  data: { object: { id: "sub_2", customer, status: "active", metadata: { user_id: userId } } },
});

describe("upgrade_to_pro: one subscription per user (Issue #42)", () => {
  it("opens one checkout; a second one (the other tab) is refused with a clear message and opens nothing", async () => {
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    expect(await read(await upgrade())).toEqual({ status: 200, body: { url: "https://checkout.stripe.test/c/1" } });
    expect(await read(await upgrade())).toEqual({
      status: 409,
      body: { error: "checkout_open", message: "You already have Pro, or a payment is still open. Reload this page in a minute." },
    });
    // Stripe was asked twice, but only one checkout page exists.
    expect(app.stripe.checkouts).toHaveLength(2);
    expect(await app.snapshot()).toEqual(before);
  });

  it("does not stop another user from paying", async () => {
    await app.signedInAs("alice@example.com");
    expect((await upgrade()).status).toBe(200);
    await app.signedInAs("bob@example.com");
    expect(await read(await upgrade())).toEqual({ status: 200, body: { url: "https://checkout.stripe.test/c/2" } });
  });
});

describe("cancel_pro: every subscription of the user (Issue #42)", () => {
  it("asks Stripe to cancel by the saved customer and our user id, and answers the end", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    await setProfile(alice, "pro", "cus_Alice1");
    const cancelAll = vi.spyOn(app.stripe, "cancelAllAtPeriodEnd");
    expect(await read(await cancelPro(postJson("/api/billing/cancel", {}), app.deps))).toEqual({
      status: 200,
      body: { endsAt: "2026-12-16T09:00:00.000Z", message: "Pro ends on 16 December 2026" },
    });
    expect(cancelAll).toHaveBeenCalledWith("cus_Alice1", alice);
  });

  it("answers 'Payment is not available right now.' when one of them could not be cancelled", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await setProfile(alice, "pro", "cus_Alice1");
    app.stripe.nextCancel = { ok: false, reason: "status_500" };
    expect((await read(await cancelPro(postJson("/api/billing/cancel", {}), app.deps))).body.message).toBe("Payment is not available right now.");
  });
});

describe("update_plan: a message for another customer does not replace the saved one (Issue #42)", () => {
  it("changes nothing when the named user already has a different customer", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await setProfile(alice, "pro", "cus_Alice1");
    const before = await app.snapshot();
    expect((await stripeWebhook(stripeMessage(subscriptionActive("cus_Other2", alice)), app.deps)).status).toBe(200);
    expect(await profileOf(alice)).toEqual({ plan: "pro", stripe_customer_id: "cus_Alice1" });
    expect(await app.snapshot()).toEqual(before);
    // Nor can an "ended" message for that other customer make the user Free.
    await stripeWebhook(stripeMessage({ type: "customer.subscription.deleted", data: { object: { id: "sub_2", customer: "cus_Other2", status: "canceled", metadata: { user_id: alice } } } }), app.deps);
    expect(await profileOf(alice)).toEqual({ plan: "pro", stripe_customer_id: "cus_Alice1" });
  });

  it("still applies a message for the saved customer, or for a user who has none yet", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const bob = await app.signedInAs("bob@example.com");
    await setProfile(alice, "free", "cus_Alice1");
    await stripeWebhook(stripeMessage(subscriptionActive("cus_Alice1", alice)), app.deps);
    expect(await profileOf(alice)).toEqual({ plan: "pro", stripe_customer_id: "cus_Alice1" });
    await stripeWebhook(stripeMessage(subscriptionActive("cus_Bob1", bob)), app.deps);
    expect(await profileOf(bob)).toEqual({ plan: "pro", stripe_customer_id: "cus_Bob1" });
  });
});

describe("proEndsOn: the pricing page remembers a cancelled Pro after a reload (Issue #43)", () => {
  it("answers the end date in the user's time zone when Stripe says Pro is set to end", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Berlin" });
    await setProfile(alice, "pro", "cus_Alice1");
    app.stripe.nextEnd = { ok: true, value: { endsAt: new Date("2026-12-16T23:30:00Z") } };
    const before = await app.snapshot();
    expect(await proEndsOn(app.deps, alice)).toBe("17 December 2026");
    expect(app.stripe.endLookups).toEqual(["cus_Alice1"]);
    expect(await app.snapshot()).toEqual(before);
  });

  it("answers null while Pro still renews", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await setProfile(alice, "pro", "cus_Alice1");
    expect(await proEndsOn(app.deps, alice)).toBeNull();
  });

  it("answers null, without asking Stripe, for Free, for Pro without a customer, or without Stripe on the server", async () => {
    const alice = await app.signedInAs("alice@example.com");
    app.stripe.nextEnd = { ok: true, value: { endsAt: new Date("2026-12-16T09:00:00Z") } };
    expect(await proEndsOn(app.deps, alice)).toBeNull();
    await setProfile(alice, "pro", null);
    expect(await proEndsOn(app.deps, alice)).toBeNull();
    await setProfile(alice, "pro", "cus_Alice1");
    expect(await proEndsOn({ ...app.deps, stripe: null }, alice)).toBeNull();
    expect(app.stripe.endLookups).toEqual([]);
  });

  it("answers null when Stripe fails or the lookup throws, so the page still shows", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await setProfile(alice, "pro", "cus_Alice1");
    app.stripe.nextEnd = { ok: false, reason: "timeout" };
    expect(await proEndsOn(app.deps, alice)).toBeNull();
    vi.spyOn(app.stripe, "scheduledEnd").mockRejectedValueOnce(new Error("boom"));
    expect(await proEndsOn(app.deps, alice)).toBeNull();
  });
});
