// The goal editor's "Routine" (spec 42): between the rules and auto-block, open for a new goal and
// folded with a count when editing; the category chips (none allowed), the own word with Other, the
// session length, the time of day, the days and the place; and exactly what it sends.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { EMPTY_ROUTINE, type GoalRoutine } from "@/lib/goals/routine";
import type { GoalView } from "@/lib/goals/types";
import { GoalEditor } from "./GoalEditor";
import { RoutineSection, routineBody, routineCount, routineValue } from "./RoutineSection";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const TODAY = "2026-11-16";
const ROUTINE: GoalRoutine = { category: "sport", categoryOther: null, sessionMinutes: 60, dayPart: "morning", avoidDays: [7], mustDays: [], location: "Park" };

const GOAL: GoalView = {
  id: "g1",
  title: "Run a half marathon",
  deadline: "2027-03-14",
  autoBlock: false,
  updatedAt: "2026-11-15T10:00:00.000Z",
  colorIndex: 0,
  color: "teal",
  icon: "footprints",
  why: "",
  look: { color: "teal", icon: "footprints" },
  rules: [{ id: "r1", kind: "count", target: 2, minMinutes: null }],
  progress: { thisWeek: [], weeks: [], countdown: "118 days left" },
};

const section = (routine: GoalRoutine | undefined) =>
  renderToStaticMarkup(<RoutineSection value={routineValue(routine)} onChange={() => {}} startOpen places={[{ id: "p1", name: "Gym", address: "FitnessHut Lisboa" }]} />);

describe("the Routine section in the goal editor", () => {
  it("sits between the rules and auto-block, open for a new goal with nothing chosen", () => {
    const html = renderToStaticMarkup(<GoalEditor state={{ mode: "create", today: TODAY, color: "rose" }} onClose={() => {}} />);
    const order = ["Every week", ">Routine<", 'for="goal-auto-block"'].map((part) => html.indexOf(part));
    expect(order.every((p) => p >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain("· Nothing set");
    expect(html).toMatch(/aria-expanded="true"[^>]*><svg[^>]*>.*<span[^>]*>Routine<\/span>/);
    expect(html.match(/<button type="button" aria-pressed="false" class="inline-flex h-9[^>]*>(Sport|Uni|Work|Personal|Other)<\/button>/g)).toHaveLength(5);
    expect(html).toMatch(/<option value="" selected="">None<\/option>/);
    expect(html).toMatch(/<option value="" selected="">Any time<\/option>/);
    expect(html.match(/aria-label="[A-Za-z]+day: possible"/g)).toHaveLength(7);
    expect(html).toMatch(/<input aria-label="Place" id="goal-place"[^>]*role="combobox"/);
  });

  it("is folded when editing, with a count of what is set; a goal without a routine says Nothing set", () => {
    const withRoutine = renderToStaticMarkup(<GoalEditor state={{ mode: "edit", goal: { ...GOAL, routine: ROUTINE }, today: TODAY }} onClose={() => {}} />);
    expect(withRoutine).toMatch(/aria-expanded="false"/);
    expect(withRoutine).toContain("· 5 details set");
    expect(withRoutine).not.toContain('id="goal-session"');
    const without = renderToStaticMarkup(<GoalEditor state={{ mode: "edit", goal: GOAL, today: TODAY }} onClose={() => {}} />);
    expect(without).toContain("· Nothing set");
  });

  it("opened, shows the saved routine: the category, the length, the time of day, the days and the place", () => {
    const html = section(ROUTINE);
    expect(html).toContain('<button type="button" aria-pressed="true" class="inline-flex h-9 items-center rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/50 border-ink bg-ink text-white">Sport</button>');
    expect(html).toContain('<option value="60" selected="">1 h</option>');
    expect(html).toContain('<option value="morning" selected="">Morning</option>');
    expect(html).toContain('<option value="240">4 h</option>');
    expect(html).toContain('aria-label="Sunday: never"');
    expect(html).toMatch(/id="goal-place"[^>]*value="Park"/);
    expect(html).toContain(">Gym</button>");
    expect(html).not.toContain("Your own word");
  });

  it("asks for the own word only with Other", () => {
    expect(section({ ...EMPTY_ROUTINE, category: "other", categoryOther: "Music" })).toMatch(/<input id="goal-category-other"[^>]*maxLength="30"[^>]*value="Music"/);
  });

  it("sends every field of the routine, null for none", () => {
    expect(routineBody(routineValue(ROUTINE))).toEqual({ category: "sport", categoryOther: null, sessionMinutes: 60, dayPart: "morning", avoidDays: [7], location: "Park" });
    expect(routineBody(routineValue(undefined))).toEqual({ category: null, categoryOther: null, sessionMinutes: null, dayPart: null, avoidDays: [], location: null });
    const typed = { ...routineValue(undefined), category: "other" as const, categoryOther: "  Music ", location: "  ", avoidDays: [6, 1] as (1 | 6)[] };
    expect(routineBody(typed)).toMatchObject({ categoryOther: "Music", location: null, avoidDays: [1, 6] });
    expect(routineBody({ ...typed, category: "uni" }).categoryOther).toBeNull();
    expect(routineCount(routineValue(ROUTINE))).toBe(5);
  });
});
