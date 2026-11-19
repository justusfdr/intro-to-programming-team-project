// One goal card for every goal (R9, changed 18 Nov 2026, spec 47): "2/3" next to the title, the rule
// with the number done in bold, and one row with the 7 days of this week: done, missed, planned, empty.
// Rewritten from the circles tests of spec 46 with Emily's approval: the circles went.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { StripDay } from "@/lib/goals/progress";
import type { GoalView } from "@/lib/goals/types";
import { GoalCard } from "./GoalCard";

const DATES = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"];
// Thursday: Monday done, Tuesday missed, Wednesday done, today planned, Saturday planned.
const DAYS: StripDay[] = DATES.map((date, i) => ({
  date,
  done: i === 0 || i === 2,
  isToday: i === 3,
  missed: i === 1,
  planned: i === 3 || i === 5,
}));

const GOAL: GoalView = {
  id: "g1",
  title: "Go to the gym",
  deadline: null,
  autoBlock: false,
  updatedAt: "2026-11-15T10:00:00.000Z",
  colorIndex: 1,
  color: "teal",
  icon: "footprints",
  why: "",
  look: { color: "teal", icon: "footprints" },
  rules: [{ id: "r1", kind: "count", target: 3, minMinutes: null }],
  progress: {
    thisWeek: [{ ruleId: "r1", text: "This week: 2 of 3 done", status: "open" }],
    weeks: [{ monday: "2026-11-16", status: "open", isCurrent: true }],
    countdown: "No end date",
    days: DAYS,
  },
};

const render = (goal: GoalView, collapsed = false) => renderToStaticMarkup(<GoalCard goal={goal} collapsed={collapsed} onToggle={() => {}} />);

describe("goal card days", () => {
  it("says how far the goal is next to the title, also while collapsed", () => {
    for (const html of [render(GOAL), render(GOAL, true)]) {
      expect(html).toMatch(/text-teal-600">2\/3</);
      expect(html.indexOf("Go to the gym")).toBeLessThan(html.indexOf(">2/3<"));
    }
    const hours = { ...GOAL, progress: { ...GOAL.progress, thisWeek: [{ ruleId: "r1", text: "This week: 1.5 of 6 h", status: "open" as const }] } };
    expect(render(hours)).toContain(">1.5/6 h<");
  });

  it("writes the rule with the number done in bold and the word sessions", () => {
    expect(render(GOAL)).toMatch(/This week: <strong[^>]*>2<\/strong> of 3 sessions/);
    const one = { ...GOAL, progress: { ...GOAL.progress, thisWeek: [{ ruleId: "r1", text: "This week: 0 of 1 done", status: "open" as const }] } };
    expect(render(one)).toMatch(/<strong[^>]*>0<\/strong> of 1 session</);
  });

  it("shows the 7 days, each said in words, today ringed", () => {
    const html = render(GOAL);
    expect(html).toContain('aria-label="Days this week"');
    expect(html.match(/rounded-full[^"]*size-6|size-6[^"]*rounded-full/g)).toHaveLength(7);
    expect(html).toContain("Monday, Nov 16: done");
    expect(html).toContain("Tuesday, Nov 17: planned, not done");
    expect(html).toContain("Thursday, Nov 19 (today): planned");
    expect(html).toContain("Friday, Nov 20: nothing planned");
    expect(html).toContain("Saturday, Nov 21: planned");
    expect(html.match(/ring-2 ring-ink\/70/g)).toHaveLength(1);
  });

  it("fills a done day in the goal's colour with a check, crosses a missed one, dashes a planned one", () => {
    const html = render(GOAL);
    expect(html.match(/bg-teal-500 text-white/g)).toHaveLength(2);
    expect(html.match(/bg-danger-soft text-danger/g)).toHaveLength(1);
    expect(html.match(/lucide-x/g)).toHaveLength(1);
    expect(html.match(/border-dashed border-teal-500/g)).toHaveLength(2);
  });

  it("never crosses a rest day", () => {
    const rest = DATES.map((date, i) => ({ date, done: false, isToday: i === 6 }));
    expect(render({ ...GOAL, progress: { ...GOAL.progress, days: rest } })).not.toContain("lucide-x");
  });

  it("looks the same for a goal with a deadline: days, no weeks", () => {
    const html = render({ ...GOAL, deadline: "2026-12-31", progress: { ...GOAL.progress, countdown: "43 days left" } });
    expect(html).toContain('aria-label="Days this week"');
    expect(html).not.toContain('aria-label="Weeks"');
    expect(html).not.toContain("Week of");
  });

  it("hides the days while collapsed and shows no number next to the title for a goal with several rules", () => {
    expect(render(GOAL, true)).not.toContain('aria-label="Days this week"');
    const two = {
      ...GOAL,
      progress: {
        ...GOAL.progress,
        thisWeek: [
          { ruleId: "r1", text: "This week: 2 of 3 done", status: "open" as const },
          { ruleId: "r2", text: "This week: 1 of 3 h", status: "open" as const },
        ],
      },
    };
    const html = render(two);
    expect(html).not.toContain(">2/3<");
    expect(html).toMatch(/<strong[^>]*>1<\/strong> of 3 h/);
  });
});
