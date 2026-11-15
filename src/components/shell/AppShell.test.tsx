// The shell (spec 12), copied from the prototype: the sidebar with Calendar, Coach (spec 19), Focus, Analytics, then
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
  // Rewritten for spec 28: "People" (contacts and invitations) is last in the list.
  // Rewritten for spec 30: "Lists" (shared to-do lists) follows "Goals".
  it("lists Calendar, Goals, Lists, Coach, Focus, Analytics and People in the main navigation, then Settings and Sign out at the bottom", () => {
    const html = render("/");
    const nav = html.slice(html.indexOf('aria-label="Main navigation"'), html.indexOf("</nav>"));
    expect([...nav.matchAll(/<\/svg>([A-Za-z ]+)<\/a>/g)].map((m) => m[1])).toEqual(["Calendar", "Goals", "Lists", "Coach", "Focus", "Analytics", "People"]);
    // Outside the calendar page "Goals" goes to the calendar.
    expect([...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1])).toEqual(["/", "/", "/lists", "/coach", "/focus", "/analytics", "/people"]);
    expect(render("/lists")).toMatch(/href="\/lists" aria-current="page"/);
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

  it("has a tab bar for phones with Calendar, Coach, Focus, Analytics and Settings, each named", () => {
    const html = render("/focus");
    const bar = html.slice(html.indexOf('aria-label="Tab bar"'));
    for (const name of ["Calendar", "Coach", "Focus", "Analytics", "Settings"]) expect(bar).toContain(`aria-label="${name}"`);
    expect(bar).toMatch(/href="\/focus" aria-label="Focus" aria-current="page"/);
  });

  it("marks Settings as the current page on the settings page", () => {
    expect(render("/settings")).toMatch(/href="\/settings" aria-current="page"/);
  });

  // Spec 28: the number of open invitations on "People", for screen readers in words; none, no badge.
  // People is not in the phone tab bar (a seventh icon does not fit at 375 px).
  it("shows the open invitations on People in the sidebar, and leaves People out of the tab bar", () => {
    const withTwo = renderToStaticMarkup(
      <AppShell current="/people" invitations={2}>
        page
      </AppShell>,
    );
    expect(withTwo).toMatch(/<a href="\/people" aria-current="page" aria-label="People, 2 open invitations"[^>]*>.*People<span aria-hidden="true"[^>]*>2<\/span><\/a>/s);
    const withNone = renderToStaticMarkup(
      <AppShell current="/" invitations={0}>
        page
      </AppShell>,
    );
    expect(withNone).toMatch(/<a href="\/people" class="[^"]*">.*?People<\/a>/s);
    const bar = withTwo.slice(withTwo.indexOf('aria-label="Tab bar"'));
    expect(bar).not.toContain("/people");
  });

  it("marks Coach as the current page on the coach page", () => {
    expect(render("/coach")).toMatch(/href="\/coach" aria-current="page"/);
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
