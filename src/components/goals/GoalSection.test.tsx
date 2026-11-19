// The goal section's look (spec 10): a chevron that collapses it, the bar for this week's rules,
// rings for open rules and a check for met ones, and "Deadline passed" as a chip.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GoalView } from "@/lib/goals/types";
import { GoalCard } from "./GoalCard";

const GOAL: GoalView = {
  id: "g1",
  title: "Pass the statistics exam",
  deadline: "2026-12-18",
  autoBlock: false,
  updatedAt: "2026-11-15T10:00:00.000Z",
  colorIndex: 0,
  color: null,
  icon: "rocket",
  why: "",
  look: { color: "rose", icon: "rocket" },
  rules: [
    { id: "r1", kind: "count", target: 2, minMinutes: null },
    { id: "r2", kind: "hours", target: 6, minMinutes: null },
  ],
  progress: {
    thisWeek: [
      { ruleId: "r1", text: "This week: 2 of 2 done", status: "met" },
      { ruleId: "r2", text: "This week: 3 of 6 h", status: "open" },
    ],
    weeks: [{ monday: "2026-11-16", status: "open", isCurrent: true }],
    countdown: "31 days left",
  },
};

describe("goal section", () => {
  // Changed 18 Nov 2026 with Emily's approval (spec 47, R9): one row of days for every goal, "sessions" with the number in bold.
  it("is open by default: a chevron named 'Collapse …' and this week's rows", () => {
    const html = renderToStaticMarkup(<GoalCard goal={GOAL} onToggle={() => {}} />);
    expect(html).toMatch(/aria-expanded="true"[^>]*aria-label="Collapse Pass the statistics exam"/);
    expect(html).toMatch(/This week: <strong[^>]*>3<\/strong> of 6 h/);
    expect(html).toContain('aria-label="This week"');
  });

  it("collapsed, it keeps the header and the bar and hides the rows", () => {
    const html = renderToStaticMarkup(<GoalCard goal={GOAL} collapsed onToggle={() => {}} />);
    expect(html).toMatch(/aria-expanded="false"[^>]*aria-label="Expand Pass the statistics exam"/);
    expect(html).toContain("Pass the statistics exam");
    expect(html).toContain("31 days left");
    expect(html).not.toContain("of 6 h");
    expect(html).not.toContain('aria-label="This week"');
  });

  it("fills the bar to the average share of the rules (1 and 0.5 give 75%)", () => {
    expect(renderToStaticMarkup(<GoalCard goal={GOAL} />)).toContain("width:75%");
  });

  // Changed 18 Nov 2026 with Emily's approval (spec 47, R9): one row of days for every goal, "sessions" with the number in bold.
  it("strikes a met rule through, draws a check in the goal's colour, and says 'met' in words", () => {
    const html = renderToStaticMarkup(<GoalCard goal={GOAL} />);
    expect(html).toMatch(/line-through">This week: <strong[^>]*>2<\/strong> of 2 sessions<\/span><span class="sr-only">, met<\/span><svg[^>]*text-rose-600/);
  });

  it("shows 'Deadline passed' as a red chip", () => {
    const html = renderToStaticMarkup(<GoalCard goal={{ ...GOAL, progress: { ...GOAL.progress, countdown: "Deadline passed" } }} />);
    expect(html).toMatch(/bg-danger-soft[^"]*text-danger">Deadline passed</);
  });
});
