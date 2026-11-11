import "server-only";

// The checks shared by create_event and edit_event (ontology section 5), in the order the user
// reads the form: title, then end after start, then the length. Each throws the ontology's message.
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import { ActionError } from "@/lib/server/errors";
import { parseLocalDateTime } from "@/lib/time/zoned";

/** The body shape. Times are what a datetime-local field sends: "2026-11-16T09:00", in the user's time zone. */
export const EventFields = z.object({
  title: z.string().max(1000),
  start: z.string().max(32),
  end: z.string().max(32),
  mayOverlap: z.boolean().optional(),
  /** The goal of the event, or null for none. Checked against the user's goals by the action (R3). */
  goalId: z.string().max(40).nullable().optional(),
});

export type CheckedEvent = { title: string; startAt: Date; endAt: Date; mayOverlap: boolean; goalId: string | null };

const MAX_LENGTH_MS = 24 * 60 * 60 * 1000;

/** Checks the fields and turns the local times into instants in `timeZone`. */
export function checkEventFields(fields: z.infer<typeof EventFields>, timeZone: string): CheckedEvent {
  const title = fields.title.trim();
  const titleLength = [...title].length;
  if (titleLength < 1 || titleLength > 100) throw new ActionError(400, "title_length", MESSAGES.titleLength);

  const startAt = parseLocalDateTime(fields.start, timeZone);
  const endAt = parseLocalDateTime(fields.end, timeZone);
  if (!startAt || !endAt) throw new ActionError(400, "bad_request", MESSAGES.badRequest);

  if (endAt <= startAt) throw new ActionError(400, "end_before_start", MESSAGES.endAfterStart);
  if (endAt.getTime() - startAt.getTime() > MAX_LENGTH_MS) {
    throw new ActionError(400, "too_long", MESSAGES.atMost24Hours);
  }
  return { title, startAt, endAt, mayOverlap: fields.mayOverlap ?? false, goalId: fields.goalId ?? null };
}
