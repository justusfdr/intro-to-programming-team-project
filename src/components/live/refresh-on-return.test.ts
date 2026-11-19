// Spec 54 (changed 19 Nov 2026): the page's own data is re-read when the window comes back, at most once
// every 10 seconds.
import { describe, expect, it } from "vitest";
import { REFRESH_GAP_MS, shouldRefresh } from "./refresh-on-return";

describe("re-reading when the window comes back", () => {
  const loaded = Date.parse("2026-11-19T10:00:00Z");

  it("not within 10 seconds of the last read (focus and visibility often come together)", () => {
    expect(REFRESH_GAP_MS).toBe(10_000);
    expect(shouldRefresh(loaded, loaded)).toBe(false);
    expect(shouldRefresh(loaded, loaded + 1)).toBe(false);
    expect(shouldRefresh(loaded, loaded + 9_999)).toBe(false);
  });

  it("from 10 seconds on", () => {
    expect(shouldRefresh(loaded, loaded + 10_000)).toBe(true);
    expect(shouldRefresh(loaded, loaded + 60 * 60_000)).toBe(true);
  });

  it("also when the clock went back", () => {
    expect(shouldRefresh(loaded, loaded - 1)).toBe(true);
  });
});

describe("where it is used", () => {
  it("the calendar re-reads with live.refresh, the People page with router.refresh", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const calendar = readFileSync(join(__dirname, "../calendar/CalendarView.tsx"), "utf8");
    const people = readFileSync(join(__dirname, "../people/PeopleView.tsx"), "utf8");
    expect(calendar).toContain("useRefreshOnReturn(live.refresh)");
    expect(people).toMatch(/useRefreshOnReturn\(refreshPage\)/);
    expect(people).toContain("const refreshPage = useCallback(() => router.refresh(), [router]);");
  });
});
