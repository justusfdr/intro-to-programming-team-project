// R33: the order of tasks under a goal, the overdue mark, the date chip and the open count.
import { describe, expect, it } from "vitest";
import { dueLabel, isOverdue, openCount, sortTasks } from "./order";
import type { TaskDto } from "./types";

function task(id: string, change: Partial<TaskDto> = {}): TaskDto {
  return { id, title: id, goalId: null, dueDate: null, status: "open", doneAt: null, ...change };
}

describe("sortTasks (R33)", () => {
  it("lists open tasks by due date, earliest first, without a date last, then done tasks in the order they were done", () => {
    const tasks = [
      task("done later", { status: "done", doneAt: "2026-11-16T10:00:00.000Z", dueDate: "2026-11-01" }),
      task("no date"),
      task("nov 20", { dueDate: "2026-11-20" }),
      task("done first", { status: "done", doneAt: "2026-11-15T10:00:00.000Z" }),
      task("nov 18", { dueDate: "2026-11-18" }),
      task("no date 2"),
    ];
    expect(sortTasks(tasks).map((t) => t.id)).toEqual(["nov 18", "nov 20", "no date", "no date 2", "done first", "done later"]);
  });

  it("keeps the incoming order for tasks with the same date, and does not change its input", () => {
    const tasks = [task("a", { dueDate: "2026-11-20" }), task("b", { dueDate: "2026-11-20" })];
    expect(sortTasks(tasks).map((t) => t.id)).toEqual(["a", "b"]);
    expect(sortTasks([...tasks].reverse()).map((t) => t.id)).toEqual(["b", "a"]);
  });
});

describe("isOverdue (R33)", () => {
  it("marks an open task due before today", () => {
    expect(isOverdue({ status: "open", dueDate: "2026-11-15" }, "2026-11-16")).toBe(true);
  });

  it("does not mark a task due today or later, one without a date, or a done one", () => {
    expect(isOverdue({ status: "open", dueDate: "2026-11-16" }, "2026-11-16")).toBe(false);
    expect(isOverdue({ status: "open", dueDate: "2026-11-17" }, "2026-11-16")).toBe(false);
    expect(isOverdue({ status: "open", dueDate: null }, "2026-11-16")).toBe(false);
    expect(isOverdue({ status: "done", dueDate: "2026-11-01" }, "2026-11-16")).toBe(false);
  });
});

describe("dueLabel and openCount", () => {
  it("writes the date as 'Nov 6'", () => {
    expect(dueLabel("2026-11-06")).toBe("Nov 6");
    expect(dueLabel("2027-01-20")).toBe("Jan 20");
  });

  it("counts only open tasks", () => {
    expect(openCount([task("a"), task("b", { status: "done", doneAt: "x" }), task("c")])).toBe(2);
  });
});
