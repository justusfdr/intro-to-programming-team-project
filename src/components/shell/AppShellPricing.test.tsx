// Spec 24: "Pricing" sits at the bottom of the sidebar, above Settings, and in the phones' tab bar.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const render = (current: string) => renderToStaticMarkup(<AppShell current={current}>page</AppShell>);

describe("Pricing in the navigation", () => {
  it("is at the bottom of the sidebar: after the main navigation, just above Settings", () => {
    const html = render("/");
    const sidebar = html.slice(0, html.indexOf('aria-label="Tab bar"'));
    const pricing = sidebar.indexOf('href="/pricing"');
    expect(pricing).toBeGreaterThan(sidebar.indexOf("</nav>"));
    expect(pricing).toBeLessThan(sidebar.indexOf('href="/settings"'));
    expect(sidebar).toMatch(/href="\/pricing"[^>]*>[\s\S]*?Pricing<\/a>/);
  });

  it("is in the tab bar with its name, before Settings", () => {
    const bar = render("/").split('aria-label="Tab bar"')[1];
    expect(bar).toContain('aria-label="Pricing"');
    expect(bar.indexOf('href="/pricing"')).toBeLessThan(bar.indexOf('href="/settings"'));
  });

  it("marks Pricing as the current page on the pricing page", () => {
    expect(render("/pricing")).toMatch(/href="\/pricing" aria-current="page"/);
  });
});
