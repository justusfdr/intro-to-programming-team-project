// R23: the checks every answer of the assistant must pass before anything is saved, and again before
// a draft is accepted. Pure: no database, no clock of its own. One failed check rejects the whole
// answer (R1); there is no second try.
//
// The assistant answers with local date-times ("2026-11-14T09:00") in the user's time zone. They are
// turned into instants with the project's own helpers; a time that does not exist in the zone (the
// hour skipped when clocks go forward) fails the check.
import { z } from "zod";
import {
  addDays,
  localDateOf,
  localDateTimeOf,
  parseLocalDateTime,
  startOfLocalDate,
} from "@/lib/time/zoned";

export const MAX_PROPOSALS = 30;
export const MAX_TEXT = 4000;
export const MAX_TITLE = 100;
const MIN_LENGTH_MS = 15 * 60 * 1000;
const MAX_LENGTH_MS = 8 * 60 * 60 * 1000;

/**
 * The shape the assistant must answer in (also sent to Claude as the JSON schema, see prompt.ts).
 * `events` is empty for a text answer. Unknown fields are refused.
 */
export const AnswerShape = z
  .object({
    kind: z.enum(["text", "draft"]),
    text: z.string(),
    events: z.array(
      z
        .object({
          title: z.string(),
          start: z.string(),
          end: z.string(),
          goalId: z.string().nullable(),
        })
        .strict(),
    ),
  })
  .strict();

/** A proposed event with its times as instants. */
export type Proposal = { title: string; startAt: Date; endAt: Date; goalId: string | null };

/** A timed event already in the calendar, as the overlap check needs it. All-day events never block (R29). */
export type CalendarBlock = { startAt: Date; endAt: Date; mayOverlap: boolean };

export type CheckContext = {
  now: Date;
  timeZone: string;
  /** The ids of the user's goals. */
  goalIds: ReadonlySet<string>;
  /** The user's timed events around the 14 days (the proposals are checked against them). */
  calendar: readonly CalendarBlock[];
};

export type CheckedAnswer = { kind: "text"; text: string } | { kind: "draft"; text: string; proposals: Proposal[] };

/** Why an answer failed: for the server log and the tests, never shown to the user. */
export type CheckFailure =
  | "shape"
  | "text_length"
  | "text_with_events"
  | "no_events"
  | "too_many_events"
  | "title_length"
  | "bad_time"
  | "start_in_past"
  | "start_too_late"
  | "end_before_start"
  | "too_short"
  | "too_long"
  | "unknown_goal"
  | "overlaps_proposal"
  | "overlaps_calendar";

export type CheckResult<T> = { ok: true; value: T } | { ok: false; failure: CheckFailure };

const fail = (failure: CheckFailure) => ({ ok: false as const, failure });

/** The text of a message or answer: trimmed, 1 to 4,000 characters (counted as the user sees them). */
export function checkText(raw: string): string | null {
  const text = raw.trim();
  const length = [...text].length;
  return length >= 1 && length <= MAX_TEXT ? text : null;
}

/** The latest start a proposal may have: the end of the 14th day from today (on 16 Nov: 30 Nov 24:00). */
export function latestStart(now: Date, timeZone: string): Date {
  return startOfLocalDate(addDays(localDateOf(now, timeZone), 15), timeZone);
}

/** A local date-time that really exists in the zone, as an instant; null otherwise. */
function exactLocal(value: string, timeZone: string): Date | null {
  const instant = parseLocalDateTime(value, timeZone);
  if (!instant) return null;
  // A skipped time (02:30 on the spring clock change) comes back as another wall-clock time.
  return localDateTimeOf(instant, timeZone) === value ? instant : null;
}

const overlaps = (a: { startAt: Date; endAt: Date }, b: { startAt: Date; endAt: Date }) =>
  a.startAt < b.endAt && b.startAt < a.endAt;

/**
 * R23 on proposals whose times are already instants (used by send_message after conversion and by
 * accept_draft on the saved draft): timed only, start from now to the end of the 14th day, start
 * before end, 15 minutes to 8 hours, only the user's goals, no overlap with another proposal or with
 * a timed event that may not overlap, at most 30, title 1 to 100 characters.
 */
export function checkProposals(proposals: readonly Proposal[], context: CheckContext): CheckResult<Proposal[]> {
  if (proposals.length === 0) return fail("no_events");
  if (proposals.length > MAX_PROPOSALS) return fail("too_many_events");
  const latest = latestStart(context.now, context.timeZone);
  const checked: Proposal[] = [];
  for (const proposal of proposals) {
    const title = proposal.title.trim();
    const titleLength = [...title].length;
    if (titleLength < 1 || titleLength > MAX_TITLE) return fail("title_length");
    if (proposal.startAt < context.now) return fail("start_in_past");
    if (proposal.startAt >= latest) return fail("start_too_late");
    if (proposal.endAt <= proposal.startAt) return fail("end_before_start");
    const length = proposal.endAt.getTime() - proposal.startAt.getTime();
    if (length < MIN_LENGTH_MS) return fail("too_short");
    if (length > MAX_LENGTH_MS) return fail("too_long");
    if (proposal.goalId !== null && !context.goalIds.has(proposal.goalId)) return fail("unknown_goal");
    if (checked.some((other) => overlaps(other, proposal))) return fail("overlaps_proposal");
    // R10: ending exactly when the next starts is no overlap. An event that may overlap never blocks.
    if (context.calendar.some((event) => !event.mayOverlap && overlaps(event, proposal))) return fail("overlaps_calendar");
    checked.push({ ...proposal, title });
  }
  return { ok: true, value: checked };
}

/** The assistant's raw answer (parsed JSON, not trusted) through every check of R23. */
export function checkAnswer(raw: unknown, context: CheckContext): CheckResult<CheckedAnswer> {
  const parsed = AnswerShape.safeParse(raw);
  if (!parsed.success) return fail("shape");
  const answer = parsed.data;
  const text = checkText(answer.text);
  if (text === null) return fail("text_length");

  if (answer.kind === "text") {
    if (answer.events.length > 0) return fail("text_with_events");
    return { ok: true, value: { kind: "text", text } };
  }

  if (answer.events.length === 0) return fail("no_events");
  if (answer.events.length > MAX_PROPOSALS) return fail("too_many_events");
  const proposals: Proposal[] = [];
  for (const event of answer.events) {
    const startAt = exactLocal(event.start, context.timeZone);
    const endAt = exactLocal(event.end, context.timeZone);
    if (!startAt || !endAt) return fail("bad_time");
    proposals.push({ title: event.title, startAt, endAt, goalId: event.goalId === "" ? null : event.goalId });
  }
  const checked = checkProposals(proposals, context);
  if (!checked.ok) return checked;
  return { ok: true, value: { kind: "draft", text, proposals: checked.value } };
}
