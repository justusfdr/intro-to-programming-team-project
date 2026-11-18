// The Time tab's widgets (spec 49): done time day by day and per goal, plan kept, the busiest day and
// the share that went to a goal. "Time" is the minutes of timed calendar events marked done.
import { BarChart3, List, ListChecks, Sun, Target } from "lucide-react";
import { GoalTile } from "@/components/goals/GoalTile";
import type { AnalyticsReport, GoalRef } from "@/lib/analytics/report-types";
import { goalColor } from "@/lib/goals/colors";
import { fmtWeekday } from "@/lib/time/display";
import { Big, duration, Empty, More, NOTHING_DONE, plural, pointsChange, Progress, SrList, topIndex, VsLastWeek, weekdayLong, WidgetCard, type WidgetProps } from "./parts";

/** Every goal the report knows, by id, for the parts of a day. */
function goalsById(report: AnalyticsReport): Map<string, GoalRef> {
  const map = new Map<string, GoalRef>();
  for (const row of report.goals.list) map.set(row.goal.id, row.goal);
  for (const area of report.time.areas) if (area.goal) map.set(area.goal.id, area.goal);
  return map;
}

/** The colour class of a goal's part of a bar; grey for "No goal". */
function partColor(goal: GoalRef | null | undefined): string {
  return goal ? goalColor(goal.color).dot : "bg-ink/20";
}

const nameOf = (goal: GoalRef | null | undefined) => goal?.title ?? "No goal";

export function TimeByDayWidget({ report, size, onOpen }: WidgetProps) {
  const { days, areas, doneMinutes } = report.time;
  const goals = goalsById(report);
  const best = topIndex(days.map((d) => d.minutes));
  const max = Math.max(1, ...days.map((d) => d.minutes));
  const top = areas[0];
  const headline = top && doneMinutes > 0 ? `${nameOf(top.goal)} took ${Math.round((top.minutes / doneMinutes) * 100)} % of your time` : "";
  return (
    <WidgetCard title="Your time, day by day" icon={BarChart3} tint="indigo" onOpen={onOpen}>
      {doneMinutes === 0 ? (
        <Empty className="mt-auto">{NOTHING_DONE}</Empty>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="min-w-0 truncate text-xl leading-[26px] font-semibold tracking-heading">{headline}</span>
            <span aria-hidden className="flex flex-wrap gap-x-3.5 gap-y-1">
              {areas.slice(0, size === "L" ? 5 : 3).map((a) => (
                <span key={a.goal?.id ?? "none"} className="inline-flex items-center gap-1.5 text-xs text-ink-2">
                  <span className={`size-2.5 rounded-[3px] ${partColor(a.goal)}`} />
                  {nameOf(a.goal)}
                </span>
              ))}
            </span>
          </div>
          <div aria-hidden className={`flex min-h-16 flex-1 pt-2.5 ${size === "L" ? "gap-4" : "gap-2.5"}`}>
            {days.map((d, i) => (
              <div key={d.date} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <span className={`text-xs tabular ${i === best ? "font-semibold text-ink" : "text-ink-3"}`}>{d.minutes > 0 ? duration(d.minutes) : "–"}</span>
                <div className="flex min-h-0 w-full flex-1 items-end justify-center">
                  {d.minutes > 0 ? (
                    <div className="flex w-full max-w-[84px] flex-col-reverse gap-[3px]" style={{ height: `${Math.max(3, (d.minutes / max) * 100)}%` }}>
                      {d.parts.map((p) => (
                        <span key={p.goalId ?? "none"} className={`min-h-[3px] rounded-[5px] ${partColor(p.goalId === null ? null : goals.get(p.goalId))}`} style={{ flex: `${p.minutes} 1 0` }} />
                      ))}
                    </div>
                  ) : (
                    <span className="h-[3px] w-full max-w-[84px] rounded-[5px] bg-muted" />
                  )}
                </div>
                <span className={`text-xs ${i === best ? "font-semibold text-ink" : "text-ink-3"}`}>{fmtWeekday(d.date)}</span>
              </div>
            ))}
          </div>
          <SrList
            label="Done time per day"
            items={days.map(
              (d) =>
                `${weekdayLong(d.date)}: ${d.minutes > 0 ? duration(d.minutes) : "none"}${
                  d.parts.length ? ` (${d.parts.map((p) => `${nameOf(p.goalId === null ? null : goals.get(p.goalId))} ${duration(p.minutes)}`).join(", ")})` : ""
                }`,
            )}
          />
        </>
      )}
    </WidgetCard>
  );
}

/** "50 min more", "10 min less", "Same as last week", "New this week"; null without a last week. */
function areaDelta(minutes: number, lastWeekMinutes: number, lastWeekDone: number): string | null {
  if (lastWeekDone === 0) return null;
  if (lastWeekMinutes === 0) return "New this week";
  const diff = minutes - lastWeekMinutes;
  if (diff === 0) return "Same as last week";
  return `${duration(Math.abs(diff))} ${diff > 0 ? "more" : "less"}`;
}

export function TopAreasWidget({ report, size, onOpen }: WidgetProps) {
  const { areas, lastWeekDoneMinutes, doneMinutes } = report.time;
  const shown = areas.filter((a) => a.minutes > 0);
  const max = size === "S" ? 4 : 5;
  return (
    <WidgetCard title="Your top areas" icon={List} tint="green" onOpen={onOpen}>
      {doneMinutes === 0 || shown.length === 0 ? (
        <Empty className="mt-auto">{NOTHING_DONE}</Empty>
      ) : (
        <>
          <ol className="mt-3.5 flex min-h-0 flex-1 flex-col gap-2">
            {shown.slice(0, max).map((a, i) => {
              const delta = areaDelta(a.minutes, a.lastWeekMinutes, lastWeekDoneMinutes);
              const look = a.goal ? goalColor(a.goal.color).block : "border-line-subtle bg-raised text-ink";
              return (
                <li key={a.goal?.id ?? "none"} className={`flex min-h-0 min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-xl border px-2.5 py-1 ${look}`}>
                  <span className="w-2.5 shrink-0 text-xs font-semibold tabular">{i + 1}</span>
                  <GoalTile look={a.goal ? { color: a.goal.color, icon: a.goal.icon } : null} size="xs" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{nameOf(a.goal)}</span>
                    {delta && <span className="block truncate text-[11px] opacity-80">{delta}</span>}
                  </span>
                  <span className="shrink-0 text-[13px] font-semibold tabular whitespace-nowrap">{duration(a.minutes)}</span>
                </li>
              );
            })}
          </ol>
          <More count={shown.length - max} className="mt-1.5" />
        </>
      )}
    </WidgetCard>
  );
}

export function PlanKeptWidget({ report, size, onOpen }: WidgetProps) {
  const { planKept, planKeptLastWeek, doneMinutes, endedMinutes } = report.time;
  const change = pointsChange(planKept, planKeptLastWeek);
  return (
    <WidgetCard title="Plan kept" icon={ListChecks} tint="teal" onOpen={onOpen}>
      <div className="mt-[18px] flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <Big>{planKept === null ? "–" : `${planKept} %`}</Big>
        {size !== "S" && planKept !== null && <span className="text-[15px] text-ink-2">of your planned time done</span>}
      </div>
      <div className="mt-2.5">
        <VsLastWeek change={change} running={report.isCurrentWeek} />
      </div>
      {planKept === null ? (
        <Empty className="mt-auto">No planned time has ended this week yet</Empty>
      ) : (
        <>
          <Progress share={planKept / 100} fill="bg-teal-500" className="mt-auto h-2" />
          <p className="mt-2 text-xs text-ink-2">
            {duration(doneMinutes)} done of {duration(endedMinutes)} planned
          </p>
        </>
      )}
    </WidgetCard>
  );
}

export function BusiestDayWidget({ report, onOpen }: WidgetProps) {
  const { busiest, quietest } = report.time;
  return (
    <WidgetCard title="Busiest day" icon={Sun} tint="amber" onOpen={onOpen}>
      {busiest ? (
        <>
          <span className="mt-[18px] truncate text-[30px] leading-none font-semibold tracking-display">{weekdayLong(busiest.date)}</span>
          <p className="mt-2 text-xs text-ink-2">
            {duration(busiest.minutes)} in {plural(busiest.events, "event")}
          </p>
          {quietest && quietest.date !== busiest.date && (
            <p className="mt-auto text-xs text-ink-2">
              {weekdayLong(quietest.date)} was the quietest, {quietest.minutes > 0 ? `with ${duration(quietest.minutes)}` : "with nothing done"}.
            </p>
          )}
        </>
      ) : (
        <>
          <Big className="mt-[18px]">–</Big>
          <Empty className="mt-auto">{NOTHING_DONE}</Empty>
        </>
      )}
    </WidgetCard>
  );
}

export function TimeOnGoalsWidget({ report, onOpen }: WidgetProps) {
  const { goalMinutes, doneMinutes, areas } = report.time;
  const parts = areas.filter((a) => a.minutes > 0);
  const share = doneMinutes > 0 ? Math.round((goalMinutes / doneMinutes) * 100) : 0;
  return (
    <WidgetCard title="Time on your goals" icon={Target} tint="indigo" onOpen={onOpen}>
      <span className="tabular mt-[18px] text-[30px] leading-none font-semibold tracking-display">{duration(goalMinutes)}</span>
      {doneMinutes > 0 ? (
        <>
          <p className="mt-2 text-xs text-ink-2">of {duration(doneMinutes)} done</p>
          <div aria-hidden className="mt-auto flex h-2.5 gap-[3px]">
            {parts.map((a) => (
              <span key={a.goal?.id ?? "none"} className={`rounded ${a.goal ? goalColor(a.goal.color).dot : "bg-ink/15"}`} style={{ flex: `${a.minutes} 1 0` }} />
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-2">
            {share} % went to a goal{doneMinutes > goalMinutes ? `, ${duration(doneMinutes - goalMinutes)} had none` : ""}.
          </p>
        </>
      ) : (
        <Empty className="mt-auto">{NOTHING_DONE}</Empty>
      )}
    </WidgetCard>
  );
}
