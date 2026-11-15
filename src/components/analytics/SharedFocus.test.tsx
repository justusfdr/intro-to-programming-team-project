// "Shared with you" on the Analytics page (spec 29): only when a contact shares a focus chart, labelled
// with the person's name, with a person picker when there are several; nothing of theirs before the
// chart is read.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { weekAnalytics } from "@/lib/analytics/score";
import type { AnalyticsData } from "@/lib/analytics/types";
import type { SharingPerson } from "@/lib/shares/types";
import { AnalyticsView } from "./AnalyticsView";
import { SharedFocus } from "./SharedFocus";

const ANA: SharingPerson = { userId: "a", name: "Ana", photoUrl: null, calendar: "none", focus: true };
const BEN: SharingPerson = { userId: "b", name: "Ben", photoUrl: null, calendar: "busy", focus: true };

const DATA: AnalyticsData = {
  timeZone: "Europe/Lisbon",
  monday: "2026-11-16",
  previous: "2026-11-09",
  next: "2026-11-23",
  thisWeek: "2026-11-16",
  today: "2026-11-16",
  analytics: weekAnalytics([], [], "2026-11-16", "Europe/Lisbon"),
};

describe("Shared with you", () => {
  it("is not on the page when nobody shares a focus chart", () => {
    expect(renderToStaticMarkup(<AnalyticsView data={DATA} />)).not.toContain("Shared with you");
  });

  it("names the person on both charts; a picker only with several people, starting with the one the address names", () => {
    const one = renderToStaticMarkup(<SharedFocus people={[ANA]} />);
    expect(one).toContain(">Shared with you</h2>");
    expect(one).toContain('aria-label="Ana&#x27;s focus time per week"');
    expect(one).toContain(">Ana · this week</h3>");
    expect(one).not.toContain("<select");
    const two = renderToStaticMarkup(<SharedFocus people={[ANA, BEN]} initial="b" />);
    expect(two).toMatch(/<option value="b" selected="">Ben<\/option>/);
    expect(two).toContain(">Ben · focus time per week</h3>");
  });
});
