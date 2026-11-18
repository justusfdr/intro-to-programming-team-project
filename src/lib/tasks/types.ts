// The shape of a task as the server sends it to the page (spec 11).

export type TaskStatus = "open" | "done";

export type TaskDto = {
  id: string;
  title: string;
  /** The goal it belongs to, or null: then it is listed under "Other to-dos" (R32). */
  goalId: string | null;
  /** "2026-11-20", or null for no due date. */
  dueDate: string | null;
  status: TaskStatus;
  /** When it was done (set by the database), or null while open. Orders the done tasks. */
  doneAt: string | null;
};
