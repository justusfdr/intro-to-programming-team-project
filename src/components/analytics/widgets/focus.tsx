// The Focus tab's widgets (spec 49): focus time, focus score, sessions, the last 8 weeks, the best hours
// and the best of the week. Every number comes from report.focus.
import { Award, BarChart3, Clock, Sun, Timer, TrendingDown, TrendingUp, Zap } from "lucide-react";
import { scoreText } from "@/lib/analytics/score";
import { HOUR_BLOCKS } from "@/lib/analytics/report-types";
import { fmtWeekday } from "@/lib/time/display";
import {
  Bars,
  Big,
  CardLabel,
  duration,
  Empty,
  NO_SESSIONS,
  percentChange,
  plural,
  pointsChange,
  Progress,
  countChange,
  SrList,
  topIndex,
  VsLastWeek,
  weekdayLong,
  weekLabel,
  WidgetCard,
  type WidgetProps,
} from "./parts";

/** "1h 50m more than last week"; null without a last week to compare with. */
function heroChange(now: number, before: number, lastSessions: number): { text: string; up: boolean | null } | null {
  if (lastSessions === 0) return null;
  const diff = now - before;
  if (diff === 0) return { text: "Same as last week", up: null };
  return { text: `${duration(Math.abs(diff))} ${diff > 0 ? "more" : "less"} than last week`, up: diff > 0 };
}

export function FocusTimeWidget({ report, size, onOpen, hero }: WidgetProps) {
  const { week, lastWeek, days } = report.focus;
  const best = topIndex(days.map((d) => d.focusedMinutes));
  const average = week.sessions > 0 ? Math.round(week.focusedMinutes / week.sessions) : 0;
  const srDays = (
    <SrList
      label="Focus time per day"
      items={days.map((d) => `${weekdayLong(d.date)}: ${d.focusedMinutes > 0 ? duration(d.focusedMinutes) : "none"}`)}
    />
  );

  if (hero) {
    const change = heroChange(week.focusedMinutes, lastWeek.focusedMinutes, lastWeek.sessions);
    const max = Math.max(1, ...days.map((d) => d.focusedMinutes));
    return (
      <WidgetCard title="Focus time" icon={Clock} tint="grey" tone="dark" onOpen={onOpen} bare row className="gap-5 px-6 py-[22px]">
        <div className="flex min-w-0 flex-1 flex-col">
          <CardLabel title="Focus time" label="You were locked in for" onOpen={onOpen} className="text-white/70" />
          <span className="tabular mt-3.5 text-[52px] leading-none font-semibold tracking-display">{duration(week.focusedMinutes)}</span>
          <span className="mt-2.5 text-xs text-white/70">
            {week.sessions > 0 ? `${plural(week.sessions, "session")} · ${average} min on average` : NO_SESSIONS}
          </span>
          {change && (
            <span className="mt-auto inline-flex h-[26px] items-center gap-1 self-start rounded-full bg-white px-2.5 text-xs font-semibold text-ink">
              {change.up === true && <TrendingUp aria-hidden className="size-3" strokeWidth={2.4} />}
              {change.up === false && <TrendingDown aria-hidden className="size-3" strokeWidth={2.4} />}
              {change.text}
            </span>
          )}
        </div>
        {week.focusedMinutes > 0 && (
          <div aria-hidden className={`hidden shrink-0 gap-2 sm:grid sm:grid-cols-7 ${size === "L" ? "w-[300px]" : "w-[210px]"}`}>
            {days.map((d, i) => (
              <div key={d.date} className="flex min-h-0 flex-col items-center gap-2">
                <div className="flex min-h-0 w-full flex-1 items-end">
                  <span
                    className={`w-full rounded-md ${i === best ? "bg-white" : "bg-white/35"}`}
                    style={{ height: d.focusedMinutes > 0 ? `${Math.max(4, (d.focusedMinutes / max) * 100)}%` : "4px" }}
                  />
                </div>
                <span className={`text-[11px] ${i === best ? "font-semibold text-white" : "text-white/70"}`}>{fmtWeekday(d.date).charAt(0)}</span>
              </div>
            ))}
          </div>
        )}
        {srDays}
      </WidgetCard>
    );
  }

  return (
    <WidgetCard title="Focus time" icon={Clock} tint="grey" onOpen={onOpen}>
      <div className="mt-3.5 flex flex-wrap items-center gap-3">
        <Big>{duration(week.focusedMinutes)}</Big>
        <VsLastWeek change={lastWeek.sessions > 0 ? percentChange(week.focusedMinutes, lastWeek.focusedMinutes) : null} />
      </div>
      {week.focusedMinutes > 0 ? (
        <>
          <p className="mt-1.5 text-xs text-ink-2">
            {plural(week.sessions, "session")} · {average} min on average
          </p>
          <Bars
            gap={size === "L" ? "gap-4" : "gap-3"}
            bars={days.map((d, i) => ({
              key: d.date,
              label: fmtWeekday(d.date),
              value: d.focusedMinutes,
              text: d.focusedMinutes > 0 ? duration(d.focusedMinutes) : "–",
              strong: i === best,
            }))}
          />
          {srDays}
        </>
      ) : (
        <Empty className="mt-auto">{NO_SESSIONS}</Empty>
      )}
    </WidgetCard>
  );
}

export function FocusScoreWidget({ report, onOpen }: WidgetProps) {
  const { week, lastWeek } = report.focus;
  const blocked = report.blocked;
  const blockedLine =
    blocked.lastWeek > 0 || lastWeek.sessions > 0
      ? `${plural(week.attempts, "blocked visit")}, ${
          week.attempts === lastWeek.attempts ? "as many as last week" : `${Math.abs(week.attempts - lastWeek.attempts)} ${week.attempts < lastWeek.attempts ? "fewer" : "more"} than last week`
        }`
      : plural(week.attempts, "blocked visit");
  return (
    <WidgetCard title="Focus score" icon={Zap} tint="violet" onOpen={onOpen}>
      <div className="mt-[18px] flex items-baseline gap-1.5">
        <Big>{scoreText(week.score)}</Big>
        <span className="text-[13px] text-ink-3">of 100</span>
      </div>
      <div className="mt-2.5">
        <VsLastWeek change={pointsChange(week.score, lastWeek.score)} />
      </div>
      <Progress share={(week.score ?? 0) / 100} fill="bg-violet-600" className="mt-auto" />
      <p className="mt-2 text-xs text-ink-2">{week.sessions > 0 ? blockedLine : NO_SESSIONS}</p>
    </WidgetCard>
  );
}

export function SessionsWidget({ report, onOpen }: WidgetProps) {
  const { week, lastWeek, finishedAsPlanned, activeDays } = report.focus;
  const rows: [string, string][] = [
    ["Average length", `${week.sessions > 0 ? Math.round(week.focusedMinutes / week.sessions) : 0} min`],
    ["Finished as planned", `${finishedAsPlanned} of ${week.sessions}`],
    ["Days with a session", `${activeDays} of 7`],
  ];
  return (
    <WidgetCard title="Focus sessions" icon={Timer} tint="sky" onOpen={onOpen}>
      <Big className="mt-[18px]">{week.sessions}</Big>
      <div className="mt-2.5">
        <VsLastWeek change={lastWeek.sessions > 0 ? countChange(week.sessions, lastWeek.sessions, true) : null} />
      </div>
      {week.sessions > 0 ? (
        <dl className="mt-auto flex flex-col gap-1.5 pt-3 text-[13px]">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-3">
              <dt className="truncate text-ink-2">{label}</dt>
              <dd className="tabular font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <Empty className="mt-auto">{NO_SESSIONS}</Empty>
      )}
    </WidgetCard>
  );
}

export function WeeksWidget({ report, size, onOpen }: WidgetProps) {
  const { weeks, averageMinutes } = report.focus;
  const values = weeks.map((w) => w.focusedMinutes);
  const shown = weeks.length - 1;
  const current = values[shown] ?? 0;
  const any = values.some((v) => v > 0);
  const headline = !any
    ? null
    : current > 0 && current >= Math.max(...values)
      ? `Your best week of the last ${weeks.length}`
      : current >= averageMinutes
        ? "Above your average"
        : "Below your average";
  return (
    <WidgetCard title="Compared to other weeks" icon={BarChart3} tint="grey" onOpen={onOpen}>
      {headline ? (
        <>
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-xl leading-[26px] font-semibold tracking-heading">{headline}</span>
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
              <span aria-hidden className="w-4 border-t-2 border-dashed border-ink-3" />
              Average {duration(averageMinutes)}
            </span>
          </div>
          <Bars
            gap={size === "L" ? "gap-4" : "gap-2.5"}
            line={averageMinutes}
            bars={weeks.map((w, i) => ({ key: w.monday, label: weekLabel(w.monday), value: w.focusedMinutes, text: w.focusedMinutes > 0 ? duration(w.focusedMinutes) : "–", strong: i === shown }))}
          />
          <SrList label="Focus time per week" items={weeks.map((w) => `Week ${weekLabel(w.monday).slice(1)}: ${duration(w.focusedMinutes)}`)} />
        </>
      ) : (
        <Empty className="mt-auto">No focus sessions in the last 8 weeks</Empty>
      )}
    </WidgetCard>
  );
}

export function BestHoursWidget({ report, size, onOpen }: WidgetProps) {
  const { hours, bestBlock } = report.focus;
  const best = HOUR_BLOCKS.find((b) => b.id === bestBlock) ?? null;
  const bestScore = hours.find((h) => h.block === bestBlock)?.score ?? null;
  const anySessions = hours.some((h) => h.sessions > 0);
  return (
    <WidgetCard title="Your best hours" icon={Sun} tint="amber" onOpen={onOpen}>
      {best ? (
        <>
          <span className="mt-4 text-[30px] leading-none font-semibold tracking-display">{best.label}</span>
          <p className="mt-2 text-xs text-ink-2">Score {scoreText(bestScore)} on average</p>
        </>
      ) : (
        <Empty className="mt-4">{anySessions ? "Not enough sessions yet: a part of the day needs 2" : "No focus sessions in the last 8 weeks"}</Empty>
      )}
      {anySessions && (
        <ul className="mt-auto flex flex-col gap-2 pt-3">
          {HOUR_BLOCKS.map((block) => {
            const row = hours.find((h) => h.block === block.id);
            const on = block.id === bestBlock;
            return (
              <li key={block.id} className={`flex items-center gap-2 text-xs ${on ? "font-semibold text-ink" : "text-ink-3"}`}>
                <span className="w-[78px] shrink-0 truncate">{block.label}</span>
                <span aria-hidden className="h-2 flex-1 rounded-full bg-muted">
                  <span className={`block h-2 rounded-full ${on ? "bg-amber-500" : "bg-ink/20"}`} style={{ width: `${row?.score ?? 0}%` }} />
                </span>
                <span className="w-6 shrink-0 text-right tabular">
                  <span className="sr-only">score </span>
                  {scoreText(row?.score ?? null)}
                </span>
                {size !== "S" && <span className="w-[74px] shrink-0 text-right tabular">{plural(row?.sessions ?? 0, "session")}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </WidgetCard>
  );
}

export function BestOfWeekWidget({ report, onOpen }: WidgetProps) {
  const { longest, bestScore, bestDay } = report.focus;
  const rows: { label: string; value: string; note: string }[] = [
    { label: "Longest session", value: longest ? `${longest.minutes} min` : "–", note: longest ? [fmtWeekday(longest.date), longest.goal].filter(Boolean).join(" · ") : "" },
    { label: "Best focus score", value: bestScore ? String(bestScore.score) : "–", note: bestScore ? weekdayLong(bestScore.date) : "" },
    { label: "Best day", value: bestDay ? duration(bestDay.minutes) : "–", note: bestDay ? weekdayLong(bestDay.date) : "" },
  ];
  return (
    <WidgetCard title="Best of this week" icon={Award} tint="violet" onOpen={onOpen}>
      {!longest && <Empty className="mt-3">{NO_SESSIONS}</Empty>}
      <ul className="mt-auto flex flex-col gap-3.5 pt-3">
        {rows.map((row) => (
          <li key={row.label}>
            <div className="text-xs text-ink-2">{row.label}</div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="tabular text-xl leading-[26px] font-semibold tracking-heading">{row.value}</span>
              <span className="truncate text-xs text-ink-2">{row.note}</span>
            </div>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}
