// Spec 53: "People" in the sidebar, right below the main navigation, with the number of open invitations
// to the user; not in the phone tab bar. On phones the People page is reached from Settings.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SettingsView } from "@/components/settings/SettingsView";
import type { BlockerData } from "@/lib/blocker/types";
import type { SettingsPageData } from "@/lib/settings/types";
import { AppShell } from "./AppShell";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const render = (current: string, invitations?: number) =>
  renderToStaticMarkup(
    <AppShell current={current} invitations={invitations}>
      page
    </AppShell>,
  );

describe("People in the sidebar", () => {
  it("follows the main navigation, before Pricing, and is not in the tab bar", () => {
    const html = render("/");
    const people = html.indexOf('href="/people"');
    expect(people).toBeGreaterThan(html.indexOf("</nav>"));
    expect(people).toBeLessThan(html.indexOf('href="/pricing"'));
    expect(html).toMatch(/<a href="\/people" class="[^"]*"><svg[^>]*lucide-users[^>]*>.*?<\/svg>People<\/a>/);
    const bar = html.slice(html.indexOf('aria-label="Tab bar"'));
    expect(bar).not.toContain("/people");
  });

  it("shows the number of open invitations and says it in its name", () => {
    const html = render("/", 2);
    expect(html).toMatch(/<a href="\/people" aria-label="People, 2 open invitations" class="[^"]*">/);
    expect(html).toMatch(/<span aria-hidden="true" class="[^"]*">2<\/span><\/a>/);
    expect(render("/", 1)).toContain('aria-label="People, 1 open invitation"');
    expect(render("/", 120)).toContain(">99+</span>");
    // No invitations: no badge, no extra name.
    expect(render("/", 0)).toMatch(/<a href="\/people" class="[^"]*">/);
  });

  it("is marked as the current page on the People page and on a person's page", () => {
    expect(render("/people")).toMatch(/<a href="\/people" aria-current="page"/);
    expect(render("/people/u3")).toMatch(/<a href="\/people" aria-current="page"/);
    expect(render("/")).not.toMatch(/<a href="\/people" aria-current="page"/);
  });
});

describe("People in Settings, for phones", () => {
  const DATA: SettingsPageData = {
    settings: {
      timeZone: "Europe/Lisbon",
      homeAddress: "",
      travelMode: "cycling",
      travelBufferMinutes: 15,
      timeFormat: "12h",
      dayStartHour: 7,
      dayEndHour: 21,
    },
    plan: "free",
    outlookAvailable: false,
    outlook: { status: "none", lastSyncedAt: null },
    today: "2026-11-17",
    hasDemo: false,
    defaultView: "week",
    places: [],
  };
  const BLOCKER: BlockerData = { sites: [], connected: false, blockingOn: false, blockingUntil: null, timeZone: "Europe/Lisbon" };

  it("has a row to the People page, shown only below 768 px (wider screens have the sidebar)", () => {
    const html = renderToStaticMarkup(<SettingsView data={DATA} blocker={BLOCKER} />);
    const row = html.match(/<a [^>]*href="\/people"[^>]*>/)?.[0] ?? "";
    expect(row).toMatch(/class="[^"]*\bmd:hidden\b/);
    expect(html).toContain(">People</span>");
  });
});
