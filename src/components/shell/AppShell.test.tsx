// The shell (spec 12), copied from the prototype: the sidebar with Calendar, Focus, Analytics, then
// Settings and the account row at the bottom; on phones the floating tab bar with the same pages and
// Settings, each with its name for screen readers and the current page marked.
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

describe("app shell", () => {
  it("lists Calendar, Focus and Analytics in the main navigation, then Settings and Sign out at the bottom", () => {
    const html = render("/");
    const nav = html.slice(html.indexOf('aria-label="Main navigation"'), html.indexOf("</nav>"));
    expect([...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1])).toEqual(["/", "/focus", "/analytics"]);
    expect(html.indexOf('href="/settings"')).toBeGreaterThan(html.indexOf("</nav>"));
    expect(html.indexOf("Sign out")).toBeGreaterThan(html.indexOf('href="/settings"'));
  });

  it("has a tab bar for phones with Calendar, Focus, Analytics and Settings, each named", () => {
    const html = render("/focus");
    const bar = html.slice(html.indexOf('aria-label="Tab bar"'));
    for (const name of ["Calendar", "Focus", "Analytics", "Settings"]) expect(bar).toContain(`aria-label="${name}"`);
    expect(bar).toMatch(/href="\/focus" aria-label="Focus" aria-current="page"/);
  });

  it("marks Settings as the current page on the settings page", () => {
    expect(render("/settings")).toMatch(/href="\/settings" aria-current="page"/);
  });

  it("has no controls for features that do not exist yet (search, quick capture, AI chat)", () => {
    expect(render("/")).not.toMatch(/Search|Brain|⌘K/);
  });
});
