// The goal card of a goal without an end date (spec 41, R9): "No end date" where the countdown stands,
// shown quietly (not as a passed deadline), and the strip up to this week.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GoalView } from "@/lib/goals/types";
import { GoalCard } from "./GoalCard";

const GOAL: GoalView = {
  id: "g1",
  title: "Learn the guitar",
  deadline: null,
  autoBlock: false,
  updatedAt: "2026-11-15T10:00:00.000Z",
  colorIndex: 0,
  color: null,
  icon: "rocket",
  why: "",
  look: { color: "rose", icon: "rocket" },
  rules: [{ id: "r1", kind: "count", target: 2, minMinutes: null }],
  progress: {
    thisWeek: [{ ruleId: "r1", text: "This week: 0 of 2 done", status: "open" }],
    weeks: [
      { monday: "2026-11-09", status: "met", isCurrent: false },
      { monday: "2026-11-16", status: "open", isCurrent: true },
    ],
    countdown: "No end date",
  },
};

describe("goal card without an end date", () => {
  const html = renderToStaticMarkup(<GoalCard goal={GOAL} />);

  it("says 'No end date' where the countdown stands, not in the warning style", () => {
    expect(html).toContain('<span class="tabular">No end date</span>');
    expect(html).not.toContain("Deadline passed");
    expect(html).not.toContain("text-danger");
  });

  // Changed 18 Nov 2026 with Emily's approval (spec 47, R9): one row of days for every goal, "sessions" with the number in bold.
  it("looks like every other goal: no strip of weeks", () => {
    expect(html).not.toContain("Week of Nov");
    expect(html).toMatch(/This week: <strong[^>]*>0<\/strong> of 2 sessions/);
  });
});
