// The tasks in the goals column (spec 11): rows in R33's order with a real ring button, the date chip
// (red with "overdue" for screen readers before today), done tasks struck through, the open count in
// each header, "Add task" per section, and "Inbox" always at the bottom.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PanelState } from "@/components/shell/PanelState";
import type { GoalView } from "@/lib/goals/types";
import type { TaskDto } from "@/lib/tasks/types";
import { GoalsPanel } from "./GoalsPanel";
import { TaskForm, TaskList } from "./TaskList";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const GOAL: GoalView = {
  id: "g1",
  title: "Half marathon",
  deadline: "2027-03-14",
  autoBlock: false,
  updatedAt: "2026-11-15T10:00:00.000Z",
  colorIndex: 1,
  rules: [{ id: "r1", kind: "count", target: 2, minMinutes: 45 }],
  progress: {
    thisWeek: [{ ruleId: "r1", text: "This week: 1 of 2 done", status: "open" }],
    weeks: [{ monday: "2026-11-16", status: "open", isCurrent: true }],
    countdown: "118 days left",
  },
};

function task(id: string, change: Partial<TaskDto> = {}): TaskDto {
  return { id, title: id, goalId: "g1", dueDate: null, status: "open", doneAt: null, ...change };
}

const TODAY = "2026-11-17";

function list(tasks: TaskDto[], colorIndex: number | null = 1) {
  return renderToStaticMarkup(
    <TaskList tasks={tasks} goalId="g1" colorIndex={colorIndex} sectionTitle="Half marathon" today={TODAY} goals={[{ id: "g1", title: "Half marathon" }]} />,
  );
}

describe("task rows", () => {
  it("makes the ring a button named 'Mark '…' done' in the goal's colour, and the title a button that opens the form", () => {
    const html = list([task("Buy running shoes")]);
    expect(html).toMatch(/<button type="button" aria-label="Mark &#x27;Buy running shoes&#x27; done"/);
    expect(html).toContain("border-teal-500");
    expect(html).toContain('aria-label="Edit task Buy running shoes"');
  });

  it("shows a done task with a filled check, grey struck-through title, 'Reopen …' and no date chip", () => {
    const html = list([task("Sign up", { status: "done", doneAt: "2026-11-16T10:00:00.000Z", dueDate: "2026-11-20" })]);
    expect(html).toContain('aria-label="Reopen &#x27;Sign up&#x27;"');
    expect(html).toContain("bg-teal-500");
    expect(html).toMatch(/text-ink-3 line-through"><button[^>]*>Sign up<\/button><\/span><span class="sr-only">, done<\/span>/);
    expect(html).not.toContain("Nov 20");
  });

  it("shows a neutral date chip 'Nov 20', and a red one with 'Overdue' for screen readers before today", () => {
    const html = list([task("Later", { dueDate: "2026-11-20" }), task("Late", { dueDate: "2026-11-16" }), task("Today", { dueDate: TODAY })]);
    expect(html).toMatch(/bg-raised text-ink-2"><span class="sr-only">Due <\/span>Nov 20</);
    expect(html).toMatch(/bg-danger-soft text-danger"><span class="sr-only">Overdue, due <\/span>Nov 16</);
    expect(html).toMatch(/bg-raised text-ink-2"><span class="sr-only">Due <\/span>Nov 17</);
  });

  it("keeps the order it is given (the panel sorts by R33) and ends with 'Add task'", () => {
    const html = list([task("First"), task("Second")]);
    expect(html.indexOf(">First<")).toBeLessThan(html.indexOf(">Second<"));
    expect(html).toMatch(/aria-label="Add task to Half marathon"[^>]*>.*Add task<\/button>/);
  });

  it("draws Inbox rows in grey", () => {
    expect(list([task("Call mom back", { goalId: null })], null)).toContain("border-ink-3");
  });
});

describe("the small task form", () => {
  it("adding: a title input and an optional due date from today on, Save and Close, no goal list", () => {
    const html = renderToStaticMarkup(
      <TaskForm mode={{ kind: "add", sectionTitle: "Inbox" }} goalId={null} today={TODAY} goals={[]} onDone={() => {}} />,
    );
    expect(html).toContain('aria-label="Add task to Inbox"');
    expect(html).toContain('aria-label="Task title"');
    expect(html).toMatch(/type="date"[^>]*min="2026-11-17"[^>]*aria-label="Due date \(optional\)"/);
    expect(html).not.toContain('aria-label="Goal"');
    expect(html).toContain(">Save<");
  });

  it("editing: title, due date (an old past date stays choosable), the goal list with Inbox, and Delete", () => {
    const html = renderToStaticMarkup(
      <TaskForm
        mode={{ kind: "edit", task: task("Late", { dueDate: "2026-11-10" }) }}
        goalId="g1"
        today={TODAY}
        goals={[{ id: "g1", title: "Half marathon" }]}
        onDone={() => {}}
      />,
    );
    expect(html).toContain('value="Late"');
    expect(html).toContain('min="2026-11-10"');
    expect(html).toMatch(/<option value="">Inbox \(no goal\)<\/option><option value="g1" selected="">Half marathon<\/option>/);
    expect(html).toContain('aria-label="Delete task Late"');
  });
});

describe("the goals column with tasks", () => {
  const render = (goals: GoalView[], tasks: TaskDto[]) =>
    renderToStaticMarkup(
      <PanelState>
        <GoalsPanel goals={goals} tasks={tasks} today={TODAY} />
      </PanelState>,
    );

  it("lists a goal's tasks under it in R33's order and shows its open count at the right of the header", () => {
    const html = render(
      [GOAL],
      [
        task("Done one", { status: "done", doneAt: "2026-11-16T10:00:00.000Z" }),
        task("No date"),
        task("Soon", { dueDate: "2026-11-18" }),
      ],
    );
    const section = html.slice(html.indexOf('aria-label="Half marathon"'), html.indexOf('aria-label="Inbox"'));
    expect(section).toContain('<span class="sr-only">2 open tasks</span>');
    expect(section.indexOf(">Soon<")).toBeLessThan(section.indexOf(">No date<"));
    expect(section.indexOf(">No date<")).toBeLessThan(section.indexOf(">Done one<"));
    // The tasks come after the rules and the weeks.
    expect(section.indexOf('aria-label="Weeks"')).toBeLessThan(section.indexOf(">Soon<"));
  });

  it("shows Inbox at the bottom with a grey tile and its own 'Add task', also with no goals", () => {
    const html = render([], [task("Call mom back", { goalId: null })]);
    const inbox = html.slice(html.indexOf('aria-label="Inbox"'));
    expect(inbox).toContain("bg-raised text-ink-3"); // the grey tile
    expect(inbox).toContain(">Inbox</h3>");
    expect(inbox).toContain('<span class="sr-only">1 open task</span>');
    expect(inbox).toContain(">Call mom back<");
    expect(inbox).toContain('aria-label="Add task to Inbox"');
  });

  it("counts 0 when every task of a goal is done (A15)", () => {
    const html = render([GOAL], [task("Buy running shoes", { status: "done", doneAt: "2026-11-16T10:00:00.000Z" })]);
    const section = html.slice(html.indexOf('aria-label="Half marathon"'), html.indexOf('aria-label="Inbox"'));
    expect(section).toContain('<span class="sr-only">0 open tasks</span>');
  });
});
