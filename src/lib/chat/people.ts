// Spec 37: the coach finds a time with contacts (ontology R65 to R68). Pure helpers, no database and no
// clock of their own, so the tests can check every rule:
// - who is named in the conversation (R65): a person who shares their calendar with the user is named
//   when their shown name, or its first word (at least 3 characters), appears as a whole word, in any
//   case, in the user's new message or in one of the last 10 messages; at most 5, the first 5 in the
//   order they are named;
// - their busy times (R66): timed blocks only, cut to the window from now to the end of the coach's 14
//   days (plus the 8 hours the last proposal may last), merged where they overlap or touch, at most 200
//   sent;
// - whether a proposed time fits the invited people (R67).
// Nothing here ever sees a title, a place, an id or an address of another person: the server hands in
// only times and the shown name.
import { addDays, localDateOf, startOfLocalDate } from "@/lib/time/zoned";

/** R65: at most 5 people are taken into account per message. */
export const MAX_NAMED_PEOPLE = 5;
/** R66: at most 200 busy intervals are sent per person. */
export const MAX_BUSY_INTERVALS = 200;
/** R65: the first word of a name counts when it has at least 3 characters. */
export const MIN_FIRST_WORD = 3;
/** A proposal lasts at most 8 hours (R23), so the last one can end up to 8 hours after the 14th day. */
const LAST_PROPOSAL_MS = 8 * 60 * 60 * 1000;

/** A busy time of another person: start and end, nothing else. */
export type Interval = { startAt: Date; endAt: Date };

/** Someone the coach may take into account: a key only the server knows (a contact row id or a demo id) and the shown name. */
export type NameCandidate = { key: string; name: string };

/**
 * A shown name as it may be sent: user-chosen text, so control characters, line breaks and invisible
 * separators become spaces, runs of spaces one, at most 40 characters. It is only ever sent as a data
 * field, never inside instruction text.
 */
export function cleanPersonName(raw: string): string {
  const flat = raw.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g, " ").replace(/\s+/g, " ").trim();
  return [...flat].slice(0, 40).join("").trim();
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A phrase as a whole word: no letter, digit, mark or underscore right before or after it; any case. */
function wholeWord(phrase: string): RegExp {
  const body = phrase.split(/\s+/).filter(Boolean).map(escape).join("\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}\\p{M}_])${body}(?![\\p{L}\\p{N}\\p{M}_])`, "iu");
}

/** The phrases that name a person: the whole name, and its first word when that has at least 3 characters. */
export function namePhrases(name: string): string[] {
  const clean = cleanPersonName(name);
  if (!clean) return [];
  const first = clean.split(" ")[0];
  return first !== clean && [...first].length >= MIN_FIRST_WORD ? [clean, first] : [clean];
}

/** Where a person is first named in one text (the smallest index), or -1. */
export function namedAt(name: string, text: string): number {
  let best = -1;
  for (const phrase of namePhrases(name)) {
    const found = wholeWord(phrase).exec(text);
    if (found && (best === -1 || found.index < best)) best = found.index;
  }
  return best;
}

/**
 * R65: the people named in the conversation, in the order they are named (the texts oldest first, the
 * user's new message last). `named` holds the first 5; `more` the others, which are not taken into
 * account (the answer says so).
 */
export function namedPeople<T extends NameCandidate>(candidates: readonly T[], texts: readonly string[]): { named: T[]; more: T[] } {
  const found: { candidate: T; text: number; at: number; order: number }[] = [];
  candidates.forEach((candidate, order) => {
    for (let text = 0; text < texts.length; text++) {
      const at = namedAt(candidate.name, texts[text]);
      if (at >= 0) {
        found.push({ candidate, text, at, order });
        return;
      }
    }
  });
  found.sort((a, b) => a.text - b.text || a.at - b.at || a.order - b.order);
  const all = found.map((f) => f.candidate);
  return { named: all.slice(0, MAX_NAMED_PEOPLE), more: all.slice(MAX_NAMED_PEOPLE) };
}

/** R66: the window of busy times that is read and sent: from now to the end of the 14th day, plus 8 hours. */
export function busyWindow(now: Date, timeZone: string): { from: Date; until: Date } {
  const endOfDay14 = startOfLocalDate(addDays(localDateOf(now, timeZone), 15), timeZone);
  return { from: now, until: new Date(endOfDay14.getTime() + LAST_PROPOSAL_MS) };
}

/** R66: busy times cut to [from, until), sorted, and merged where they overlap or touch. */
export function mergeBusy(intervals: readonly Interval[], from: Date, until: Date): Interval[] {
  const cut = intervals
    .map((i) => ({ start: Math.max(i.startAt.getTime(), from.getTime()), end: Math.min(i.endAt.getTime(), until.getTime()) }))
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: { start: number; end: number }[] = [];
  for (const i of cut) {
    const last = merged[merged.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else merged.push({ ...i });
  }
  return merged.map((i) => ({ startAt: new Date(i.start), endAt: new Date(i.end) }));
}

const overlaps = (a: Interval, b: Interval) => a.startAt < b.endAt && b.startAt < a.endAt;

/** R67: whether a time overlaps one of a person's busy times (ending exactly when one starts is no overlap, R10). */
export function fitsBusy(time: Interval, busy: readonly Interval[]): boolean {
  return !busy.some((b) => overlaps(time, b));
}

/** "Emily", "Emily and Lucas", "Emily, Lucas and Ana". */
export function namesText(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The answer's text with our own sentences after it, cut so the whole stays within `max` characters. */
export function withNotes(text: string, notes: readonly string[], max = 4000): string {
  if (notes.length === 0) return text;
  const tail = notes.join(" ");
  const room = max - [...tail].length - 2;
  const head = [...text].length > room ? `${[...text].slice(0, Math.max(0, room - 1)).join("").trimEnd()}…` : text;
  return `${head}\n\n${tail}`;
}

/** R65: the sentence when more than 5 people were named. */
export function tooManyNamedNote(names: readonly string[]): string {
  return `I only looked at the calendars of the first ${MAX_NAMED_PEOPLE} people you named: ${namesText(names)}.`;
}

/** R67: the sentences for a proposal that was left out. */
export function droppedNote(title: string, reason: "busy" | "unknown", names: readonly string[]): string {
  return reason === "busy"
    ? `"${title}" did not fit ${namesText(names)}'s calendar, so it was left out.`
    : `"${title}" named someone I was not given, so it was left out.`;
}

export const NO_COMMON_TIME_NOTE = "No common time was found, so there is no draft.";

/** R68: accept_draft's refusals that name a person. */
export const noLongerFitsMessage = (name: string) => `The time no longer fits ${name}`;
export const notSharingMessage = (name: string) => `${name} no longer shares their calendar with you`;

/** R67: what the card says under a demo contact on a proposed event. */
export const demoNoInviteText = (name: string) => `${name} is a demo contact and gets no invitation`;
