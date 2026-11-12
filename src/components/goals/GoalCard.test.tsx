// The goal card's markup (R9): texts as in the ontology, every status in words, nothing by colour alone.
// Rewritten for the prototype-style branch (spec 12): week labels are month-first ("Week of Nov 2").
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GoalView } from "@/lib/goals/types";
import { GoalCard } from "./GoalCard";

const GOAL: GoalView = {
  id: "g1",
  title: "Run a half marathon",
  deadline: "2026-11-28",
  autoBlock: true,
  updatedAt: "2026-11-15T10:00:00.000Z",
  colorIndex: 1,
  rules: [
    { id: "r1", kind: "count", target: 2, minMinutes: 45 },
    { id: "r2", kind: "hours", target: 6, minMinutes: null },
  ],
  progress: {
    thisWeek: [
      { ruleId: "r1", text: "This week: 1 of 2 done", status: "open" },
      { ruleId: "r2", text: "This week: 3.5 of 6 h", status: "open" },
    ],
    weeks: [
      { monday: "2026-11-02", status: "met", isCurrent: false },
      { monday: "2026-11-09", status: "missed", isCurrent: false },
      { monday: "2026-11-16", status: "open", isCurrent: true },
      { monday: "2026-11-23", status: "open", isCurrent: false },
    ],
    countdown: "12 days left",
  },
};

describe("goal card", () => {
  const html = renderToStaticMarkup(<GoalCard goal={GOAL} />);

  it("shows the title, the countdown and each rule's text", () => {
    expect(html).toContain("Run a half marathon");
    expect(html).toContain("12 days left");
    expect(html).toContain("This week: 1 of 2 done");
    expect(html).toContain("This week: 3.5 of 6 h");
  });

  it("says every week's status in words, marks this week, and draws a symbol for met and missed", () => {
    expect(html).toContain("Week of Nov 2: met");
    expect(html).toContain("Week of Nov 9: missed");
    expect(html).toContain("Week of Nov 16 (this week): open");
    expect(html.match(/<svg/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("uses the goal's calculated colour and mentions auto-block", () => {
    expect(html).toContain("bg-teal-500");
    expect(html).toContain("Auto-block on");
  });

  it("shows 'Deadline passed' in words", () => {
    const passed = renderToStaticMarkup(<GoalCard goal={{ ...GOAL, progress: { ...GOAL.progress, countdown: "Deadline passed" } }} />);
    expect(passed).toContain("Deadline passed");
  });
});
