import "server-only";

// Action edit_goal (ontology section 5; spec 03). Same pattern as edit_event:
//   1. same-origin check   2. signed in (R3)   3. read and shape-check the body
//   4. inside withUser: find the user's goal ("Not found" otherwise, R3), check it has not changed since
//      the device last saw it (R4), check the fields, write the goal and its rules   5. one answer per outcome.
// Rules are updated and added before any is deleted, so the goal always keeps a rule while the
// transaction runs (the database checks this when a rule is deleted).
// Spec 41: the routine's fields the body leaves out keep their saved values. A deadline of null makes
// the goal open-ended: the placeholder (today plus 364 days) is written when it becomes open-ended and
// left alone by later edits; a date ends that.
import { z } from "zod";
import { MESSAGES } from "@/lib/messages";
import type { Deps } from "@/lib/server/deps";
import { handleAction } from "@/lib/server/errors";
import { assertUnchangedSince, notFound } from "@/lib/server/events/own-event";
import { checkGoalFields, GoalFields, OPEN_ENDED_PLACEHOLDER_DAYS } from "@/lib/server/goals/input";
import { findOwnGoal, findOwnRule } from "@/lib/server/goals/own-goal";
import { readGoals, readSavedRoutine } from "@/lib/server/goals/rows";
import { avoidDaysToText } from "@/lib/goals/routine";
import { assertSameOrigin, jsonOk, readJson } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { readTimeZone } from "@/lib/server/settings";
import { addDays, localDateOf } from "@/lib/time/zoned";

/** The editor's fields, plus the updated_at the device last saw (R4). */
const EditGoalBody = GoalFields.extend({ updatedAt: z.string().max(40) });

export function editGoal(request: Request, deps: Pick<Deps, "auth" | "withUser" | "now">, id: string): Promise<Response> {
  return handleAction(async () => {
    const denied = assertSameOrigin(request);
    if (denied) return denied;

    const userId = await requireUser(deps.auth);

    const body = await readJson(request, EditGoalBody);
    if (!body.ok) return body.response;

    return deps.withUser(userId, async (query) => {
      // Locks the goal until the transaction ends, so a second device waits instead of racing.
      const goal = await findOwnGoal(query, id);
      assertUnchangedSince(goal, body.data.updatedAt);

      const today = localDateOf(deps.now(), await readTimeZone(query));
      const saved = await readSavedRoutine(query, goal.id);
      // The goal's current deadline may stay even if it has passed (spec 03, R7); an open-ended goal's
      // placeholder is not a deadline.
      const checked = checkGoalFields(body.data, today, {
        deadline: saved.openEnded ? undefined : goal.deadline,
        routine: saved.routine,
      });
      // Open-ended: keep the placeholder it has, or write a new one when it becomes open-ended now.
      const deadline = checked.deadline ?? (saved.openEnded ? goal.deadline : addDays(today, OPEN_ENDED_PLACEHOLDER_DAYS));

      // Rules that already exist: each must be a rule of this goal, else "Not found" (R3).
      const kept = new Set<string>();
      for (const rule of checked.rules) {
        if (rule.id === undefined) continue;
        const existing = await findOwnRule(query, rule.id);
        if (existing.goal_id !== goal.id) throw notFound();
        kept.add(existing.id);
        await query("update app.rules set kind = $2, target = $3, min_minutes = $4 where id = $1", [
          existing.id,
          rule.kind,
          rule.target,
          rule.minMinutes,
        ]);
      }

      // New rules.
      for (const rule of checked.rules) {
        if (rule.id !== undefined) continue;
        const [added] = await query<{ id: string }>(
          "insert into app.rules (goal_id, kind, target, min_minutes) values ($1, $2, $3, $4) returning id",
          [goal.id, rule.kind, rule.target, rule.minMinutes],
        );
        kept.add(added.id);
      }

      // Rules left out of the list are removed.
      const current = await query<{ id: string }>("select id from app.rules where goal_id = $1", [goal.id]);
      for (const row of current) {
        if (!kept.has(row.id)) await query("delete from app.rules where id = $1", [row.id]);
      }

      // Also gives the goal a new updated_at, so the other devices see the change (R4).
      // Colour, icon and why stay as they are when the body leaves them out. The routine is written
      // whole: checkGoalFields already put the kept values where the body left a field out (the row is
      // locked, so nothing changed them in between).
      const { routine } = checked;
      await query(
        `update app.goals
            set title = $2::text, deadline = $3::date, auto_block = $4::boolean,
                color = case when $5::boolean then $6::text else color end,
                icon = coalesce($7::text, icon),
                why = coalesce($8::text, why),
                open_ended = $9::boolean,
                category = $10::text, category_other = $11::text, session_minutes = $12::integer,
                day_part = $13::text, avoid_days = $14::text, location = $15::text, must_days = $16::text,
                day_from_min = $17::integer, day_until_min = $18::integer
          where id = $1::uuid`,
        [
          goal.id,
          checked.title,
          deadline,
          checked.autoBlock,
          checked.color !== undefined,
          checked.color ?? null,
          checked.icon ?? null,
          checked.why ?? null,
          checked.deadline === null,
          routine.category,
          routine.categoryOther,
          routine.sessionMinutes,
          routine.dayPart,
          avoidDaysToText(routine.avoidDays),
          routine.location,
          avoidDaysToText(routine.mustDays),
          routine.dayFrom,
          routine.dayUntil,
        ],
      );
      const [after] = await readGoals(query, goal.id);
      return jsonOk({ message: MESSAGES.goalSaved, goal: after.goal });
    });
  });
}
