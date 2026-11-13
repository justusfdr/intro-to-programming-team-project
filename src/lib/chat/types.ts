// The shapes of the coach (the AI chat, spec 19) as the server sends them to the page.
import type { EventDto } from "@/lib/events/types";
import type { GoalLook } from "@/lib/goals/style";
import type { Display } from "@/lib/time/display";

export type ChatRole = "user" | "assistant";

/** "undone" (spec 20): an accepted draft whose changes were taken back; final. */
export type DraftStatus = "open" | "accepted" | "rejected" | "replaced" | "undone";

/** One proposed event of a draft. Times are ISO strings in UTC. `todos` (spec 21): its to-dos, left out when it has none. */
export type ProposedEventDto = { title: string; startAt: string; endAt: string; goalId: string | null; todos?: string[] };

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
 * `version` (spec 22): 0 as the assistant wrote it, one more for each change the person made by
 * dragging (R4: a change carries the version the screen last saw). Left out counts as 0.
 */
export type DraftDto = { id: string; status: DraftStatus; events: ProposedEventDto[]; changes: DraftChangeDto[]; version?: number };

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
