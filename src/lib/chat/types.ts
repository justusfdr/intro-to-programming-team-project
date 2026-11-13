// The shapes of the coach (the AI chat, spec 19) as the server sends them to the page.
import type { EventDto } from "@/lib/events/types";
import type { GoalLook } from "@/lib/goals/style";
import type { Display } from "@/lib/time/display";

export type ChatRole = "user" | "assistant";

export type DraftStatus = "open" | "accepted" | "rejected" | "replaced";

/** One proposed event of a draft. Times are ISO strings in UTC. */
export type ProposedEventDto = { title: string; startAt: string; endAt: string; goalId: string | null };

export type DraftDto = { id: string; status: DraftStatus; events: ProposedEventDto[] };

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
  /** The events of the days the open draft touches, to draw the draft between them; empty without an open draft. */
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
