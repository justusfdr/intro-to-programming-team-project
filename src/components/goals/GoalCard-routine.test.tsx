// The goal card's routine (spec 42): one quiet line of tags under the title, only what is set, the
// category's name first, the time of day said with its times in the person's format; a goal without a
// routine shows no such line.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DisplayProvider } from "@/components/shell/DisplayProvider";
import { EMPTY_ROUTINE } from "@/lib/goals/routine";
import type { GoalView } from "@/lib/goals/types";
import { GoalCard } from "./GoalCard";

const GOAL: GoalView = {
  id: "g1",
  title: "Gym",
  deadline: "2026-12-12",
  autoBlock: false,
  updatedAt: "2026-11-15T10:00:00.000Z",
  colorIndex: 0,
  color: "teal",
  icon: "dumbbell",
  why: "",
  look: { color: "teal", icon: "dumbbell" },
  rules: [{ id: "r1", kind: "count", target: 3, minMinutes: null }],
  progress: { thisWeek: [{ ruleId: "r1", text: "This week: 0 of 3 done", status: "open" }], weeks: [], countdown: "26 days left" },
};

const ROUTINE = { category: "sport" as const, categoryOther: null, sessionMinutes: 60, dayPart: "evening" as const, avoidDays: [5, 6] as (5 | 6)[], location: "FitnessHut Lisboa" };

describe("the goal card's routine", () => {
  it("shows the routine's tags under the title, only what is set", () => {
    const html = renderToStaticMarkup(<GoalCard goal={{ ...GOAL, routine: ROUTINE }} />);
    expect(html).toContain('<ul aria-label="Routine of Gym"');
    const shown = [...html.matchAll(/<span aria-hidden="true" class="truncate">([^<]+)<\/span>/g)].map((m) => m[1]);
    expect(shown).toEqual(["Sport", "60 min", "Evenings", "Not Fri, Sat", "FitnessHut Lisboa"]);
    expect(html).toContain('<span class="sr-only">Evenings, after 5pm</span>');
    expect(html).toContain('<span class="sr-only">Never on Friday and Saturday</span>');
    expect(html.indexOf("Routine of Gym")).toBeGreaterThan(html.indexOf(">Gym</span>"));
  });

  it("says the times in 24 hours when the person uses them, and the own word of Other", () => {
    const html = renderToStaticMarkup(
      <DisplayProvider value={{ timeFormat: "24h", dayStartHour: 7, dayEndHour: 21 }}>
        <GoalCard goal={{ ...GOAL, routine: { ...EMPTY_ROUTINE, category: "other", categoryOther: "Music", dayPart: "morning" } }} />
      </DisplayProvider>,
    );
    expect(html).toContain(">Music</span>");
    expect(html).toContain('<span class="sr-only">Mornings, before 12:00</span>');
  });

  it("without a routine looks exactly as before", () => {
    expect(renderToStaticMarkup(<GoalCard goal={GOAL} />)).not.toContain("Routine of");
    expect(renderToStaticMarkup(<GoalCard goal={GOAL} />)).toBe(renderToStaticMarkup(<GoalCard goal={{ ...GOAL, routine: undefined }} />));
  });
});
