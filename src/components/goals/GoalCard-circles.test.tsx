// The circles under a goal's rules (R9): round, in the goal's colour, one per session or per hour.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GoalView } from "@/lib/goals/types";
import { GoalCard } from "./GoalCard";

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
  rules: [{ id: "r1", kind: "count", target: 6, minMinutes: 45 }],
  progress: {
    thisWeek: [{ ruleId: "r1", text: "This week: 2 of 6 done", status: "open" }],
    weeks: [{ monday: "2026-11-16", status: "open", isCurrent: true }],
    countdown: "No end date",
  },
};

const circlesOf = (html: string) => html.match(/rounded-full border-\[1\.5px\] border-teal-500/g) ?? [];

describe("goal card circles", () => {
  it("shows one round circle per session, the done ones filled in the goal's colour", () => {
    const html = renderToStaticMarkup(<GoalCard goal={GOAL} />);
    expect(circlesOf(html)).toHaveLength(6);
    expect(html.match(/bg-teal-500" style="width:100%"/g)).toHaveLength(2);
    expect(html).toContain('title="1 circle = 1 session"');
    // The rule's words stay, so nothing depends on the circles alone.
    expect(html).toContain("This week: 2 of 6 done");
  });

  it("shows one circle per hour for an hours rule", () => {
    const goal = { ...GOAL, progress: { ...GOAL.progress, thisWeek: [{ ruleId: "r1", text: "This week: 1.5 of 6 h", status: "open" as const }] } };
    const html = renderToStaticMarkup(<GoalCard goal={goal} />);
    expect(circlesOf(html)).toHaveLength(6);
    expect(html).toContain('style="width:50%"');
    expect(html).toContain('title="1 circle = 1 hour"');
  });

  it("puts the circles of a goal with one rule at the right of the title, also while collapsed", () => {
    const html = renderToStaticMarkup(<GoalCard goal={GOAL} collapsed onToggle={() => {}} />);
    expect(circlesOf(html)).toHaveLength(6);
    expect(html.indexOf("Go to the gym")).toBeLessThan(html.indexOf('title="1 circle = 1 session"'));
    expect(html).not.toContain("This week: 2 of 6 done");
  });

  it("draws a white check in a done circle", () => {
    const html = renderToStaticMarkup(<GoalCard goal={GOAL} />);
    expect(html.match(/lucide-check relative size-2\.5 text-white/g)).toHaveLength(2);
  });

  it("shows this week's 7 days instead of the weeks for a goal without an end date", () => {
    const days = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"].map((date, i) => ({
      date,
      done: i === 0 || i === 2,
      isToday: i === 3,
    }));
    const html = renderToStaticMarkup(<GoalCard goal={{ ...GOAL, progress: { ...GOAL.progress, days } }} />);
    expect(html).toContain('aria-label="Days this week"');
    expect(html).not.toContain('aria-label="Weeks"');
    expect(html).toContain("Monday, Nov 16: done");
    expect(html).toContain("Tuesday, Nov 17: no session");
    expect(html).toContain("Thursday, Nov 19 (today): no session");
    // Days without a session stay empty: never a cross.
    expect(html).not.toContain("lucide-x");
  });

  it("keeps the strip of weeks for a goal with a deadline, also when it has days", () => {
    const days = [{ date: "2026-11-16", done: true, isToday: true }];
    const html = renderToStaticMarkup(<GoalCard goal={{ ...GOAL, deadline: "2026-12-31", progress: { ...GOAL.progress, days } }} />);
    expect(html).toContain('aria-label="Weeks"');
    expect(html).not.toContain('aria-label="Days this week"');
  });

  it("keeps the circles under each line when a goal has several rules", () => {
    const two = {
      ...GOAL,
      progress: {
        ...GOAL.progress,
        thisWeek: [
          { ruleId: "r1", text: "This week: 2 of 6 done", status: "open" as const },
          { ruleId: "r2", text: "This week: 1 of 3 h", status: "open" as const },
        ],
      },
    };
    const html = renderToStaticMarkup(<GoalCard goal={two} />);
    expect(circlesOf(html)).toHaveLength(9);
    const list = html.slice(html.indexOf('aria-label="This week"'));
    expect(circlesOf(list)).toHaveLength(9);
  });
});
