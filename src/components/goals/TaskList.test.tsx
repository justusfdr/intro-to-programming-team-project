// The tasks on the Goals page (spec 11): rows in R33's order with a real ring button, the date chip
// (red with "overdue" for screen readers before today), done tasks struck through, the open count in
// each header, "Add task" per section, and "Inbox" always last.
// Rewritten for spec 39: the last part rendered the goals column (GoalsPanel inside PanelState); it now
// renders the Goals page (GoalsPage), with the same promises about tasks.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { GoalView } from "@/lib/goals/types";
import type { GoalColorName } from "@/lib/goals/style";
import type { TaskDto } from "@/lib/tasks/types";
import { GoalsPage } from "./GoalsPage";
import { MiniMonth } from "@/components/calendar/MiniMonth";
import { earliestDueDate, TaskForm, TaskList } from "./TaskList";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const GOAL: GoalView = {
  id: "g1",
  title: "Half marathon",
  deadline: "2027-03-14",
  autoBlock: false,
  updatedAt: "2026-11-15T10:00:00.000Z",
  colorIndex: 1,
  color: null,
  icon: "rocket",
  why: "",
  look: { color: "teal", icon: "rocket" },
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

function list(tasks: TaskDto[], color: GoalColorName | null = "teal") {
  return renderToStaticMarkup(
    <TaskList tasks={tasks} goalId="g1" color={color} sectionTitle="Half marathon" today={TODAY} goals={[{ id: "g1", title: "Half marathon" }]} />,
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

// Rewritten for spec 39: the due date is no longer the browser's date input (it showed "15 . 11 . 2026"
// in grey) but the event editor's date field: a button with the date as "Fri, Nov 20" or a quiet
// "Add due date", a button to remove the date, and the small month calendar with earlier days greyed out.
describe("the small task form", () => {
  it("adding: a title input and the due date as a quiet 'Add due date' button, Save and Close, no goal list", () => {
    const html = renderToStaticMarkup(
      <TaskForm mode={{ kind: "add", sectionTitle: "Inbox" }} goalId={null} today={TODAY} goals={[]} onDone={() => {}} />,
    );
    expect(html).toContain('aria-label="Add task to Inbox"');
    expect(html).toContain('aria-label="Task title"');
    // The field stops at 100 characters, the most the server takes (issue #137).
    expect(html).toMatch(/aria-label="Task title"[^>]*maxLength="100"/);
    expect(html).not.toContain('type="date"');
    expect(html).toMatch(/<button type="button" aria-expanded="false" aria-label="Due date \(optional\)"[^>]*>.*<span class="[^"]*text-ink-3">Add due date<\/span><\/button>/);
    // Nothing to remove while there is no date.
    expect(html).not.toContain("Remove due date");
    expect(html).not.toContain('aria-label="Goal"');
    expect(html).toContain(">Save<");
  });

  it("editing: title, the due date in the app's format with a button to remove it, no goal list, and Delete", () => {
    const html = renderToStaticMarkup(
      <TaskForm
        mode={{ kind: "edit", task: task("Later", { dueDate: "2026-11-20" }) }}
        goalId="g1"
        today={TODAY}
        goals={[{ id: "g1", title: "Half marathon" }]}
        onDone={() => {}}
      />,
    );
    expect(html).toContain('value="Later"');
    expect(html).not.toContain('type="date"');
    expect(html).toMatch(/aria-label="Due date \(optional\): Fri, Nov 20"[^>]*>.*>Fri, Nov 20<\/span><\/button>/);
    expect(html).toMatch(/<button type="button" aria-label="Remove due date" title="Remove due date"/);
    expect(html).not.toContain('aria-label="Goal"');
    expect(html).toContain('aria-label="Delete task Later"');
  });

  it("offers due dates from today on; an unchanged past due date of an edited task stays choosable", () => {
    expect(earliestDueDate(null, TODAY)).toBe(TODAY);
    expect(earliestDueDate(task("Soon", { dueDate: "2026-11-20" }), TODAY)).toBe(TODAY);
    expect(earliestDueDate(task("Late", { dueDate: "2026-11-10" }), TODAY)).toBe("2026-11-10");
  });

  it("greys out the days before the earliest date in the small month calendar", () => {
    const html = renderToStaticMarkup(<MiniMonth value="" min={TODAY} todayKey={TODAY} onChange={() => {}} />);
    expect(html).toMatch(/aria-label="Monday, November 16, 2026" disabled=""/);
    expect(html).not.toMatch(/aria-label="Tuesday, November 17, 2026" disabled=""/);
    // Without a chosen date nothing is marked as chosen, and the month shown is today's.
    expect(html).not.toContain('aria-pressed="true"');
    expect(html).toContain(">November 2026<");
  });
});

describe("the Goals page with tasks", () => {
  const render = (goals: GoalView[], tasks: TaskDto[]) => renderToStaticMarkup(<GoalsPage goals={goals} tasks={tasks} today={TODAY} />);

  it("lists a goal's tasks under it in R33's order and shows its open count at the right of the header", () => {
    const html = render(
      [GOAL],
      [
        task("Done one", { status: "done", doneAt: "2026-11-16T10:00:00.000Z" }),
        task("No date"),
        task("Soon", { dueDate: "2026-11-18" }),
      ],
    );
    const section = html.slice(html.indexOf('aria-label="Half marathon"'));
    expect(section).toContain('<span class="sr-only">2 open tasks</span>');
    expect(section.indexOf(">Soon<")).toBeLessThan(section.indexOf(">No date<"));
    expect(section.indexOf(">No date<")).toBeLessThan(section.indexOf(">Done one<"));
    // The tasks come after the rules and the weeks.
    // Changed 18 Nov 2026 with Emily's approval (spec 47): there is no strip of weeks any more.
    expect(section.indexOf('aria-label="This week"')).toBeGreaterThan(-1);
    expect(section.indexOf('aria-label="This week"')).toBeLessThan(section.indexOf(">Soon<"));
  });

  it("shows no Inbox card, so tasks without a goal are not listed", () => {
    const html = render([], [task("Call mom back", { goalId: null })]);
    expect(html).not.toContain("Inbox");
    expect(html).not.toContain(">Call mom back<");
  });

  it("counts 0 when every task of a goal is done (A15)", () => {
    const html = render([GOAL], [task("Buy running shoes", { status: "done", doneAt: "2026-11-16T10:00:00.000Z" })]);
    const section = html.slice(html.indexOf('aria-label="Half marathon"'));
    expect(section).toContain('<span class="sr-only">0 open tasks</span>');
  });
});
