// The goal editor's markup in edit mode (spec 03, G5): the goal filled in, the delete button, and a
// remove button per rule. Rendered on the server, as the browser first receives it.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { GoalView } from "@/lib/goals/types";
import { GoalEditor } from "./GoalEditor";

// The editor uses the router; outside a running Next.js app there is none, so give it a stand-in.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const TODAY = "2026-11-16";

const GOAL: GoalView = {
  id: "g1",
  title: "Run a half marathon",
  deadline: "2027-03-14",
  autoBlock: true,
  updatedAt: "2026-11-15T10:00:00.000Z",
  colorIndex: 0,
  rules: [
    { id: "r1", kind: "count", target: 2, minMinutes: 45 },
    { id: "r2", kind: "hours", target: 6, minMinutes: null },
  ],
  progress: {
    thisWeek: [
      { ruleId: "r1", text: "This week: 1 of 2 done", status: "open" },
      { ruleId: "r2", text: "This week: 3.5 of 6 h", status: "open" },
    ],
    weeks: [{ monday: "2026-11-16", status: "open", isCurrent: true }],
    countdown: "116 days left",
  },
};

const ONE_RULE: GoalView = { ...GOAL, rules: [GOAL.rules[0]] };

describe("goal editor in edit mode", () => {
  it("edit mode renders the goal's title, deadline, auto-block state and every rule prefilled", () => {
    const html = renderToStaticMarkup(<GoalEditor state={{ mode: "edit", goal: GOAL, today: TODAY }} onClose={() => {}} />);
    expect(html).toContain("Edit goal");
    expect(html).toContain('value="Run a half marathon"');
    expect(html).toContain('value="2027-03-14"');
    expect(html).toMatch(/<input[^>]*id="goal-auto-block"[^>]*checked=""/);
    expect(html).toMatch(/<option value="count"[^>]*selected=""/);
    expect(html).toMatch(/<option value="hours"[^>]*selected=""/);
    expect(html).toContain('value="2"');
    expect(html).toContain('value="6"');
    expect(html).toContain('value="45"');
  });

  it("edit mode has 'Save' and a button named 'Delete <title>'; create mode has neither the delete button nor 'Edit goal'", () => {
    const edit = renderToStaticMarkup(<GoalEditor state={{ mode: "edit", goal: GOAL, today: TODAY }} onClose={() => {}} />);
    expect(edit).toContain("Save");
    expect(edit).toContain('aria-label="Delete Run a half marathon"');

    const create = renderToStaticMarkup(<GoalEditor state={{ mode: "create", today: TODAY }} onClose={() => {}} />);
    expect(create).not.toContain('aria-label="Delete ');
    expect(create).not.toContain("Edit goal");
  });

  it("each existing rule's trash button is named 'Remove rule <n>' and is disabled when it is the only rule", () => {
    const two = renderToStaticMarkup(<GoalEditor state={{ mode: "edit", goal: GOAL, today: TODAY }} onClose={() => {}} />);
    const firstOfTwo = two.match(/<button[^>]*aria-label="Remove rule 1"[^>]*>/)?.[0] ?? "";
    expect(firstOfTwo).not.toBe("");
    expect(firstOfTwo).not.toMatch(/ disabled=""/);

    const one = renderToStaticMarkup(<GoalEditor state={{ mode: "edit", goal: ONE_RULE, today: TODAY }} onClose={() => {}} />);
    const onlyRule = one.match(/<button[^>]*aria-label="Remove rule 1"[^>]*>/)?.[0] ?? "";
    expect(onlyRule).not.toBe("");
    expect(onlyRule).toMatch(/ disabled=""/);
  });
});
