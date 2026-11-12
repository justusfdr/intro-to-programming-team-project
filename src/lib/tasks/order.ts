// How tasks are listed under a goal (R33) and what is calculated from them, never saved:
// the order, the "overdue" mark, the date chip's text and the number of open tasks.
import type { TaskDto } from "./types";

/**
 * R33: open tasks first, by due date (earliest first, tasks without a date last), then the done tasks
 * in the order they were done. Ties keep the order they came in (the server sends oldest first).
 */
export function sortTasks(tasks: readonly TaskDto[]): TaskDto[] {
  const rank = (task: TaskDto) => (task.status === "open" ? 0 : 1);
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((a, b) => {
      if (rank(a.task) !== rank(b.task)) return rank(a.task) - rank(b.task);
      if (a.task.status === "open") {
        const x = a.task.dueDate;
        const y = b.task.dueDate;
        if (x !== y) {
          if (x === null) return 1;
          if (y === null) return -1;
          return x < y ? -1 : 1;
        }
      } else {
        const x = a.task.doneAt ?? "";
        const y = b.task.doneAt ?? "";
        if (x !== y) return x < y ? -1 : 1;
      }
      return a.index - b.index;
    })
    .map(({ task }) => task);
}

/** R33: an open task whose due date is before today (the user's local date) is overdue. */
export function isOverdue(task: Pick<TaskDto, "status" | "dueDate">, today: string): boolean {
  return task.status === "open" && task.dueDate !== null && task.dueDate < today;
}

/** The date chip's text: "Nov 6". */
export function dueLabel(dueDate: string): string {
  const [y, m, d] = dueDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** The number at the right of a goal's header: its open tasks. */
export function openCount(tasks: readonly TaskDto[]): number {
  return tasks.filter((task) => task.status === "open").length;
}
