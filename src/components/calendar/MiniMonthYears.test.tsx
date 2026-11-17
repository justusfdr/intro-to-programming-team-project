// The small month calendar's title opens the months of the year, and the year there opens 12 years.
// Rendered on the server, the calendar shows its days; the grids are tested through their pieces.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MiniMonth, firstOfYears } from "./MiniMonth";

describe("the month calendar's title", () => {
  it("is a button that offers choosing a month or year", () => {
    const html = renderToStaticMarkup(<MiniMonth value="2026-11-09" onChange={() => {}} todayKey="2026-11-16" />);
    expect(html).toMatch(/<button[^>]*aria-label="November 2026: choose a month or year"/);
    expect(html).toContain('aria-label="Previous month"');
  });

  it("shows 12 years in blocks that hold the year", () => {
    for (const year of [2016, 2020, 2026, 2027]) expect(firstOfYears(year)).toBe(2016);
    expect(firstOfYears(2028)).toBe(2028);
    expect(firstOfYears(1999)).toBe(1992);
  });
});
