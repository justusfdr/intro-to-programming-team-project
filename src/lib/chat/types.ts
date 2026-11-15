// The shapes of the coach (the AI chat, spec 19) as the server sends them to the page.
import type { EventDto } from "@/lib/events/types";
import type { GoalLook } from "@/lib/goals/style";
import type { AvatarLook } from "@/lib/profiles/types";
import type { Display } from "@/lib/time/display";

export type ChatRole = "user" | "assistant";

/** "undone" (spec 20): an accepted draft whose changes were taken back; final. */
export type DraftStatus = "open" | "accepted" | "rejected" | "replaced" | "undone";

/**
 * Spec 37: a person a proposed event invites, as the card shows them. `key` is the contact row id (or a
 * demo contact's fixed id) the server stored; the card sends it back to take the person off. A demo
 * contact has its look and gets no invitation; `gone` marks someone who is no longer a contact.
 */
export type DraftPersonDto = { key: string; name: string; photoUrl: string | null; demo?: AvatarLook; gone?: true };

/**
 * One proposed event of a draft. Times are ISO strings in UTC. `todos` (spec 21): its to-dos, left out
 * when it has none. `people` (spec 37): the people it invites, left out when none.
 */
export type ProposedEventDto = { title: string; startAt: string; endAt: string; goalId: string | null; todos?: string[]; people?: DraftPersonDto[] };

/**
 * A proposed change of an existing event (spec 20): a move to new times, or a delete. The title, goal
 * and old times are the event's as the draft saw them, so the draft can still be shown after the event
 * changed. Times are ISO strings in UTC; `startAt` and `endAt` are null for a delete.
 */
export type DraftChangeDto = {
  kind: "move" | "delete";
  eventId: string;
  title: string;
  goalId: string | null;
  oldStartAt: string;
  oldEndAt: string;
  startAt: string | null;
  endAt: string | null;
};

/**
 * To-dos the draft adds to an event that is already in the calendar (spec 23). The event's title and
 * times are as the draft saw them, so the draft can still be shown after the event changed: a timed
 * event has `startAt` and `endAt` (ISO strings in UTC), an all-day one `firstDay` and `lastDay`. The
 * titles are added at the end of the event's list when the draft is applied.
 */
export type DraftTodosDto = {
  eventId: string;
  title: string;
  allDay: boolean;
  startAt: string | null;
  endAt: string | null;
  firstDay: string | null;
  lastDay: string | null;
  todos: string[];
};

/**
 * `version` (spec 22): 0 as the assistant wrote it, one more for each change the person made by
 * dragging (R4: a change carries the version the screen last saw). Left out counts as 0.
 */
export type DraftDto = {
  id: string;
  status: DraftStatus;
  events: ProposedEventDto[];
  changes: DraftChangeDto[];
  version?: number;
  /** Spec 23: to-dos for events already in the calendar; left out when the draft has none. */
  addedTodos?: DraftTodosDto[];
};

export type ChatMessageDto = {
  id: string;
  role: ChatRole;
  text: string;
  /** ISO string in UTC. */
  createdAt: string;
  /** Only on an assistant message that proposed a plan. */
  draft: DraftDto | null;
};

/** A goal as the chat shows it next to a proposed event: title, colour and icon. */
export type ChatGoal = { id: string; title: string; look: GoalLook };

/** Everything the chat page needs, read in one transaction (src/lib/server/pages/load.ts). */
export type ChatPageData = {
  display: Display;
  timeZone: string;
  /** Oldest first; at most the latest 100. */
  messages: ChatMessageDto[];
  /**
   * The events of the days the open draft touches (also the old day of a moved event), to draw the
   * draft between them; empty without an open draft.
   */
  draftDayEvents: EventDto[];
  /** The local days the open draft touches ("2026-11-17"), in order; empty without an open draft. */
  draftDays: string[];
  goals: ChatGoal[];
  /** Messages left today (R21): 0 to 20. */
  messagesLeft: number;
  /** Whether this user may use the chat (R21, CHAT_PRO_ONLY). */
  chatAllowed: boolean;
  /** Whether the Claude API key is set on this server; without it every message gets "not available". */
  assistantConfigured: boolean;
};
