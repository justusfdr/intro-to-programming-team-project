// The Distractions tab's widgets (spec 49): blocked visits, clean sessions, blocked visits per week, by
// time of day, and the most blocked sites. Blocked visits are drawn in rose; fewer is the good direction.
import { BarChart3, Check, Clock, Shield } from "lucide-react";
import { HOUR_BLOCKS, type HourBlockId } from "@/lib/analytics/report-types";
import { Bars, Big, countChange, Empty, More, NO_BLOCKED, NO_SESSIONS, plural, SrList, VsLastWeek, weekLabel, WidgetCard, type WidgetProps } from "./parts";

/** Short names of the parts of the day, for a narrow card. */
const SHORT_BLOCK: Record<HourBlockId, string> = { early: "< 9", morning: "9–11", midday: "11–2", afternoon: "2–4", late: "4 pm +" };

export function BlockedVisitsWidget({ report, onOpen }: WidgetProps) {
  const { week, lastWeek, perSession } = report.blocked;
  const comparable = lastWeek > 0 || report.focus.lastWeek.sessions > 0;
  return (
    <WidgetCard title="Blocked visits" icon={Shield} tint="rose" onOpen={onOpen}>
      <Big className="mt-[18px]">{week}</Big>
      <div className="mt-2.5">
        <VsLastWeek change={comparable ? countChange(week, lastWeek, false) : null} running={report.isCurrentWeek} />
      </div>
      <p className="mt-auto pt-3 text-xs text-ink-2">
        {week === 0 && report.focus.week.sessions === 0
          ? NO_BLOCKED
          : `${perSession === null ? "No sessions to count them against." : `${perSession} per session on average.`} A blocked visit takes 5 points off a session's focus score.`}
      </p>
    </WidgetCard>
  );
}

export function CleanSessionsWidget({ report, onOpen }: WidgetProps) {
  const { sessionsClean, cleanSessions } = report.blocked;
  const shown = sessionsClean.slice(0, 28);
  return (
    <WidgetCard title="Clean sessions" icon={Check} tint="green" onOpen={onOpen}>
      {sessionsClean.length === 0 ? (
        <Empty className="mt-auto">{NO_SESSIONS}</Empty>
      ) : (
        <>
          <div className="mt-[18px] flex items-baseline gap-1.5">
            <Big>{cleanSessions}</Big>
            <span className="text-[13px] text-ink-3">of {sessionsClean.length}</span>
          </div>
          <p className="mt-2 text-xs text-ink-2">sessions without a single blocked visit</p>
          <div aria-hidden className="mt-auto grid grid-cols-7 gap-[5px] pt-3">
            {shown.map((clean, i) => (
              <span key={i} className={`flex h-3.5 items-center justify-center rounded ${clean ? "bg-emerald-500 text-white" : "border border-line bg-muted"}`}>
                {clean && <Check className="size-2.5" strokeWidth={3} />}
              </span>
            ))}
          </div>
        </>
      )}
    </WidgetCard>
  );
}

export function BlockedWeeksWidget({ report, size, onOpen }: WidgetProps) {
  const weeks = report.focus.weeks;
  const values = weeks.map((w) => w.attempts);
  const last = values.length - 1;
  const any = values.some((v) => v > 0);
  // Weeks in a row with fewer visits than the week before, ending with the shown week.
  let down = 0;
  for (let i = last; i > 0 && values[i] < values[i - 1]; i--) down++;
  const headline =
    values[last] === Math.min(...values) && values.filter((v) => v === values[last]).length === 1
      ? `Your lowest in ${weeks.length} weeks`
      : values[last] === Math.max(...values) && values.filter((v) => v === values[last]).length === 1
        ? `Your highest in ${weeks.length} weeks`
        : `${Math.round(values.reduce((a, b) => a + b, 0) / Math.max(1, values.length))} a week on average`;
  return (
    <WidgetCard title="Blocked visits per week" icon={BarChart3} tint="rose" onOpen={onOpen}>
      {!any ? (
        <Empty className="mt-auto">No blocked visits in the last 8 weeks</Empty>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-xl leading-[26px] font-semibold tracking-heading">{headline}</span>
            {down >= 2 && <span className="text-xs text-ink-2">Down {down} weeks in a row</span>}
          </div>
          <Bars
            gap={size === "L" ? "gap-4" : "gap-2.5"}
            bars={weeks.map((w, i) => ({ key: w.monday, label: weekLabel(w.monday), value: w.attempts, text: String(w.attempts), strong: i === last }))}
          />
          <SrList label="Blocked visits per week" items={weeks.map((w) => `Week ${weekLabel(w.monday).slice(1)}: ${w.attempts}`)} />
        </>
      )}
    </WidgetCard>
  );
}

export function BlockedHoursWidget({ report, size, onOpen }: WidgetProps) {
  const { hours, worstBlock, week } = report.blocked;
  const worst = HOUR_BLOCKS.find((b) => b.id === worstBlock) ?? null;
  const worstCount = hours.find((h) => h.block === worstBlock)?.count ?? 0;
  return (
    <WidgetCard title="When you get distracted" icon={Clock} tint="rose" onOpen={onOpen}>
      {!worst || week === 0 ? (
        <Empty className="mt-auto">{NO_BLOCKED}</Empty>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-xl leading-[26px] font-semibold tracking-heading">Mostly {worst.label.charAt(0).toLowerCase() + worst.label.slice(1)}</span>
            <span className="text-xs text-ink-2">
              {worstCount} of {plural(week, "blocked visit")}
            </span>
          </div>
          <Bars
            strong="bg-rose-500"
            soft="bg-rose-200"
            gap={size === "S" ? "gap-1.5" : "gap-4"}
            maxBar="max-w-[72px]"
            bars={HOUR_BLOCKS.map((b) => {
              const count = hours.find((h) => h.block === b.id)?.count ?? 0;
              return { key: b.id, label: size === "S" ? SHORT_BLOCK[b.id] : b.label, value: count, text: String(count), strong: b.id === worstBlock };
            })}
          />
          <SrList label="Blocked visits by time of day" items={HOUR_BLOCKS.map((b) => `${b.label}: ${hours.find((h) => h.block === b.id)?.count ?? 0}`)} />
        </>
      )}
    </WidgetCard>
  );
}

export function TopSitesWidget({ report, size, onOpen }: WidgetProps) {
  const { topSites } = report.blocked;
  const max = size === "S" ? 4 : 5;
  const top = Math.max(1, ...topSites.map((s) => s.count));
  return (
    <WidgetCard title="Most blocked sites" icon={Shield} tint="rose" onOpen={onOpen}>
      {topSites.length === 0 ? (
        <Empty className="mt-auto">{NO_BLOCKED}</Empty>
      ) : (
        <>
          <ol className="mt-auto flex flex-col gap-3 pt-3">
            {topSites.slice(0, max).map((site) => (
              <li key={site.domain}>
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="min-w-0 truncate">{site.domain}</span>
                  <span className="shrink-0 tabular text-ink-2">
                    {site.count}
                    <span className="sr-only"> {site.count === 1 ? "visit" : "visits"}</span>
                  </span>
                </div>
                <div aria-hidden className="mt-[5px] h-1.5 rounded-full bg-raised">
                  <div className="h-full rounded-full bg-rose-500" style={{ width: `${(site.count / top) * 100}%` }} />
                </div>
              </li>
            ))}
          </ol>
          <More count={topSites.length - max} className="mt-1.5" />
        </>
      )}
    </WidgetCard>
  );
}
