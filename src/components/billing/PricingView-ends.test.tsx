// The pricing page for a Pro user whose subscription is set to end (Issue #43): after a reload the card
// still says until when, and offers no "Cancel Pro".
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PricingView } from "./PricingView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

describe("pricing page after Cancel Pro and a reload", () => {
  it("says when Pro ends and offers no Cancel Pro", () => {
    const html = renderToStaticMarkup(<PricingView plan="pro" paymentReady endsOn="16 December 2026" />);
    expect(html).toContain("Pro ends on 16 December 2026");
    expect(html).not.toContain("Cancel Pro");
    expect(html).not.toContain("Upgrade to Pro");
    expect(html).toMatch(/plan-pro[\s\S]*Your plan/);
  });

  it("still offers Cancel Pro while Pro renews (no end date)", () => {
    const html = renderToStaticMarkup(<PricingView plan="pro" paymentReady endsOn={null} />);
    expect(html).toContain(">Cancel Pro<");
    expect(html).not.toContain("Pro ends on");
  });
});
