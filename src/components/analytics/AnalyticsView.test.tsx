// The Analytics page's markup: the numbers, "–" for no sessions, and a table and list behind the charts.
// Rewritten for the prototype-style branch (spec 12): days and weeks are month-first ("Mon, Nov 16", "Nov 16 – 22").
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { weekAnalytics } from "@/lib/analytics/score";
import type { AnalyticsData } from "@/lib/analytics/types";
import { AnalyticsView } from "./AnalyticsView";

const a2 = weekAnalytics(
  [{ startedAt: new Date("2026-11-16T09:00:00Z"), endedAt: new Date("2026-11-16T09:55:00Z"), plannedMinutes: 60, focusedMinutes: 45 }],
  [
    { domain: "instagram.com", attemptedAt: new Date("2026-11-16T09:12:00Z") },
    { domain: "instagram.com", attemptedAt: new Date("2026-11-16T09:40:00Z") },
  ],
  "2026-11-16",
  "Europe/Lisbon",
);

function render(fields: Partial<AnalyticsData>) {
  const data: AnalyticsData = {
    timeZone: "Europe/Lisbon",
    monday: "2026-11-16",
    previous: "2026-11-09",
    next: "2026-11-23",
    thisWeek: "2026-11-16",
    today: "2026-11-16",
    analytics: a2,
    ...fields,
  };
  return renderToStaticMarkup(<AnalyticsView data={data} />);
}

describe("Analytics page", () => {
  it("shows A2's week: 45 min, score 65, 1 session, 2 blocked visits, and today's numbers", () => {
    const html = render({});
    for (const text of ["45 min", ">65<", "Today: 65", "Today: 45 min", ">2<"]) expect(html).toContain(text);
  });

  it("has a table with a row per day and the same numbers, and hides the bars from screen readers", () => {
    const html = render({});
    expect(html.match(/<tr class="border-b border-line-subtle last:border-0/g)).toHaveLength(7);
    expect(html).toContain("Week 47 · Nov 16 – 22");
    expect(html).toMatch(/<th scope="row"[^>]*>Mon, Nov 16<span[^>]*>\(today\)<\/span><\/th><td[^>]*>45 min<\/td><td[^>]*>1<\/td><td[^>]*>65<\/td><td[^>]*>2<\/td>/);
    expect(html).toMatch(/<div aria-hidden="true" class="mt-4 grid h-40/);
  });

  it("lists the most blocked sites with their counts in words", () => {
    expect(render({})).toContain("2 visits");
  });

  it("shows '–' and no today line for an empty week that is not the current one", () => {
    const html = render({ today: null, analytics: weekAnalytics([], [], "2026-11-16", "Europe/Lisbon") });
    expect(html).toContain(">–<");
    expect(html).not.toContain("Today:");
    expect(html).toContain("No blocked visits this week.");
  });
});
