import "server-only";

// The checks shared by add_task and edit_task (ontology section 5), in the ontology's order: title,
// then the due date. The goal is checked against the database in the action (assertOwnGoal) and the
// limit of open tasks after that (R32). Each check throws the ontology's message.
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import { ActionError } from "@/lib/server/errors";
import { isLocalDate, type LocalDate } from "@/lib/time/zoned";

/** The body shape of add_task and edit_task. Goal and due date may be left out or null (none). */
export const TaskFields = z.object({
  title: z.string().max(1000),
  goalId: z.string().max(40).nullable().optional(),
  dueDate: z.string().max(10).nullable().optional(),
});

export type CheckedTask = { title: string; goalId: string | null; dueDate: LocalDate | null };

/**
 * Checks the fields. `today` is the user's local date. When editing, `keptDueDate` is the task's
 * current due date: it may stay as it is even if it has passed ("not past when set or changed").
 */
export function checkTaskFields(fields: z.infer<typeof TaskFields>, today: LocalDate, keptDueDate?: LocalDate | null): CheckedTask {
  const title = fields.title.trim();
  const titleLength = [...title].length;
  if (titleLength < 1 || titleLength > 100) throw new ActionError(400, "title_length", MESSAGES.titleLength);

  // An empty date field means "no due date".
  const dueDate = fields.dueDate === undefined || fields.dueDate === null || fields.dueDate === "" ? null : fields.dueDate;
  if (dueDate !== null) {
    if (!isLocalDate(dueDate)) throw new ActionError(400, "bad_request", MESSAGES.badRequest);
    if (dueDate < today && dueDate !== keptDueDate) throw new ActionError(400, "due_past", MESSAGES.duePast);
  }

  const goalId = fields.goalId === undefined || fields.goalId === null || fields.goalId === "" ? null : fields.goalId;
  return { title, goalId, dueDate };
}

/** R32: under 100 open tasks before one more is added or reopened. */
export function assertRoomForOpenTask(openTasks: number): void {
  if (openTasks >= 100) throw tooManyTasks();
}

export function tooManyTasks(): ActionError {
  return new ActionError(409, "too_many_tasks", MESSAGES.tooManyTasks);
}

/**
 * Two requests at the same moment (two devices): the database lets only one through and refuses the
 * other with the same words. Turns that refusal into the ontology's answer; anything else is rethrown.
 */
export function asTaskLimitError(error: unknown): unknown {
  const message = error instanceof Error ? error.message : "";
  return message.includes(MESSAGES.tooManyTasks) ? tooManyTasks() : error;
}
