// The goal editor's "No end date" checkbox (spec 41): unticked for a dated or a new goal, ticked with the
// date field disabled for a goal without an end date. Rendered on the server, as the browser first
// receives it. Nothing of the routine is shown yet (spec 42).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { GoalView } from "@/lib/goals/types";
import { GoalEditor } from "./GoalEditor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const TODAY = "2026-11-16";

const DATED: GoalView = {
  id: "g1",
  title: "Run a half marathon",
  deadline: "2027-03-14",
  autoBlock: false,
  updatedAt: "2026-11-15T10:00:00.000Z",
  colorIndex: 0,
  color: null,
  icon: "footprints",
  why: "",
  look: { color: "teal", icon: "footprints" },
  rules: [{ id: "r1", kind: "count", target: 2, minMinutes: 45 }],
  progress: { thisWeek: [], weeks: [], countdown: "118 days left" },
};

const OPEN_ENDED: GoalView = {
  ...DATED,
  deadline: null,
  progress: { thisWeek: [], weeks: [], countdown: "No end date" },
  routine: { category: "sport", categoryOther: null, sessionMinutes: 60, dayPart: "morning", avoidDays: [7], location: "Park" },
};

const render = (state: Parameters<typeof GoalEditor>[0]["state"]) => renderToStaticMarkup(<GoalEditor state={state} onClose={() => {}} />);

describe("the goal editor's 'No end date'", () => {
  it("is unticked for a dated goal, whose date field stays usable", () => {
    const html = render({ mode: "edit", goal: DATED, today: TODAY });
    expect(html).toMatch(/<label for="goal-no-end-date"[^>]*><input id="goal-no-end-date" type="checkbox"[^>]*\/>No end date<\/label>/);
    expect(html).not.toMatch(/<input id="goal-no-end-date"[^>]*checked=""/);
    expect(html).not.toMatch(/<button id="goal-deadline"[^>]*disabled=""/);
  });

  it("is unticked for a new goal", () => {
    const html = render({ mode: "create", today: TODAY, color: "rose" });
    expect(html).toContain('id="goal-no-end-date"');
    expect(html).not.toMatch(/<input id="goal-no-end-date"[^>]*checked=""/);
  });

  it("is ticked for a goal without an end date, with the date field disabled and empty", () => {
    const html = render({ mode: "edit", goal: OPEN_ENDED, today: TODAY });
    expect(html).toMatch(/<input id="goal-no-end-date" type="checkbox"[^>]*checked=""/);
    expect(html).toMatch(/<button id="goal-deadline"[^>]*disabled=""/);
    expect(html).toContain('<input type="hidden" name="deadline" value=""/>');
  });

  it("shows nothing of the routine yet", () => {
    const html = render({ mode: "edit", goal: OPEN_ENDED, today: TODAY });
    expect(html).not.toContain("Park");
    expect(html).not.toMatch(/morning|Sport/i);
  });
});
