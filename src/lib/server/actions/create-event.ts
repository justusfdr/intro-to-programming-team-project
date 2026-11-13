import "server-only";

// Action create_event (ontology section 5; specs 02 and 07). Reference pattern for actions of a signed-in user:
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the body
//   4. inside withUser: read what the rules need, check the rules, write   5. one answer per outcome.
// Every database call goes through withUser, so row-level security applies; a thrown rejection
// rolls the transaction back, so nothing is saved (R1). A series is written in the same transaction:
// all its events or none (R28).
// Spec 21: the new event may come with its to-dos (the editor's list of a new event, the calendar's
// undo of a delete, R38); they are written in the same transaction, on every event of a series.
import { randomUUID } from "node:crypto";
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { handleAction } from "@/lib/server/errors";
import { checkEventFields, checkRepeat, EventFields } from "@/lib/server/events/input";
import { EVENT_COLUMNS, toEventDto, type EventRow } from "@/lib/server/events/rows";
import { templateOf, timesOn } from "@/lib/server/events/series";
import { assertOwnGoal } from "@/lib/server/goals/own-goal";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { asTodoError, checkTodoList } from "@/lib/server/todos/input";
import { countsOf, insertTodos } from "@/lib/server/todos/rows";
import { requireUser } from "@/lib/server/session";
import { readTimeZone } from "@/lib/server/settings";
import { localDateOf } from "@/lib/time/zoned";

export function createEvent(request: Request, deps: Pick<Deps, "auth" | "withUser">): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, EventFields);
    if (!body.ok) return body.response;

    // The database's refusal of a to-do (two requests at the same moment) becomes the ontology's answer.
    const asAnswer = (error: unknown) => Promise.reject(asTodoError(error));
    return deps.withUser(userId, async (query) => {
      // The form sends local times or days; the user's time zone turns times into instants (stored in UTC).
      const timeZone = await readTimeZone(query);
      const event = checkEventFields(body.data, timeZone);
      // Spec 21: the to-dos come after the event's own checks, in the ontology's order.
      const todos = checkTodoList(body.data.todos);
      /** The event as saved, with its to-dos (written after it, so counted here). */
      const savedDto = async (row: EventRow) => {
        await insertTodos(query, [row.id], todos);
        return { ...toEventDto(row), ...countsOf(todos) };
      };

      if (event.allDay) {
        checkRepeat(body.data, event.firstDay); // R29: an all-day event never repeats
        const [row] = await query<EventRow>(
          `insert into app.events (title, all_day, first_day, last_day, location) values ($1, true, $2, $3, $4) returning ${EVENT_COLUMNS}`,
          [event.title, event.firstDay, event.lastDay, event.location ?? null],
        );
        return jsonOk({ message: MESSAGES.eventSaved, event: await savedDto(row) }, 201);
      }

      // The goal must be the user's own, else "Not found" (R3).
      const goalId = event.goalId ?? null;
      await assertOwnGoal(query, goalId);
      const mayOverlap = event.mayOverlap ?? false;
      const location = event.location ?? null;

      const dates = checkRepeat(body.data, localDateOf(event.startAt, timeZone));
      if (!dates) {
        // user_id, status ("planned"), source ("app") and updated_at are filled in by the database.
        const [row] = await query<EventRow>(
          `insert into app.events (title, start_at, end_at, may_overlap, goal_id, location)
           values ($1, $2, $3, $4, $5, $6)
           returning ${EVENT_COLUMNS}`,
          [event.title, event.startAt, event.endAt, mayOverlap, goalId, location],
        );
        return jsonOk({ message: MESSAGES.eventSaved, event: await savedDto(row) }, 201);
      }

      // A series (R28): the same title, time, length, goal, location and may_overlap on every date, one series_id.
      const template = templateOf(event.startAt, event.endAt, timeZone);
      const seriesId = randomUUID();
      const params: unknown[] = [event.title, mayOverlap, goalId, seriesId, location];
      const values = dates.map((date) => {
        const { startAt, endAt } = timesOn(date, template, timeZone);
        params.push(startAt, endAt);
        return `($1, $${params.length - 1}, $${params.length}, $2, $3, $4, $5)`;
      });
      const rows = await query<EventRow>(
        `insert into app.events (title, start_at, end_at, may_overlap, goal_id, series_id, location)
         values ${values.join(", ")}
         returning ${EVENT_COLUMNS}`,
        params,
      );
      await insertTodos(query, rows.map((row) => row.id), todos);
      const events = rows
        .map((row) => ({ ...toEventDto(row), ...countsOf(todos) }))
        .sort((a, b) => (a.startAt ?? "").localeCompare(b.startAt ?? ""));
      return jsonOk({ message: MESSAGES.seriesSaved, event: events[0], count: events.length }, 201);
    }).catch(asAnswer);
  });
}
