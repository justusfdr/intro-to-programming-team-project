// The goal editor's markup (spec 03, G5; spec 13): laid out like the prototype's goal dialog (name, why
// it matters, colour dots, icon grid), then deadline, rules and auto-block; the goal filled in, the
// delete button, and a remove button per rule. Rendered on the server, as the browser first receives it.
// Rewritten for spec 39: the deadline is the app's date field (a new test below); the older tests still
// find its value and its label.
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
  color: "teal",
  icon: "footprints",
  why: "Stay fit, even when the semester gets busy.",
  look: { color: "teal", icon: "footprints" },
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
  it("names the name, why, the minimum minutes and the auto-block switch with real labels (spec 12)", () => {
    const html = renderToStaticMarkup(<GoalEditor state={{ mode: "edit", goal: GOAL, today: TODAY }} onClose={() => {}} />);
    expect(html).toMatch(/<label for="goal-title"[^>]*>Name<\/label>/);
    expect(html).toMatch(/<label for="goal-why"[^>]*>Why it matters<\/label>/);
    expect(html).toMatch(/<label for="rule-[^"]+-min"[^>]*>Minimum minutes per event \(optional\)<\/label>/);
    expect(html).toMatch(/<label for="goal-auto-block"[^>]*>Auto-block distracting sites during this goal&#x27;s events<\/label>/);
    expect(html).toMatch(/<input id="goal-auto-block"[^>]*aria-describedby="goal-auto-block-hint"/);
    expect(html).toContain("Needs the Chrome extension, see Settings.");
  });

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

    const create = renderToStaticMarkup(<GoalEditor state={{ mode: "create", today: TODAY, color: "rose" }} onClose={() => {}} />);
    expect(create).not.toContain('aria-label="Delete ');
    expect(create).not.toContain("Edit goal");
  });

  it("'Add rule' is offered when creating a goal and not when editing one", () => {
    const edit = renderToStaticMarkup(<GoalEditor state={{ mode: "edit", goal: GOAL, today: TODAY }} onClose={() => {}} />);
    expect(edit).not.toContain("Add rule");
    const create = renderToStaticMarkup(<GoalEditor state={{ mode: "create", today: TODAY, color: "rose" }} onClose={() => {}} />);
    expect(create).toContain("Add rule");
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

  it("shows the prototype's order: name, why, colour, icon, then deadline, rules and auto-block", () => {
    const html = renderToStaticMarkup(<GoalEditor state={{ mode: "edit", goal: GOAL, today: TODAY }} onClose={() => {}} />);
    const order = ['for="goal-title"', 'for="goal-why"', 'aria-label="Color"', 'aria-label="Icon"', 'for="goal-deadline"', "Every week", 'for="goal-auto-block"'];
    const positions = order.map((part) => html.indexOf(part));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("offers the ten colours and ten icons by name, with the goal's own pressed", () => {
    const html = renderToStaticMarkup(<GoalEditor state={{ mode: "edit", goal: GOAL, today: TODAY }} onClose={() => {}} />);
    for (const name of ["Rose", "Teal", "Indigo", "Amber", "Green", "Pink", "Sky", "Violet", "Orange", "Slate"]) {
      expect(html).toMatch(new RegExp(`aria-label="${name}" aria-pressed="(true|false)"`));
    }
    for (const name of ["Rocket", "Footprints", "Heart", "Video", "Book", "Dumbbell", "Briefcase", "Graduation cap", "Palette", "Code"]) {
      expect(html).toMatch(new RegExp(`aria-label="${name}" aria-pressed="(true|false)"`));
    }
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Teal" aria-pressed="true"');
    expect(html).toContain('aria-label="Footprints" aria-pressed="true"');
    expect(html).toContain('value="Stay fit, even when the semester gets busy."');
  });

  // Spec 39: the deadline is the event editor's date field instead of the browser's date input.
  it("shows the deadline as the app's date field ('Sun, Mar 14') that sends 'YYYY-MM-DD' with the form", () => {
    const html = renderToStaticMarkup(<GoalEditor state={{ mode: "edit", goal: GOAL, today: TODAY }} onClose={() => {}} />);
    expect(html).not.toContain('type="date"');
    expect(html).toContain('<input type="hidden" name="deadline" value="2027-03-14"/>');
    expect(html).toMatch(/<button id="goal-deadline" type="button" aria-expanded="false" aria-label="Deadline: Sun, Mar 14"[^>]*>.*>Sun, Mar 14<\/span><\/button>/);
    // A new goal has no deadline yet: a quiet "Choose a deadline", sent empty (the server names the problem).
    const create = renderToStaticMarkup(<GoalEditor state={{ mode: "create", today: TODAY, color: "rose" }} onClose={() => {}} />);
    expect(create).toContain('<input type="hidden" name="deadline" value=""/>');
    expect(create).toMatch(/aria-label="Deadline"[^>]*>.*<span class="[^"]*text-ink-3">Choose a deadline<\/span>/);
  });

  it("starts a new goal with the suggested colour and the rocket, and offers Cancel and Create", () => {
    const html = renderToStaticMarkup(<GoalEditor state={{ mode: "create", today: TODAY, color: "amber" }} onClose={() => {}} />);
    expect(html).toContain("New goal");
    expect(html).toContain('aria-label="Amber" aria-pressed="true"');
    expect(html).toContain('aria-label="Rocket" aria-pressed="true"');
    expect(html).toContain(">Cancel</button>");
    expect(html).toContain(">Create</button>");
  });
});
