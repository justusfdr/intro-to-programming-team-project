import "server-only";

// Action send_message (ontology section 5, R1, R21 to R23, R31; spec 19):
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the body (at most 32 KB)
//   4. first transaction: allowed (R21, R5), the chat is the user's (spec 44), text 1 to 4,000
//      characters, Claude set up on this server; then read what Claude receives (R22, R31).
//   5. call Claude with no transaction open (it may take up to a minute)
//   6. run every check of R23 on the answer; one failure rejects it, nothing saved, no second try
//   7. second transaction: the user's message, the answer and its draft saved together, in their chat,
//      or in a new chat titled with the message when none was named.
// Spec 44: there is no daily limit any more; nothing is counted. Claude receives the last messages of
// this chat only, so a new chat starts without the earlier conversations.
// The calendar never changes here: a draft becomes events only with accept_draft.
// Spec 20: every event in the data block gets a reference valid for this request only ("e1") and a
// flag whether the coach may change it; no event id goes to Claude. A reference in the answer is
// turned back into the event at once, and the draft keeps the event's id and updated_at.
// Spec 23: the same references name the events the coach adds to-dos to; each event in the data block
// also says whether it takes to-dos from the coach and how many it has (the count only).
// Spec 43: a goal with a routine also carries what the coach needs to plan its sessions (never its
// place), with the sessions left this week and next worked out here; a new session that names a goal
// must not start on a weekday the goal is never done on.
import { z } from "zod";
import { chatAllowed } from "@/lib/chat/access";
import { checkAnswer, checkText } from "@/lib/chat/checks";
import { buildAssistantInput, HISTORY_LENGTH } from "@/lib/chat/input";
import { ANSWER_JSON_SCHEMA, SYSTEM_PROMPT } from "@/lib/chat/prompt";
import { chatTotals } from "@/lib/chat/totals";
import { MESSAGES } from "@/lib/messages";
import {
  blocksOf,
  chatGone,
  findOwnChat,
  historyOf,
  latestChat,
  neverDaysOf,
  readCalendar,
  readChatAccount,
  readGoalInputs,
  readMessages,
  readTotalsInput,
  saveTurn,
  targetsOf,
  todoTargetsOf,
  withGoalWeeks,
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

// Spec 44: `chatId` names the chat to answer in, or is "new" to start one; left out, the turn goes into
// the user's latest chat (a new one when there is none), as before chats existed.
const Body = z.object({ text: z.string().max(20_000), chatId: z.string().max(100).optional() });

export const proOnlyError = () => new ActionError(403, "pro_only", MESSAGES.chatProOnly);
export const unavailableError = () => new ActionError(503, "assistant_unavailable", MESSAGES.chatUnavailable);
const failedChecksError = () => new ActionError(502, "answer_failed_checks", MESSAGES.chatFailedChecks);

export function sendMessage(request: Request, deps: Pick<Deps, "auth" | "withUser" | "now" | "assistant">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, Body, MAX_BODY);
    if (!body.ok) return body.response;

    const assistant = deps.assistant;

    // Step 4: checks in the ontology's order, then read what Claude receives.
    const context = await deps.withUser(userId, async (query) => {
      const account = await readChatAccount(query);
      if (!chatAllowed(account.plan, chatProOnly())) throw proOnlyError();
      const asked = body.data.chatId;
      const chat = asked === undefined ? await latestChat(query) : asked === "new" ? null : await findOwnChat(query, asked);
      if (asked !== undefined && asked !== "new" && chat === null) throw chatGone();
      const chatId = chat?.id ?? null;
      const text = checkText(body.data.text);
      if (text === null) throw new ActionError(400, "text_length", MESSAGES.chatTextLength);
      // Without a key Claude cannot be asked.
      if (!assistant) throw unavailableError();

      const now = deps.now();
      // R13: a session that reached its planned length counts as finished in the totals.
      await finishDueSessions(query, now);
      const settings = await readSettings(query);
      const [goals, calendar, totalsInput, messages] = await Promise.all([
        // Spec 43: with each goal's routine, for the keys of R22 and the sessions left (R45).
        readGoalInputs(query, { routines: true }),
        readCalendar(query, now, settings.timeZone),
        readTotalsInput(query, now, settings.timeZone),
        // Spec 44: only this chat's messages; a new chat has none.
        chatId === null ? Promise.resolve([]) : readMessages(query, chatId, HISTORY_LENGTH),
      ]);
      return { chatId, text, settings, goals, calendar, totalsInput, messages };
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
      goals: withGoalWeeks(goals, context.totalsInput.doneEvents, calendar, asked, settings.timeZone),
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
      neverDays: neverDaysOf(goals),
    });
    if (!checked.ok) {
      console.error("Assistant answer failed a check:", checked.failure);
      throw failedChecksError();
    }

    // Step 7: both messages and the draft in one step.
    const answer = checked.value;
    const saved = await deps.withUser(userId, (query) =>
      saveTurn(query, context.chatId, context.text, {
        text: answer.text,
        proposals: answer.kind === "draft" ? answer.proposals : null,
        changes: answer.kind === "draft" ? answer.changes : [],
        additions: answer.kind === "draft" ? (answer.additions ?? []) : [],
      }),
    );
    return jsonOk({ chat: saved.chat, messages: saved.messages }, 201);
  });
}
