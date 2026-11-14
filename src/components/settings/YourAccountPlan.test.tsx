// Spec 24: the "Your account" card shows the plan and the way to the pricing page.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { YourAccountCard } from "./YourAccountCard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
vi.mock("@/components/calendar/Announcer", () => ({ useAnnounce: () => () => {} }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("the plan in Your account", () => {
  it("shows Free with the price of Pro and a link to the plans", () => {
    const html = renderToStaticMarkup(<YourAccountCard plan="free" />);
    expect(html).toContain("Free</strong>: Pro adds the AI coach for €4.99 per month.");
    expect(html).toMatch(/<a href="\/pricing"[^>]*>See plans<\/a>/);
  });

  it("shows Pro with a link to manage it", () => {
    const html = renderToStaticMarkup(<YourAccountCard plan="pro" />);
    expect(html).toContain("Pro</strong>: the AI coach is yours.");
    expect(html).toMatch(/<a href="\/pricing"[^>]*>Manage plan<\/a>/);
  });

  it("leaves the row out when no plan is given", () => {
    expect(renderToStaticMarkup(<YourAccountCard />)).not.toContain("/pricing");
  });
});
