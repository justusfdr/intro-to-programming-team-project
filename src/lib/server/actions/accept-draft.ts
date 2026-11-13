import "server-only";

// Action accept_draft (ontology section 5, R1, R4, R21, R23; spec 19):
//   1. same-origin check   2. signed in (R3)
//   3. one transaction: the user's draft, locked ("Not found" otherwise, R3); still open; the chat is
//      allowed (R21, R5); R23's checks again against the calendar as it is now (a proposed event that
//      has started, a new event in the way, a deleted goal: "This draft is out of date. Ask again");
//      then app.chat_accept_draft creates all events with source "assistant" and marks the draft
//      accepted. Two devices accepting the same draft take turns on the lock: the second one is told
//      "This draft is no longer open", and the database itself accepts a draft only once (R4).
import { chatAllowed } from "@/lib/chat/access";
import { checkProposals } from "@/lib/chat/checks";
import { MESSAGES } from "@/lib/messages";
import { assertDraftOpen, blocksOf, findOwnDraft, proposalsOf, readCalendar, readChatAccount } from "@/lib/server/chat/rows";
import { chatProOnly } from "@/lib/server/config";
import type { Deps } from "@/lib/server/deps";
import { ActionError, handleAction } from "@/lib/server/errors";
import { EVENT_COLUMNS, toEventDto, type EventRow } from "@/lib/server/events/rows";
import { assertSameOrigin, jsonOk } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { readTimeZone } from "@/lib/server/settings";
import { proOnlyError } from "./send-message";

export function acceptDraft(request: Request, deps: Pick<Deps, "auth" | "withUser" | "now">, id: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    try {
      return await deps.withUser(userId, async (query) => {
        const draft = await findOwnDraft(query, id);
        assertDraftOpen(draft);
        const account = await readChatAccount(query);
        if (!chatAllowed(account.plan, chatProOnly())) throw proOnlyError();

        const now = deps.now();
        const timeZone = await readTimeZone(query);
        const [calendar, goals] = await Promise.all([
          readCalendar(query, now, timeZone),
          query<{ id: string }>("select id from app.goals"),
        ]);
        const checked = checkProposals(proposalsOf(draft.proposed_events), {
          now,
          timeZone,
          goalIds: new Set(goals.map((g) => g.id)),
          calendar: blocksOf(calendar),
        });
        if (!checked.ok) throw new ActionError(409, "draft_out_of_date", MESSAGES.draftOutOfDate);

        const created = await query<{ id: string }>("select id from app.chat_accept_draft($1) as id", [draft.id]);
        const rows = await query<EventRow>(
          `select ${EVENT_COLUMNS} from app.events where id = any($1::uuid[]) order by start_at, id`,
          [created.map((c) => c.id)],
        );
        return jsonOk({ message: MESSAGES.draftAccepted, draftId: draft.id, events: rows.map(toEventDto) }, 201);
      });
    } catch (error) {
      // The database's own refusal (a second device got there first between our read and the function).
      if ((error as { constraint?: unknown } | null)?.constraint === "draft_plans_status_forward") {
        throw new ActionError(409, "draft_not_open", MESSAGES.draftNotOpen);
      }
      throw error;
    }
  });
}
