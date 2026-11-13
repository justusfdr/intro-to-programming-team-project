import "server-only";

// Action send_message (ontology section 5, R1, R21 to R23, R31; spec 19):
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the body (at most 32 KB)
//   4. first transaction: allowed (R21, R5), under today's limit, text 1 to 4,000 characters, Claude
//      set up on this server; then count the message in the database (atomically) and read what
//      Claude receives (R22, R31). It commits here: the count stays even if Claude then fails (R1's
//      exception).
//   5. call Claude with no transaction open (it may take up to a minute)
//   6. run every check of R23 on the answer; one failure rejects it, nothing saved, no second try
//   7. second transaction: the user's message, the answer and its draft saved together.
// The calendar never changes here: a draft becomes events only with accept_draft.
// Spec 20: every event in the data block gets a reference valid for this request only ("e1") and a
// flag whether the coach may change it; no event id goes to Claude. A reference in the answer is
// turned back into the event at once, and the draft keeps the event's id and updated_at.
// Spec 23: the same references name the events the coach adds to-dos to; each event in the data block
// also says whether it takes to-dos from the coach and how many it has (the count only).
import { z } from "zod";
import { chatAllowed, DAILY_MESSAGES } from "@/lib/chat/access";
import { checkAnswer, checkText } from "@/lib/chat/checks";
import { buildAssistantInput, HISTORY_LENGTH } from "@/lib/chat/input";
import { ANSWER_JSON_SCHEMA, SYSTEM_PROMPT } from "@/lib/chat/prompt";
import { chatTotals } from "@/lib/chat/totals";
import { MESSAGES } from "@/lib/messages";
import {
  blocksOf,
  countMessage,
  historyOf,
  readCalendar,
  readChatAccount,
  readGoalInputs,
  readMessages,
  readTotalsInput,
  saveTurn,
  targetsOf,
  todoTargetsOf,
  withReferences,
} from "@/lib/server/chat/rows";
import { chatProOnly } from "@/lib/server/config";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { finishDueSessions } from "@/lib/server/focus/sessions";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { readSettings } from "@/lib/server/settings";

/** 4,000 characters can take up to 16,000 bytes; JSON escaping adds more. */
const MAX_BODY = 32 * 1024;

const Body = z.object({ text: z.string().max(20_000) });

export const proOnlyError = () => new ActionError(403, "pro_only", MESSAGES.chatProOnly);
export const unavailableError = () => new ActionError(503, "assistant_unavailable", MESSAGES.chatUnavailable);
const limitError = () => new ActionError(429, "daily_limit", MESSAGES.chatLimit);
const failedChecksError = () => new ActionError(502, "answer_failed_checks", MESSAGES.chatFailedChecks);

export function sendMessage(request: Request, deps: Pick<Deps, "auth" | "withUser" | "now" | "assistant">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, Body, MAX_BODY);
    if (!body.ok) return body.response;

    const assistant = deps.assistant;

    // Step 4: checks in the ontology's order, then count, then read; committed together.
    const context = await deps.withUser(userId, async (query) => {
      const account = await readChatAccount(query);
      if (!chatAllowed(account.plan, chatProOnly())) throw proOnlyError();
      if (account.usedToday >= DAILY_MESSAGES) throw limitError();
      const text = checkText(body.data.text);
      if (text === null) throw new ActionError(400, "text_length", MESSAGES.chatTextLength);
      // Without a key Claude cannot be asked; nothing is counted then.
      if (!assistant) throw unavailableError();
      // The database counts atomically: of two requests at the 20th message, only one gets it.
      if (!(await countMessage(query))) throw limitError();

      const now = deps.now();
      // R13: a session that reached its planned length counts as finished in the totals.
      await finishDueSessions(query, now);
      const settings = await readSettings(query);
      const [goals, calendar, totalsInput, messages] = await Promise.all([
        readGoalInputs(query),
        readCalendar(query, now, settings.timeZone),
        readTotalsInput(query, now, settings.timeZone),
        readMessages(query, HISTORY_LENGTH),
      ]);
      return { text, settings, goals, calendar, totalsInput, messages };
    });

    // Step 5: Claude, outside any transaction.
    const { settings, goals } = context;
    const asked = deps.now();
    const calendar = withReferences(context.calendar, asked, settings.timeZone);
    const input = buildAssistantInput({
      now: asked,
      timeZone: settings.timeZone,
      dayStartHour: settings.dayStartHour,
      dayEndHour: settings.dayEndHour,
      history: historyOf(context.messages),
      goals,
      calendar,
      totals: chatTotals({ ...context.totalsInput, goals }, asked, settings.timeZone),
      message: context.text,
    });
    const result = await assistant!.ask({ system: SYSTEM_PROMPT, data: JSON.stringify(input), schema: ANSWER_JSON_SCHEMA });
    if (result.kind === "unavailable") throw unavailableError();
    if (result.kind === "failed") throw failedChecksError();

    // Step 6: never trust the answer.
    const checked = checkAnswer(result.value, {
      now: deps.now(),
      timeZone: settings.timeZone,
      goalIds: new Set(goals.map((g) => g.id)),
      calendar: blocksOf(calendar),
      targets: targetsOf(calendar),
      todoTargets: todoTargetsOf(calendar),
    });
    if (!checked.ok) {
      console.error("Assistant answer failed a check:", checked.failure);
      throw failedChecksError();
    }

    // Step 7: both messages and the draft in one step.
    const answer = checked.value;
    const messages = await deps.withUser(userId, async (query) => {
      const saved = await saveTurn(query, context.text, {
        text: answer.text,
        proposals: answer.kind === "draft" ? answer.proposals : null,
        changes: answer.kind === "draft" ? answer.changes : [],
        additions: answer.kind === "draft" ? (answer.additions ?? []) : [],
      });
      const account = await readChatAccount(query);
      return { saved, messagesLeft: Math.max(0, DAILY_MESSAGES - account.usedToday) };
    });
    return jsonOk({ messages: messages.saved, messagesLeft: messages.messagesLeft }, 201);
  });
}
