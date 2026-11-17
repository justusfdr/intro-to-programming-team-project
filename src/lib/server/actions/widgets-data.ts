import "server-only";

// Action widgets_data (spec 47): everything the sidebar widgets show, read in one go. Reads only.
//   1. signed in (R3)   2. one transaction (withUser) with all the reads   3. one answer.
// Everything is calculated at the time of the request from the user's own rows (row-level security
// limits every query to them): nothing is saved here. The widget layout is the saved list, or the
// standard one when none is saved or the saved one is no longer valid (R47).
import { ruleAmount, type DoneEvent, type Rule } from "@/lib/goals/progress";
import { focusedMinutes, plannedEnd, type SessionTimes } from "@/lib/focus/session-time";
import { canTravel } from "@/lib/travel/web-link";
import { addDays, localDateOf, mondayOf, startOfLocalDate, weekOf } from "@/lib/time/zoned";
import { checkLayout } from "@/lib/widgets/layout";
import { nextFreeTime } from "@/lib/widgets/free-time";
import { DEFAULT_LAYOUT, type WidgetEvent, type WidgetGoal, type WidgetItem, type WidgetsData } from "@/lib/widgets/types";
import type { GoalView } from "@/lib/goals/types";
import type { Query } from "@/lib/server/db";
import type { Deps } from "@/lib/server/deps";
import { handleAction } from "@/lib/server/errors";
import { EVENT_COLUMNS, type EventRow } from "@/lib/server/events/rows";
import { readGoalViews } from "@/lib/server/goals/load";
import { jsonOk } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";
import { readSettings } from "@/lib/server/settings";

export function widgetsData(deps: Pick<Deps, "auth" | "withUser" | "now">): Promise<Response> {
  return handleAction(async () => {
    const userId = await requireUser(deps.auth);
    const data = await deps.withUser(userId, (query) => readWidgetsData(query, deps.now()));
    return jsonOk(data);
  });
}

/** The saved layout as the user has it, or the standard one. Never throws on a bad saved value. */
export function layoutOf(saved: unknown): { layout: WidgetItem[]; isDefault: boolean } {
  let value = saved;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      value = null;
    }
  }
  if (value !== null && value !== undefined) {
    const checked = checkLayout(value);
    if (checked.ok) return { layout: checked.layout, isDefault: false };
  }
  return { layout: DEFAULT_LAYOUT.map((item) => ({ ...item })), isDefault: true };
}

type SessionRow = { planned_minutes: number; status: SessionTimes["status"]; started_at: Date; paused_at: Date | null; paused_seconds: number; ended_at: Date | null };

/** A session as the pure functions take it. A running one past its planned end counts as ended there (R13). */
function timesOf(row: SessionRow, now: Date): SessionTimes {
  const times: SessionTimes = {
    status: row.status,
    plannedMinutes: row.planned_minutes,
    startedAt: new Date(row.started_at),
    pausedAt: row.paused_at ? new Date(row.paused_at) : null,
    pausedSeconds: row.paused_seconds,
    endedAt: row.ended_at ? new Date(row.ended_at) : null,
  };
  if (times.status === "running" && plannedEnd(times) <= now) return { ...times, status: "finished", endedAt: plannedEnd(times) };
  return times;
}

/** The first rule of a goal this week as a ring (src/lib/widgets/types.ts), or null for a goal without rules. */
function ringOf(goal: GoalView, doneThisWeek: DoneEvent[]): WidgetGoal | null {
  const rule: Rule | undefined = goal.rules[0];
  if (!rule) return null;
  const amount = ruleAmount(rule, doneThisWeek);
  // Hours are rounded down to a tenth, so progress is never overstated.
  const done = rule.kind === "hours" ? Math.floor((amount / 60) * 10 + 1e-9) / 10 : amount;
  const met = goal.progress.thisWeek.length > 0 && goal.progress.thisWeek.every((r) => r.status === "met");
  return { id: goal.id, title: goal.title, look: goal.look, done, target: rule.target, unit: rule.kind, met };
}

/** Everything inside a transaction that is already open. */
export async function readWidgetsData(query: Query, now: Date): Promise<WidgetsData> {
  const settings = await readSettings(query);
  const { timeZone } = settings;
  const today = localDateOf(now, timeZone);
  const tomorrow = addDays(today, 1);
  const week = weekOf(today, timeZone);
  const dayAfterTomorrow = startOfLocalDate(addDays(today, 2), timeZone);
  const todayStart = startOfLocalDate(today, timeZone);

  const [saved, goals, events, doneEvents, sessions] = await Promise.all([
    query<{ widgets: unknown }>("select widgets from app.settings"),
    readGoalViews(query, now, timeZone),
    // Timed events that are on now or still to come, up to the end of tomorrow.
    query<EventRow>(
      `select ${EVENT_COLUMNS} from app.events where not all_day and end_at > $1 and start_at < $2 order by start_at, id`,
      [now, dayAfterTomorrow],
    ),
    // Only done events of a goal count (R8); this week only.
    query<{ goal_id: string; start_at: Date; end_at: Date }>(
      "select goal_id, start_at, end_at from app.events where status = 'done' and goal_id is not null and not all_day and start_at >= $1 and start_at < $2",
      [week.startsAt, week.endsAt],
    ),
    query<SessionRow>(
      "select planned_minutes, status, started_at, paused_at, paused_seconds, ended_at from app.focus_sessions where started_at >= $1 and started_at <= $2",
      [todayStart, now],
    ),
  ]);

  const goalById = new Map(goals.map((g) => [g.id, g]));
  const toEvent = (row: EventRow): WidgetEvent => {
    const goal = row.goal_id ? goalById.get(row.goal_id) : undefined;
    const location = row.location?.trim() || null;
    return {
      id: row.id,
      title: row.title,
      start: new Date(row.start_at!).toISOString(),
      end: new Date(row.end_at!).toISOString(),
      location,
      goal: goal ? { title: goal.title, look: goal.look } : null,
      todos: { done: row.todos_done ?? 0, total: row.todo_count ?? 0 },
      guests: row.guests?.length ?? 0,
      travelable: canTravel({ allDay: false, location }),
    };
  };

  const startsOn = (row: EventRow, date: string) => localDateOf(new Date(row.start_at!), timeZone) === date;
  const running = events.find((e) => new Date(e.start_at!) <= now && new Date(e.end_at!) > now);
  const upcoming = events.filter((e) => new Date(e.start_at!) > now && startsOn(e, today));
  const nextRow = running ?? upcoming[0] ?? null;
  const afterRow = upcoming.find((e) => e.id !== nextRow?.id) ?? null;
  const tomorrowRow = events.find((e) => startsOn(e, tomorrow)) ?? null;
  const tripRow = upcoming.find((e) => canTravel({ allDay: false, location: e.location })) ?? null;

  // This week's done events by goal, only those that start in the current Monday-to-Sunday week (R2).
  const monday = mondayOf(today);
  const doneByGoal = new Map<string, DoneEvent[]>();
  for (const e of doneEvents) {
    if (mondayOf(localDateOf(new Date(e.start_at), timeZone)) !== monday) continue;
    doneByGoal.set(e.goal_id, [...(doneByGoal.get(e.goal_id) ?? []), { startAt: new Date(e.start_at), endAt: new Date(e.end_at) }]);
  }
  const rings = goals.map((g) => ringOf(g, doneByGoal.get(g.id) ?? [])).filter((r): r is WidgetGoal => r !== null);

  const focusMinutes = sessions
    .filter((s) => localDateOf(new Date(s.started_at), timeZone) === today)
    .reduce((sum, s) => sum + focusedMinutes(timesOf(s, now), now), 0);

  const free = nextFreeTime({
    now,
    timeZone,
    dayStartHour: settings.dayStartHour,
    dayEndHour: settings.dayEndHour,
    events: events.map((e) => ({ start: new Date(e.start_at!), end: new Date(e.end_at!) })),
  });

  const { layout, isDefault } = layoutOf(saved[0]?.widgets ?? null);
  const short = (row: EventRow | null) => (row ? { title: row.title, start: new Date(row.start_at!).toISOString() } : null);
  return {
    layout,
    isDefault,
    now: now.toISOString(),
    timeZone,
    timeFormat: settings.timeFormat,
    next: nextRow ? toEvent(nextRow) : null,
    after: short(afterRow),
    tomorrow: short(tomorrowRow),
    trip: tripRow ? toEvent(tripRow) : null,
    goals: rings,
    focusMinutes,
    free: free ? { start: free.start.toISOString(), end: free.end.toISOString() } : null,
  };
}
