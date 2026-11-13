// The pricing page's markup in each state (spec 24): Free with Upgrade, Pro with Cancel, payment off,
// the notes after Stripe sends the browser back, and the test card while Stripe is in test mode.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { checkoutNote, PLANS, PRO_PRICE_CENTS } from "@/lib/billing/plans";
import { PricingView } from "./PricingView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const render = (props: Partial<Parameters<typeof PricingView>[0]> = {}) =>
  renderToStaticMarkup(<PricingView plan="free" paymentReady {...props} />);

describe("pricing page", () => {
  it("shows Free at €0 and Pro at €4.99 per month with the coach, and the test card", () => {
    const html = render();
    expect(html).toContain(">Free<");
    expect(html).toContain(">€0<");
    expect(html).toContain(">€4.99<");
    expect(html).toContain("per month");
    expect(html).toContain("The AI coach");
    expect(html).toContain("4242 4242 4242 4242");
    expect(PRO_PRICE_CENTS).toBe(499);
    expect(PLANS.map((p) => p.id)).toEqual(["free", "pro"]);
  });

  it("marks Free as the plan of a Free user and offers Upgrade to Pro", () => {
    const html = render();
    expect(html).toMatch(/plan-free[\s\S]*Your plan[\s\S]*plan-pro/);
    expect(html).toMatch(/<button[^>]*>Upgrade to Pro<\/button>/);
    expect(html).not.toContain("Cancel Pro");
  });

  it("marks Pro for a Pro user and offers Cancel Pro instead of Upgrade", () => {
    const html = render({ plan: "pro" });
    expect(html).toMatch(/plan-pro[\s\S]*Your plan/);
    expect(html).toContain(">Cancel Pro<");
    expect(html).not.toContain("Upgrade to Pro");
  });

  it("asks before cancelling", () => {
    const html = render({ plan: "pro", defaultConfirming: true });
    expect(html).toContain("You keep the coach until the end of the month you paid for.");
    expect(html).toContain(">Keep Pro<");
  });

  it("turns Upgrade off and says why when payment is not set up on the server", () => {
    const html = render({ paymentReady: false });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Upgrade to Pro<\/button>/);
    expect(html).toContain("Payment is not available right now.");
  });

  it("only notes the return from Stripe: the plan changes on Stripe's message, not here (R25)", () => {
    expect(checkoutNote("success", "free")?.text).toContain("as soon as Stripe confirms it");
    expect(checkoutNote("success", "pro")?.text).toBe("Welcome to Pro. The coach is ready for you.");
    expect(checkoutNote("cancelled", "free")?.text).toBe("Payment cancelled. Nothing was charged.");
    expect(checkoutNote(undefined, "free")).toBeNull();
    expect(checkoutNote("anything", "free")).toBeNull();
    expect(render({ checkout: "success" })).toContain("as soon as Stripe confirms it");
  });
});
