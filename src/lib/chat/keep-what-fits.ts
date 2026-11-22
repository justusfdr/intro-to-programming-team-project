// Spec 67 (R23 as changed on 22 Nov 2026): the answer of send_message keeps what fits. The checks are
// the same as in checks.ts; only, instead of one failed check rejecting the whole answer, each new
// event, move, delete and list of to-dos that fails is left out, and the answer says why in plain words.
// Only an answer that cannot be read at all (wrong shape, no text, more than 30 things) still fails.
//
// The order decides what stays when two things clash: first the moves and deletes, then the new events,
// then the to-dos for existing events, each in the coach's order. One is kept when it passes together
// with everything kept before it (checkDraft on the growing draft), so the kept part always passes the
// strict check that accept_draft runs again later.
//
// Pure: no database, no clock of its own. The travel check of issue #227 needs routing and runs in
// send_message; it leaves out new events the same way, through `leaveOut`.
import {
  AnswerShape,
  checkDraft,
  checkText,
  exactLocal,
  MAX_PROPOSALS,
  MAX_TEXT,
  type Change,
  type CheckContext,
  type CheckedAnswer,
  type CheckFailure,
  type CheckResult,
  type Proposal,
  type TodoAddition,
} from "./checks";
import { fmtDateShortFrom, fmtRange, fmtTime, type TimeFormat } from "@/lib/time/display";
import { localDateOf, localTimeOf } from "@/lib/time/zoned";

/** Why something was left out: a check of R23, or no time for the way there or back (issue #227). */
export type DropReason = CheckFailure | "no_room_for_travel";

/** Something the coach suggested that did not go into the plan, with what is known of it. */
export type Dropped =
  | { kind: "event"; title: string; startAt: Date | null; endAt: Date | null; reason: DropReason }
  | { kind: "move"; title: string | null; startAt: Date | null; endAt: Date | null; reason: DropReason }
  | { kind: "delete"; title: string | null; reason: DropReason }
  | { kind: "todos"; title: string | null; reason: DropReason };

/** What passed: the parts of a draft (any of them may be empty). */
export type KeptParts = { proposals: Proposal[]; changes: Change[]; additions: TodoAddition[] };

/** The checked answer and what was left out of it (empty when everything fit). */
export type KeptAnswer = { answer: CheckedAnswer; dropped: Dropped[] };

const fail = (failure: CheckFailure) => ({ ok: false as const, failure });

/** The answer from the kept parts: a draft, or a text answer when nothing is left. */
export function answerOf(text: string, kept: KeptParts): CheckedAnswer {
  if (kept.proposals.length + kept.changes.length + kept.additions.length === 0) return { kind: "text", text };
  return {
    kind: "draft",
    text,
    proposals: kept.proposals,
    changes: kept.changes,
    ...(kept.additions.length > 0 ? { additions: kept.additions } : {}),
  };
}

/** The parts of a checked answer (a text answer has none). */
export function partsOf(answer: CheckedAnswer): KeptParts {
  if (answer.kind === "text") return { proposals: [], changes: [], additions: [] };
  return { proposals: answer.proposals, changes: answer.changes, additions: answer.additions ?? [] };
}

/** The same answer with only `keep` of its new events; the others are left out for `reason`. */
export function leaveOut(kept: KeptAnswer, keep: readonly Proposal[], reason: DropReason): KeptAnswer {
  const parts = partsOf(kept.answer);
  const left = parts.proposals.filter((p) => !keep.includes(p));
  if (left.length === 0) return kept;
  const dropped: Dropped[] = left.map((p) => ({ kind: "event", title: p.title, startAt: p.startAt, endAt: p.endAt, reason }));
  return { answer: answerOf(kept.answer.text, { ...parts, proposals: [...keep] }), dropped: [...kept.dropped, ...dropped] };
}

/** The assistant's raw answer (parsed JSON, not trusted) through R23, keeping what fits. */
export function checkAnswerKeepingWhatFits(raw: unknown, context: CheckContext): CheckResult<KeptAnswer> {
  const parsed = AnswerShape.safeParse(raw);
  if (!parsed.success) return fail("shape");
  const answer = parsed.data;
  const rawChanges = answer.changes ?? [];
  const rawTodos = answer.addTodos ?? [];
  const text = checkText(answer.text);
  if (text === null) return fail("text_length");

  if (answer.kind === "text") {
    // A text answer that also plans something is not readable as either.
    if (answer.events.length > 0 || rawChanges.length > 0 || rawTodos.length > 0) return fail("text_with_events");
    return { ok: true, value: { answer: { kind: "text", text }, dropped: [] } };
  }

  const total = answer.events.length + rawChanges.length + rawTodos.length;
  if (total === 0) return fail("no_events");
  if (total > MAX_PROPOSALS) return fail("too_many_events");

  const dropped: Dropped[] = [];

  // New events with their times as instants; a time that does not exist is left out.
  const proposals: Proposal[] = [];
  for (const event of answer.events) {
    const startAt = exactLocal(event.start, context.timeZone);
    const endAt = exactLocal(event.end, context.timeZone);
    if (!startAt || !endAt) {
      dropped.push({ kind: "event", title: event.title.trim(), startAt, endAt, reason: "bad_time" });
      continue;
    }
    const goalId = event.goalId === "" ? null : event.goalId;
    proposals.push(event.todos && event.todos.length > 0 ? { title: event.title, startAt, endAt, goalId, todos: event.todos } : { title: event.title, startAt, endAt, goalId });
  }

  // Changes: a reference is turned back into its event at once; an unknown one is left out.
  const changes: Change[] = [];
  for (const rawChange of rawChanges) {
    const target = context.targets?.get(rawChange.ref);
    const kind = rawChange.action;
    if (target === undefined || target === null) {
      const reason = target === undefined ? "unknown_ref" : "not_changeable";
      dropped.push(kind === "delete" ? { kind, title: null, reason } : { kind, title: null, startAt: null, endAt: null, reason });
      continue;
    }
    if (kind === "delete") {
      if (rawChange.start !== null || rawChange.end !== null) dropped.push({ kind, title: target.title, reason: "shape" });
      else changes.push({ kind: "delete", target });
      continue;
    }
    const startAt = rawChange.start === null ? null : exactLocal(rawChange.start, context.timeZone);
    const endAt = rawChange.end === null ? null : exactLocal(rawChange.end, context.timeZone);
    if (!startAt || !endAt) {
      dropped.push({ kind, title: target.title, startAt, endAt, reason: "bad_time" });
      continue;
    }
    changes.push({ kind: "move", target, startAt, endAt });
  }

  // To-dos for existing events: an event that takes none is left out.
  const additions: TodoAddition[] = [];
  for (const rawTodo of rawTodos) {
    const target = context.todoTargets?.get(rawTodo.ref);
    if (target === undefined || target === null) {
      dropped.push({ kind: "todos", title: null, reason: target === undefined ? "unknown_ref" : "todos_not_allowed" });
      continue;
    }
    additions.push({ target, todos: rawTodo.todos });
  }

  // Each one is kept when the draft so far plus it still passes every check.
  const kept: KeptParts = { proposals: [], changes: [], additions: [] };
  for (const change of changes) {
    const result = checkDraft([], [...kept.changes, change], context);
    if (result.ok) kept.changes.push(change);
    else
      dropped.push(
        change.kind === "delete"
          ? { kind: "delete", title: change.target.title, reason: result.failure }
          : { kind: "move", title: change.target.title, startAt: change.startAt, endAt: change.endAt, reason: result.failure },
      );
  }
  for (const proposal of proposals) {
    const result = checkDraft([...kept.proposals, proposal], kept.changes, context);
    if (result.ok) kept.proposals.push(proposal);
    else dropped.push({ kind: "event", title: proposal.title.trim(), startAt: proposal.startAt, endAt: proposal.endAt, reason: result.failure });
  }
  for (const addition of additions) {
    const result = checkDraft(kept.proposals, kept.changes, context, [...kept.additions, addition]);
    if (result.ok) kept.additions.push(addition);
    else dropped.push({ kind: "todos", title: addition.target.title, reason: result.failure });
  }

  if (kept.proposals.length + kept.changes.length + kept.additions.length === 0) {
    return { ok: true, value: { answer: { kind: "text", text }, dropped } };
  }
  // The kept draft as checkDraft returns it (titles and to-dos trimmed); it passes by construction.
  const checked = checkDraft(kept.proposals, kept.changes, context, kept.additions);
  if (!checked.ok) return checked;
  const final: KeptParts = { proposals: checked.value.proposals, changes: checked.value.changes, additions: checked.value.additions ?? [] };
  return { ok: true, value: { answer: answerOf(text, final), dropped } };
}

/** At most this many lines in the note; the rest is counted. */
export const NOTE_LINES = 8;

/** What the note needs to show times as the person sees them. */
export type NoteDisplay = { now: Date; timeZone: string; timeFormat: TimeFormat; dayStartHour: number; dayEndHour: number };

/** Why, in plain words. */
function reasonText(reason: DropReason, display: NoteDisplay): string {
  switch (reason) {
    case "overlaps_calendar":
      return "it clashes with an event in your calendar";
    case "overlaps_proposal":
      return "it clashes with another time in this plan";
    case "overlaps_travel":
      return "it falls in the time you need to get to another event";
    case "no_room_for_travel":
      return "it leaves no time to get there or back";
    case "outside_hours": {
      const end = display.dayEndHour === 24 ? "midnight" : fmtTime(display.dayEndHour * 60, display.timeFormat);
      return `it is outside your hours (${fmtTime(display.dayStartHour * 60, display.timeFormat)} – ${end}, see Settings)`;
    }
    case "never_day":
      return "it is on a day you never do this goal";
    case "start_in_past":
      return "it would start in the past";
    case "start_too_late":
      return "the coach plans only the next 14 days";
    case "end_before_start":
      return "it would end before it starts";
    case "too_short":
      return "an event lasts at least 15 minutes";
    case "too_long":
      return "it is longer than an event may be";
    case "bad_time":
      return "that time does not exist";
    case "title_length":
      return "its title is empty or too long";
    case "unknown_goal":
      return "it names a goal you do not have";
    case "unknown_ref":
      return "the coach named an event it does not know";
    case "not_changeable":
      return "the coach may not change this event";
    case "changed_twice":
      return "the coach changed this event twice";
    case "too_many_todos":
    case "todo_list_full":
      return "an event has at most 20 to-dos";
    case "todo_title":
      return "a to-do is empty or too long";
    case "todos_not_allowed":
      return "the coach may not add to-dos to this event";
    case "todos_twice":
      return "the coach added to-dos to this event twice";
    case "todos_on_deleted":
      return "this plan deletes that event";
    case "no_todos":
      return "there were no to-dos to add";
    default:
      return "the coach's suggestion could not be read";
  }
}

/** "Tue, Nov 24, 18:00 – 19:00" in the person's time zone and format. */
function whenText(startAt: Date, endAt: Date, display: NoteDisplay): string {
  const today = localDateOf(display.now, display.timeZone);
  const day = fmtDateShortFrom(localDateOf(startAt, display.timeZone), today);
  return `${day}, ${fmtRange(localTimeOf(startAt, display.timeZone), localTimeOf(endAt, display.timeZone), display.timeFormat)}`;
}

/** One line of the note: what, and why. */
function lineOf(item: Dropped, display: NoteDisplay): string {
  const named = (title: string | null) => (title ? `"${title}"` : "an event");
  let what: string;
  if (item.kind === "event") what = item.startAt && item.endAt ? `${item.title || "New event"}, ${whenText(item.startAt, item.endAt, display)}` : item.title || "New event";
  else if (item.kind === "move") what = item.startAt && item.endAt ? `Moving ${named(item.title)} to ${whenText(item.startAt, item.endAt, display)}` : `Moving ${named(item.title)}`;
  else if (item.kind === "delete") what = `Deleting ${named(item.title)}`;
  else what = `To-dos for ${named(item.title)}`;
  return `• ${what}: ${reasonText(item.reason, display)}.`;
}

/**
 * The coach's text with a note on what was left out (the text alone when nothing was). `planned` says
 * whether anything is left in the plan. Text and note together stay within 4,000 characters: the
 * coach's text is shortened first.
 */
export function withNote(text: string, dropped: readonly Dropped[], planned: boolean, display: NoteDisplay): string {
  if (dropped.length === 0) return text;
  const lines = dropped.slice(0, NOTE_LINES).map((item) => lineOf(item, display));
  if (dropped.length > NOTE_LINES) lines.push(`…and ${dropped.length - NOTE_LINES} more.`);
  const head = planned ? "Left out of this plan because it did not fit:" : "None of this could go into a plan:";
  const tail = planned ? [] : ["Try other days or times, or ask for less at once."];
  const note = [head, ...lines, ...tail].join("\n");
  const room = MAX_TEXT - [...note].length - 2;
  const chars = [...text];
  const shown = chars.length <= room ? text : `${chars.slice(0, Math.max(0, room - 1)).join("").trimEnd()}…`;
  return shown.length > 0 ? `${shown}\n\n${note}` : note;
}
