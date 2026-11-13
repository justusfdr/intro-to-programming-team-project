// Spec 24: Pro must look worth more than Free: "Most popular", a strong frame, filled ticks and the
// personalized coach in its words; Free stays quiet. And the sandbox note sits under the plans.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PricingView } from "./PricingView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const html = renderToStaticMarkup(<PricingView plan="free" paymentReady />);
const free = html.slice(html.indexOf('id="plan-free"'), html.indexOf('id="plan-pro"'));
const pro = html.slice(html.indexOf('id="plan-pro"'));

describe("the pricing page's look", () => {
  it("has a centered title and says what Pro adds", () => {
    expect(html).toContain(">Simple pricing</h1>");
    expect(html).toContain("Everything in Free, plus a personalized coach that plans with you.");
  });

  it("marks Pro as most popular, with filled ticks for each of its features and none of the old green ones", () => {
    expect(html).toContain("Most popular");
    expect(pro.match(/rounded-full bg-ink text-white/g)?.length).toBe(5);
    expect(html).not.toContain("text-success");
  });

  it("keeps Free quiet: grey ticks and the current plan instead of a button", () => {
    expect(free).not.toContain("bg-ink text-white");
    expect(free).toContain("text-ink-3");
    expect(free).toContain("Your current plan");
  });

  it("says the billing is monthly and can be cancelled, and puts the sandbox card under the plans", () => {
    expect(pro).toContain("Recurring billing · Cancel anytime");
    expect(html.indexOf("Testing in sandbox?")).toBeGreaterThan(html.indexOf("Upgrade to Pro"));
  });
});
