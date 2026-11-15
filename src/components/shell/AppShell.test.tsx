// The shell (spec 12), copied from the prototype: the sidebar with Calendar, Goals (spec 39), Coach (spec 19), Focus, Analytics, then
// Settings and the account row at the bottom; on phones the floating tab bar with the same pages and
// Settings, each with its name for screen readers and the current page marked.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SHORTCUTS } from "@/lib/shortcuts/list";
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
  // Rewritten for spec 25: "Goals" is second in the list (it moved here from the calendar's toolbar).
  // Rewritten for spec 39: "Goals" is a link to its own page, like the others (before, it went to the calendar).
  it("lists Calendar, Goals, Coach, Focus and Analytics in the main navigation, then Settings and Sign out at the bottom", () => {
    const html = render("/");
    const nav = html.slice(html.indexOf('aria-label="Main navigation"'), html.indexOf("</nav>"));
    expect([...nav.matchAll(/<\/svg>([A-Za-z ]+)<\/a>/g)].map((m) => m[1])).toEqual(["Calendar", "Goals", "Coach", "Focus", "Analytics"]);
    expect([...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1])).toEqual(["/", "/goals", "/coach", "/focus", "/analytics"]);
    expect(html.indexOf('href="/settings"')).toBeGreaterThan(html.indexOf("</nav>"));
    expect(html.indexOf("Sign out")).toBeGreaterThan(html.indexOf('href="/settings"'));
  });

  it("the sidebar starts open, with the button that folds it to a strip of icons (spec 25)", () => {
    const html = render("/");
    expect(html).toMatch(/<button type="button" aria-label="Collapse sidebar" title="Collapse sidebar"[^>]*><svg[^>]*lucide-chevrons-left/);
    expect(html).not.toContain("Keep sidebar open");
    // Open: the links carry their words, and the sidebar takes its full width in the page.
    expect(html).toMatch(/style="width:232px"/);
    expect(html).toMatch(/<a[^>]*href="\/coach"[^>]*>.*Coach<\/a>/s);
  });

  // Spec 39 added Goals, second as in the sidebar.
  it("has a tab bar for phones with Calendar, Goals, Coach, Focus, Analytics and Settings, each named", () => {
    const html = render("/focus");
    const bar = html.slice(html.indexOf('aria-label="Tab bar"'));
    for (const name of ["Calendar", "Goals", "Coach", "Focus", "Analytics", "Settings"]) expect(bar).toContain(`aria-label="${name}"`);
    expect(bar.indexOf('aria-label="Goals"')).toBeGreaterThan(bar.indexOf('aria-label="Calendar"'));
    expect(bar.indexOf('aria-label="Goals"')).toBeLessThan(bar.indexOf('aria-label="Coach"'));
    expect(bar).toMatch(/href="\/focus" aria-label="Focus" aria-current="page"/);
  });

  it("marks Settings as the current page on the settings page", () => {
    expect(render("/settings")).toMatch(/href="\/settings" aria-current="page"/);
  });

  it("marks Coach as the current page on the coach page", () => {
    expect(render("/coach")).toMatch(/href="\/coach" aria-current="page"/);
  });

  it("marks Goals as the current page on the Goals page, in the sidebar and in the tab bar (spec 39)", () => {
    expect(render("/goals").match(/href="\/goals"[^>]*aria-current="page"/g)).toHaveLength(2);
  });

  it("has no controls for features that do not exist yet (search, quick capture)", () => {
    expect(render("/")).not.toMatch(/Search|Brain|⌘K/);
  });
  // Spec 26: "?" opens the list of shortcuts on every signed-in page; it starts closed.
  it("has the keyboard shortcut help, closed, listing every shortcut of the list and a close button", () => {
    for (const page of ["/", "/coach", "/settings"]) {
      const html = render(page);
      const help = html.slice(html.indexOf('<dialog aria-labelledby="shortcut-help-title"'));
      expect(help).toMatch(/^<dialog aria-labelledby="shortcut-help-title"(?![^>]*\sopen)/);
      expect(help).toContain(">Keyboard shortcuts</h2>");
      expect(help).toMatch(/<button type="button"[^>]*aria-label="Close"/);
      for (const group of SHORTCUTS) {
        expect(help).toContain(`aria-label="${group.where}"`);
        for (const s of group.shortcuts) expect(help).toContain(s.does.replaceAll("'", "&#x27;"));
      }
      expect(help).toMatch(/<kbd[^>]*>\?<\/kbd>/);
    }
  });
});
