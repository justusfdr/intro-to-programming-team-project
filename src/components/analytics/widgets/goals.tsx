"use client";

// The Goals tab's widgets (spec 49): which goals were reached, weeks in a row per goal, deadlines, the
// plan day by day and what slipped. Every goal is drawn in its own colour and icon (goalColor, GoalTile).
import { AlertTriangle, CalendarCheck, CalendarDays, Check, Clock, Flame, Target, X } from "lucide-react";
import { GOAL_ICONS } from "@/components/goals/GoalTile";
import { useDisplay } from "@/components/shell/DisplayProvider";
import type { GoalsNumbers, PlanItem } from "@/lib/analytics/report-types";
import { goalColor } from "@/lib/goals/colors";
import { fmtDateShort, fmtDayMonth, fmtTime, fmtWeekday } from "@/lib/time/display";
import { addDays, localDateOf, localTimeOf } from "@/lib/time/zoned";
import { Big, Empty, goalShare, More, NO_GOALS, plural, ruleText, shortText, weekdayLong, weekLabel, WidgetCard, type WidgetProps } from "./parts";

type GoalRow = GoalsNumbers["list"][number];

/** The ring around a goal's icon: how far the week got, in the goal's colour. */
function GoalRing({ row }: { row: GoalRow }) {
  const color = goalColor(row.goal.color);
  const Icon = GOAL_ICONS[row.goal.icon];
  const full = 2 * Math.PI * 17;
  const share = goalShare(row);
  return (
    <span aria-hidden className="relative flex size-10 shrink-0 items-center justify-center">
      <svg width="40" height="40" viewBox="0 0 40 40" className="absolute inset-0">
        <circle cx="20" cy="20" r="17" fill="none" className="stroke-white" strokeWidth="4" />
        {share > 0 && (
          <circle
            cx="20"
            cy="20"
            r="17"
            fill="none"
            className={color.stroke}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${(full * share).toFixed(1)} ${full.toFixed(1)}`}
            transform="rotate(-90 20 20)"
          />
        )}
      </svg>
      <Icon className={`relative size-4 ${color.text}`} strokeWidth={2} />
    </span>
  );
}

/** One goal's tile: ring, name, progress, and a check or how much is short. */
function GoalTileRow({ row }: { row: GoalRow }) {
  const color = goalColor(row.goal.color);
  const short = shortText(row);
  return (
    <li className={`flex min-w-0 items-center gap-2.5 rounded-xl border px-2.5 py-2 ${color.block}`}>
      <GoalRing row={row} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{row.goal.title}</span>
        <span className={`block truncate text-xs ${color.subtext}`}>{row.rules.map(ruleText).join(" · ")}</span>
      </span>
      <span className="inline-flex shrink-0 items-center text-xs font-semibold whitespace-nowrap">
        {row.status === "met" ? (
          <>
            <Check aria-hidden className="size-[18px]" strokeWidth={2.4} />
            <span className="sr-only">Reached</span>
          </>
        ) : (
          (short ?? <span className="sr-only">Not reached yet</span>)
        )}
      </span>
    </li>
  );
}

export function GoalsReachedWidget({ report, size, onOpen }: WidgetProps) {
  const { list, reached, judged, lastWeeks } = report.goals;
  const max = size === "L" ? 6 : 4;
  return (
    <WidgetCard title="Did you reach your goals?" icon={Target} tint="indigo" onOpen={onOpen}>
      {judged === 0 ? (
        <Empty className="mt-auto">{NO_GOALS}</Empty>
      ) : (
        <>
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <span className="flex items-baseline gap-2.5">
              <Big>
                {reached} of {judged}
              </Big>
              <span className="text-[15px] text-ink-2">reached</span>
            </span>
            <ul className="flex flex-wrap gap-3 text-xs text-ink-2" aria-label="Goals reached in the last weeks">
              {lastWeeks.map((w, i) => {
                const on = i === lastWeeks.length - 1;
                return (
                  <li key={w.monday} className={`inline-flex items-center gap-1.5 ${on ? "font-semibold text-ink" : ""}`}>
                    {weekLabel(w.monday)}
                    <span className="sr-only">
                      : {w.reached} of {w.judged} reached
                    </span>
                    <span aria-hidden className="inline-flex gap-[3px]">
                      {w.judged === 0 ? (
                        <span>–</span>
                      ) : (
                        Array.from({ length: Math.min(w.judged, 6) }, (_, n) => <span key={n} className={`size-[7px] rounded-full ${n < w.reached ? "bg-ink" : "bg-ink/15"}`} />)
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <ul className={`mt-auto grid gap-2 pt-3.5 ${size === "L" ? "grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`}>
            {list.slice(0, max).map((row) => (
              <GoalTileRow key={row.goal.id} row={row} />
            ))}
          </ul>
          <More count={list.length - max} className="mt-1.5" />
        </>
      )}
    </WidgetCard>
  );
}

/** "On target since Oct 26", or what is missing when the row is 0. */
function streakNote(row: GoalRow, monday: string): string {
  if (row.weeksInRow > 0) {
    const start = row.status === "met" ? addDays(monday, -7 * (row.weeksInRow - 1)) : addDays(monday, -7 * row.weeksInRow);
    return `On target since ${fmtDayMonth(start)}`;
  }
  const short = shortText(row);
  if (row.status === "missed") return short ? `Not reached this week, ${short}` : "Not reached this week";
  return short ? `${short} this week` : "Not reached yet";
}

export function GoalStreaksWidget({ report, size, onOpen }: WidgetProps) {
  const { list } = report.goals;
  const max = 4;
  return (
    <WidgetCard title="Weeks in a row" icon={Flame} tint="orange" onOpen={onOpen}>
      {list.length === 0 ? (
        <Empty className="mt-auto">{NO_GOALS}</Empty>
      ) : (
        <>
          <ul className={`mt-3.5 grid min-h-0 flex-1 gap-2 ${size === "S" ? "auto-rows-fr grid-cols-1" : "grid-cols-1 sm:grid-cols-2 sm:grid-rows-2"}`}>
            {list.slice(0, max).map((row) => {
              const on = row.weeksInRow > 0;
              const color = goalColor(row.goal.color);
              const Icon = GOAL_ICONS[row.goal.icon];
              const box = on ? color.block : "border-line-subtle bg-raised text-ink";
              const count = (
                <span className="inline-flex shrink-0 items-center gap-1 tabular font-semibold whitespace-nowrap">
                  <Flame aria-hidden className={`size-3.5 ${on ? "text-orange-600" : "text-ink-3"}`} />
                  {size === "S" ? row.weeksInRow : plural(row.weeksInRow, "week")}
                  {size === "S" && <span className="sr-only"> {row.weeksInRow === 1 ? "week" : "weeks"} in a row</span>}
                </span>
              );
              return size === "S" ? (
                <li key={row.goal.id} className={`flex min-h-0 min-w-0 items-center gap-2.5 overflow-hidden rounded-xl border px-2.5 py-1.5 ${box}`}>
                  <Icon aria-hidden className={`size-4 shrink-0 ${on ? color.text : "text-ink-3"}`} />
                  <span className="min-w-0 flex-1 truncate font-semibold">{row.goal.title}</span>
                  {count}
                </li>
              ) : (
                <li key={row.goal.id} className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border px-3 py-2.5 ${box}`}>
                  <span className="flex items-center gap-2">
                    <Icon aria-hidden className={`size-4 shrink-0 ${on ? color.text : "text-ink-3"}`} />
                    <span className="min-w-0 flex-1 truncate font-semibold">{row.goal.title}</span>
                    {count}
                  </span>
                  <span className={`mt-auto truncate pt-1 text-xs ${on ? color.subtext : "text-ink-2"}`}>{streakNote(row, report.monday)}</span>
                </li>
              );
            })}
          </ul>
          <More count={list.length - max} className="mt-1.5" />
        </>
      )}
    </WidgetCard>
  );
}

/** "33 days", "1 day", "Today", "3 days ago" or "No end date". */
export function daysLeftText(daysLeft: number | null): string {
  if (daysLeft === null) return "No end date";
  if (daysLeft === 0) return "Today";
  if (daysLeft > 0) return plural(daysLeft, "day");
  return `${plural(-daysLeft, "day")} ago`;
}

export function DeadlinesWidget({ report, onOpen }: WidgetProps) {
  const rows = [...report.goals.list].sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity));
  const max = 4;
  return (
    <WidgetCard title="Deadlines" icon={CalendarDays} tint="indigo" onOpen={onOpen}>
      {rows.length === 0 ? (
        <Empty className="mt-auto">{NO_GOALS}</Empty>
      ) : (
        <>
          <ul className="mt-auto flex flex-col gap-3 pt-3">
            {rows.slice(0, max).map((row) => (
              <li key={row.goal.id} className="flex min-w-0 items-center gap-2.5">
                <span aria-hidden className={`size-2 shrink-0 rounded-full ${goalColor(row.goal.color).dot}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{row.goal.title}</span>
                  {row.deadline && <span className="block truncate text-xs text-ink-2">{fmtDateShort(row.deadline)}</span>}
                </span>
                <span className={`shrink-0 tabular whitespace-nowrap ${row.daysLeft === null ? "text-xs text-ink-3" : row.daysLeft < 0 ? "font-semibold text-warning" : "font-semibold"}`}>
                  {daysLeftText(row.daysLeft)}
                </span>
              </li>
            ))}
          </ul>
          <More count={rows.length - max} className="mt-1.5" />
        </>
      )}
    </WidgetCard>
  );
}

/** A planned event as a chip: done in the goal's colour with a check; not done white, dashed, with a cross; still ahead white with a clock. */
function PlanChip({ item, compact }: { item: PlanItem; compact: boolean }) {
  const color = goalColor(item.goal.color);
  const look =
    item.state === "done"
      ? `border-solid ${color.block}`
      : item.state === "not_done"
        ? "border-dashed border-ink-3 bg-surface text-ink-2"
        : "border-solid border-line bg-surface text-ink-2";
  const Icon = item.state === "done" ? Check : item.state === "not_done" ? X : Clock;
  const state = item.state === "done" ? "done" : item.state === "not_done" ? "not done" : "still ahead";
  return (
    <li className={`flex h-[26px] min-w-0 shrink-0 items-center gap-1 rounded-lg border px-1.5 text-[11px] font-medium ${look}`} title={`${item.goal.title}: ${state}`}>
      <Icon aria-hidden className="size-[11px] shrink-0" strokeWidth={2.6} />
      <span className={`truncate ${compact ? "sr-only" : ""}`}>{item.goal.title}</span>
      <span className="sr-only">, {state}</span>
    </li>
  );
}

export function PlanWidget({ report, size, onOpen }: WidgetProps) {
  const { plan, planDone, planTotal } = report.goals;
  const perDay = 3;
  return (
    <WidgetCard title="Plan, day by day" icon={CalendarCheck} tint="green" onOpen={onOpen}>
      {planTotal === 0 ? (
        <Empty className="mt-auto">Nothing planned for a goal this week</Empty>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-xl leading-[26px] font-semibold tracking-heading">
              {planDone} of {planTotal} planned done
            </span>
            {size === "L" && (
              <span aria-hidden className="flex flex-wrap gap-3 text-xs text-ink-2">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-3 rounded border border-indigo-200 bg-indigo-50" />
                  Done
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-3 rounded border border-dashed border-ink-3" />
                  Not done
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-3 rounded border border-line" />
                  Still ahead
                </span>
              </span>
            )}
          </div>
          <ol className="mt-3.5 grid min-h-0 flex-1 grid-cols-7 gap-2">
            {plan.map((day) => {
              const done = day.items.filter((i) => i.state === "done").length;
              return (
                <li key={day.date} className="flex min-h-0 min-w-0 flex-col gap-1.5" aria-label={weekdayLong(day.date)}>
                  <span aria-hidden className="text-center text-xs font-semibold">
                    {fmtWeekday(day.date)}
                  </span>
                  <ul className="flex min-h-0 flex-col gap-1.5 overflow-hidden">
                    {day.items.slice(0, perDay).map((item) => (
                      <PlanChip key={item.eventId} item={item} compact={size !== "L"} />
                    ))}
                  </ul>
                  {day.items.length > perDay && <span className="text-center text-[11px] text-ink-3">+{day.items.length - perDay}</span>}
                  {day.items.length > 0 && (
                    <span className={`mt-auto text-center text-[11px] font-semibold tabular ${done === day.items.length ? "text-success" : "text-ink-2"}`}>
                      {done} of {day.items.length}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </WidgetCard>
  );
}

export function SlippedWidget({ report, size, onOpen }: WidgetProps) {
  const { slipped } = report.goals;
  const { timeFormat } = useDisplay();
  const max = size === "S" ? 3 : 6;
  return (
    <WidgetCard title="What slipped" icon={AlertTriangle} tint="amber" onOpen={onOpen}>
      {slipped.length === 0 ? (
        <Empty className="mt-auto">Nothing slipped this week</Empty>
      ) : (
        <>
          <ul className={`mt-auto grid gap-3 pt-3 ${size === "S" ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
            {slipped.slice(0, max).map((s) => {
              const start = new Date(s.startAt);
              return (
                <li key={s.eventId} className="flex min-w-0 gap-2.5">
                  <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${goalColor(s.goal.color).dot}`} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{s.title}</span>
                    <span className="block truncate text-xs text-ink-2">
                      {fmtWeekday(localDateOf(start, report.timeZone))} {fmtTime(localTimeOf(start, report.timeZone), timeFormat)} · {s.minutes} min · {s.goal.title}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          <More count={slipped.length - max} className="mt-1.5" />
        </>
      )}
    </WidgetCard>
  );
}
