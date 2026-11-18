// Spec 43: the two ways into the coach from a goal: the setup's success screen and the goal card.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { chooseCategory, emptyAnswers } from "@/lib/goals/setup";
import type { GoalView } from "@/lib/goals/types";
import { GoalCard } from "./GoalCard";
import { Celebration } from "./setup/Review";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const ID = "0b9c8d7e-6f5a-4b3c-9d2e-1f0a9b8c7d6e";

const GOAL: GoalView = {
  id: ID,
  title: "Gym",
  deadline: "2026-12-12",
  autoBlock: true,
  updatedAt: "2026-11-15T10:00:00.000Z",
  colorIndex: 0,
  color: "teal",
  icon: "dumbbell",
  why: "",
  look: { color: "teal", icon: "dumbbell" },
  rules: [{ id: "r1", kind: "count", target: 3, minMinutes: null }],
  progress: { thisWeek: [{ ruleId: "r1", text: "This week: 0 of 3 done", status: "open" }], weeks: [], countdown: "26 days left" },
  routine: { category: "sport", categoryOther: null, sessionMinutes: 60, dayPart: "evening", avoidDays: [5], mustDays: [], dayFrom: null, dayUntil: null, location: "FitnessHut" },
};

describe("the goal card's 'Plan with coach'", () => {
  it("is a quiet link at the end of the caption, after the title, the tags and the rules", () => {
    const html = renderToStaticMarkup(<GoalCard goal={GOAL} />);
    expect(html).toContain(`href="/coach?plan=${ID}"`);
    expect(html).toContain('aria-label="Plan Gym with the coach"');
    expect(html).toContain(">Plan with coach</a>");
    const link = html.indexOf("Plan with coach");
    // Changed 18 Nov 2026 with Emily's approval (spec 47): the rule now reads "of 3 sessions".
    for (const before of [">Gym</span>", "Routine of Gym", "of 3 sessions", "26 days left", "Auto-block on"]) {
      expect(html.indexOf(before), before).toBeLessThan(link);
    }
    // Small and grey like the caption, no button look.
    const anchor = html.slice(html.lastIndexOf("<a", link), link);
    expect(anchor).toContain("text-ink-3");
    expect(anchor).not.toMatch(/rounded-full|bg-ink/);
  });

  it("is there for a goal without a routine too, also while collapsed", () => {
    const html = renderToStaticMarkup(<GoalCard goal={{ ...GOAL, routine: undefined }} collapsed onToggle={() => {}} />);
    expect(html).toContain(`href="/coach?plan=${ID}"`);
  });
});

describe("the setup's success screen", () => {
  const answers = { ...chooseCategory(emptyAnswers("teal"), "sport"), title: "Gym" };

  it("offers 'Let the coach plan it into my week' next to 'Done'", () => {
    const html = renderToStaticMarkup(<Celebration answers={answers} onDone={() => {}} goalId={ID} />);
    expect(html).toContain(`href="/coach?plan=${ID}"`);
    expect(html).toContain("Let the coach plan it into my week</a>");
    expect(html).toContain("Done</button>");
  });

  it("without the new goal's id shows only 'Done'", () => {
    const html = renderToStaticMarkup(<Celebration answers={answers} onDone={() => {}} />);
    expect(html).not.toContain("/coach");
    expect(html).toContain("Done</button>");
  });
});
