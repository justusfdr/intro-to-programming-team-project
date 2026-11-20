// edit_draft (spec 22): the person drags one block of the open draft, a new event or an event the
// coach moves, to new times on the same day. Pure, no database and no clock of its own: the server
// builds the draft as it would be with these helpers and then runs every check of R23 on it
// (checks.ts, the same module as for the assistant's answer and for accepting). The screen uses
// `withBlockAt` to show the block at its new place at once, before the server has answered.
import { MESSAGES } from "@/lib/messages";
import { addDays, localDateOf, startOfLocalDate } from "@/lib/time/zoned";
import type { Change, CheckFailure, Proposal } from "./checks";
import type { DraftDto } from "./types";

/** Which block of a draft: a new event by its place in the list (from 0), or the move of an existing event. */
export type DraftItem = { kind: "new"; index: number } | { kind: "move"; eventId: string };

/** A short key for a block, to find it again on the screen ("new:0", "move:<event id>"). */
export function itemKey(item: DraftItem): string {
  return item.kind === "new" ? `new:${item.index}` : `move:${item.eventId}`;
}

export type EditFailure = CheckFailure | "not_found" | "other_day";

type Placed = { startAt: Date; endAt: Date };

/**
 * A block stays on the day it starts on (to another day: by telling the coach) and ends at the latest
 * at that day's midnight, as when dragging in the calendar (R38).
 */
function staysOnItsDay(before: Placed, after: Placed, timeZone: string): boolean {
  const day = localDateOf(before.startAt, timeZone);
  if (localDateOf(after.startAt, timeZone) !== day) return false;
  return after.endAt <= startOfLocalDate(addDays(day, 1), timeZone);
}

/**
 * The draft as it would be with one block at new times: the new events and the changes, with that one
 * block's start and end replaced and everything else (title, goal, to-dos, which event a move names)
 * kept. "not_found" for a block the draft does not have or one that cannot be dragged (a delete);
 * "other_day" for a new place on another day.
 */
export function withEditedBlock(
  proposals: readonly Proposal[],
  changes: readonly Change[],
  item: DraftItem,
  startAt: Date,
  endAt: Date,
  timeZone: string,
): { ok: true; proposals: Proposal[]; changes: Change[] } | { ok: false; failure: "not_found" | "other_day" } {
  if (item.kind === "new") {
    const before = Number.isInteger(item.index) && item.index >= 0 ? proposals[item.index] : undefined;
    if (!before) return { ok: false, failure: "not_found" };
    if (!staysOnItsDay(before, { startAt, endAt }, timeZone)) return { ok: false, failure: "other_day" };
    return {
      ok: true,
      proposals: proposals.map((p, i) => (i === item.index ? { ...p, startAt, endAt } : p)),
      changes: [...changes],
    };
  }
  const before = changes.find((c) => c.kind === "move" && c.target.id === item.eventId);
  if (!before || before.kind !== "move") return { ok: false, failure: "not_found" };
  if (!staysOnItsDay(before, { startAt, endAt }, timeZone)) return { ok: false, failure: "other_day" };
  return {
    ok: true,
    proposals: [...proposals],
    changes: changes.map((c) => (c === before ? { ...before, startAt, endAt } : c)),
  };
}

/**
 * The sentence for a refused change, in the ontology's words (spec 22). Failures a drag cannot cause
 * (a title, a goal, the to-dos) mean the draft itself no longer passes: out of date.
 */
export function editRefusal(failure: EditFailure, item: DraftItem): { status: number; code: string; message: string } {
  switch (failure) {
    case "not_found":
      return { status: 404, code: "not_found", message: MESSAGES.notFound };
    case "other_day":
      return { status: 400, code: "other_day", message: MESSAGES.draftEditOtherDay };
    case "overlaps_proposal":
    case "overlaps_calendar":
    case "overlaps_travel":
      return { status: 409, code: "overlap", message: MESSAGES.draftEditOverlap };
    case "end_before_start":
      return { status: 400, code: "end_before_start", message: MESSAGES.endAfterStart };
    case "too_short":
      return { status: 400, code: "length", message: MESSAGES.draftEditLength };
    case "too_long":
      return item.kind === "new"
        ? { status: 400, code: "length", message: MESSAGES.draftEditLength }
        : { status: 400, code: "length", message: MESSAGES.atMost24Hours };
    case "start_in_past":
      return { status: 400, code: "in_the_past", message: MESSAGES.draftEditPast };
    case "start_too_late":
      return { status: 400, code: "too_late", message: MESSAGES.draftEditTooLate };
    default:
      return { status: 409, code: "draft_out_of_date", message: MESSAGES.draftOutOfDate };
  }
}

/**
 * The draft as the screen shows it while the server decides: the one block at its new times (UTC ISO
 * strings). An unknown block leaves the draft as it is.
 */
export function withBlockAt(draft: DraftDto, item: DraftItem, startAt: string, endAt: string): DraftDto {
  if (item.kind === "new") {
    return { ...draft, events: draft.events.map((e, i) => (i === item.index ? { ...e, startAt, endAt } : e)) };
  }
  return {
    ...draft,
    changes: draft.changes.map((c) => (c.kind === "move" && c.eventId === item.eventId ? { ...c, startAt, endAt } : c)),
  };
}
