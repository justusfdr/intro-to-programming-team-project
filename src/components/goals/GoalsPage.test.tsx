// The Goals page (spec 39): the title with "New goal", the goals as cards in a grid of one, two
// (from 768 px) and three (from 1280 px) columns, no Inbox card, and the empty state.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { GoalView } from "@/lib/goals/types";
import type { TaskDto } from "@/lib/tasks/types";
import { GoalsPage } from "./GoalsPage";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

function goal(id: string, title: string, color: GoalView["look"]["color"]): GoalView {
  return {
    id,
    title,
    deadline: "2027-03-14",
    autoBlock: false,
    updatedAt: "2026-11-15T10:00:00.000Z",
    colorIndex: 0,
    color,
    icon: "rocket",
    why: "",
    look: { color, icon: "rocket" },
    rules: [{ id: `${id}-r`, kind: "count", target: 2, minMinutes: null }],
    progress: {
      thisWeek: [{ ruleId: `${id}-r`, text: "This week: 1 of 2 done", status: "open" }],
      weeks: [{ monday: "2026-11-16", status: "open", isCurrent: true }],
      countdown: "118 days left",
    },
  };
}

const TASK: TaskDto = { id: "t1", title: "Call the bank", goalId: null, dueDate: null, status: "open", doneAt: null };

const render = (goals: GoalView[], tasks: TaskDto[] = []) => renderToStaticMarkup(<GoalsPage goals={goals} tasks={tasks} today="2026-11-17" />);

describe("the Goals page", () => {
  it("has the title 'Goals' as the page heading and a 'New goal' button", () => {
    const html = render([goal("g1", "Half marathon", "teal")]);
    expect(html).toMatch(/<h1[^>]*>Goals<\/h1>/);
    expect(html).toMatch(/<button type="button"[^>]*>.*New goal<\/button>/);
  });

  it("lays the goals out as cards in a grid: one column, two from 768 px, three from 1280 px", () => {
    const html = render([goal("g1", "Half marathon", "teal"), goal("g2", "Launch app", "indigo")]);
    expect(html).toMatch(/class="[^"]*grid grid-cols-1[^"]*md:grid-cols-2[^"]*xl:grid-cols-3/);
    expect(html.match(/<div class="min-w-0 rounded-card border/g)).toHaveLength(2);
    // Each goal keeps its colour, its edit button and its collapse button.
    expect(html).toContain("bg-teal-500");
    expect(html).toContain('aria-label="Edit goal Launch app"');
    expect(html).toContain('aria-label="Collapse Half marathon"');
  });

  it("shows only the goals, no Inbox card", () => {
    const html = render([goal("g1", "Half marathon", "teal")], [TASK]);
    expect(html).toContain('aria-label="Half marathon"');
    expect(html).not.toContain("Inbox");
  });

  it("without goals says so and shows no Inbox", () => {
    const html = render([]);
    expect(html).toContain("No goals yet. Add one, link events to it, and see each week here.");
    expect(html).not.toContain("Inbox");
  });
});
