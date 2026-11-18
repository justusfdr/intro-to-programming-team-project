// Spec 49: the Analytics page in tabs (header, week links that keep the tab, the six tabs, each tab's
// widgets from the standard layout) and a widget's details. Replaces AnalyticsView.test.tsx together
// with the old page (the owner agreed: the look of the page changes on purpose).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { emptyReport, sampleReport } from "@/lib/analytics/report-fixture";
import { STANDARD_LAYOUT, TAB_LABELS, TABS, WIDGETS, type Tab } from "@/lib/analytics/report-types";
import { AnalyticsTabs, analyticsHref } from "./AnalyticsTabs";
import { detailsInsights, WidgetDetails } from "./WidgetDetails";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const page = (tab: Tab, report = sampleReport, extra: { onEdit?: () => void; onExport?: () => void } = {}) =>
  renderToStaticMarkup(<AnalyticsTabs report={report} layout={STANDARD_LAYOUT} tab={tab} {...extra} />);

function text(markup: string): string {
  return markup
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

/** The markup of the tab panel only. */
const panel = (markup: string) => markup.slice(markup.indexOf('role="tabpanel"'), markup.indexOf("<dialog"));

describe("Analytics page", () => {
  it("shows the week in the header, as in the mockup", () => {
    const shown = text(page("overview"));
    expect(shown).toContain("Analytics");
    expect(shown).toContain("Week 46 · Nov 9 – 15");
  });

  it.each(TABS)("the %s tab shows its widgets from the standard layout", (tab) => {
    const markup = panel(page(tab));
    expect(markup.match(/<section/g)).toHaveLength(STANDARD_LAYOUT[tab].length);
    for (const item of STANDARD_LAYOUT[tab]) expect(text(markup)).toContain(WIDGETS[item.kind].title === "Streak" && item.size === "M" ? "Your streak" : WIDGETS[item.kind].title);
  });

  it("spans S, M and L widgets over 1, 2 and 3 columns", () => {
    expect(panel(page("overview"))).toContain("sm:col-span-2");
    expect(panel(page("goals"))).toContain("lg:col-span-3");
  });

  it("opens on the tab from the address, as a real tab list", () => {
    const markup = page("focus");
    expect(markup).toContain('role="tablist"');
    expect(markup.match(/role="tab"/g)).toHaveLength(6);
    expect(markup).toMatch(/id="analytics-tab-focus" aria-selected="true" aria-controls="analytics-panel" tabindex="0"/);
    expect(markup).toMatch(/id="analytics-tab-overview" aria-selected="false" aria-controls="analytics-panel" tabindex="-1"/);
    expect(markup).toContain('aria-labelledby="analytics-tab-focus"');
    for (const tab of TABS) expect(text(markup)).toContain(TAB_LABELS[tab]);
  });

  it("keeps the tab in the week links", () => {
    const markup = page("goals");
    expect(markup).toContain(`href="/analytics?week=2026-11-02&amp;tab=goals"`);
    expect(markup).toContain(`href="/analytics?week=2026-11-16&amp;tab=goals"`);
    expect(analyticsHref("2026-11-16", "blocked")).toBe("/analytics?week=2026-11-16&tab=blocked");
  });

  it("draws the black focus card only first on the Overview", () => {
    expect(text(page("overview"))).toContain("You were locked in for");
    expect(text(page("focus"))).not.toContain("You were locked in for");
  });

  it("shows Edit widgets and Export disabled until they are wired, enabled with a handler", () => {
    const off = page("overview");
    expect(off.match(/disabled="" title="Coming next"/g)).toHaveLength(2);
    const on = page("overview", sampleReport, { onEdit: () => {}, onExport: () => {} });
    expect(on).not.toContain("Coming next");
    expect(text(on)).toContain("Edit widgets");
    expect(text(on)).toContain("Export");
  });

  it.each(TABS)("the %s tab never prints NaN, undefined or Infinity, for either report", (tab) => {
    for (const report of [sampleReport, emptyReport]) expect(page(tab, report)).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("an empty week says so instead of showing empty charts", () => {
    const shown = text(page("overview", emptyReport));
    expect(shown).toContain("No focus sessions this week yet");
    expect(shown).toContain("No goals with a weekly target yet");
  });
});

describe("a widget's details", () => {
  const details = (kind: Parameters<typeof WidgetDetails>[0]["kind"], report = sampleReport) =>
    renderToStaticMarkup(<WidgetDetails report={report} kind={kind} onClose={() => {}} />);

  it("show the title, the week, the widget large, the topic's lists and summary", () => {
    const markup = details("focus_time");
    const shown = text(markup);
    expect(shown).toContain("Focus time");
    expect(shown).toContain("Week 46 · Nov 9 – 15");
    expect(shown).toContain("11h 30m");
    expect(shown).toContain("What's going well");
    expect(shown).toContain("What's not going well");
    for (const line of [...sampleReport.insights.focus.good, ...sampleReport.insights.focus.bad]) expect(shown).toContain(line);
    expect(shown).toContain(sampleReport.insights.focus.summary);
    expect(shown).not.toContain(sampleReport.insights.goals.summary);
    expect(shown).toContain("Done");
    expect(markup).toContain('aria-label="Close"');
  });

  it("show the blocked topic for a distraction widget", () => {
    const shown = text(details("top_sites"));
    expect(shown).toContain(sampleReport.insights.blocked.summary);
    expect(shown).toContain("Blocked visits down from 31 to 23");
  });

  it("for the week in short: the first two of each topic and the week's summary", () => {
    const insights = detailsInsights(sampleReport, "week_in_short");
    expect(insights.summary).toBe(sampleReport.summary);
    expect(insights.good).toHaveLength(10);
    expect(insights.good).toContain("Blocked visits down from 31 to 23");
    expect(insights.good).not.toContain("Sessions on 6 of 7 days");
    const shown = text(details("week_in_short"));
    expect(shown).toContain("instagram.com was blocked 9 times");
  });

  it("show only the summary when both lists are empty", () => {
    const shown = text(details("focus_time", emptyReport));
    expect(shown).not.toContain("What's going well");
    expect(shown).toContain(emptyReport.insights.focus.summary);
  });

  it("draw nothing while closed", () => {
    expect(details(null)).not.toContain("What's going well");
  });
});
