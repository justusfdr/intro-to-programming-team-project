// The Streaks tab's widgets (spec 49): the streak with its record, the last 12 weeks as a square a day,
// and focus by weekday. Streak and heatmap use the app's orange scale.
import { BarChart3, Flame, Grid3x3 } from "lucide-react";
import { fmtDayMonth } from "@/lib/time/display";
import { Bars, Big, duration, NoDataYet, Progress, SrList, topIndex, WEEKDAYS_LONG, WEEKDAYS_SHORT, WidgetCard, type WidgetProps } from "./parts";

const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

/** "5 more days to reach your record", "This is your record", or nothing. */
function recordText(current: number, record: number): string | null {
  if (record === 0) return null;
  if (current >= record) return "This is your record";
  const left = record - current;
  return `${left} more ${left === 1 ? "day" : "days"} to reach your record`;
}

export function StreakWidget({ report, size, onOpen }: WidgetProps) {
  const { current, record } = report.streaks;
  const toRecord = recordText(current, record);
  const share = record > 0 ? current / record : 0;

  if (size === "S") {
    return (
      <WidgetCard title="Streak" icon={Flame} tint="flame" tone="orange" onOpen={onOpen}>
        <Big className="mt-[18px]">{days(current)}</Big>
        <p className="mt-2 text-xs text-orange-800">{current > 0 ? "in a row with a session or a goal done" : "Finish a focus session to start one"}</p>
        {record > 0 && (
          <>
            <Progress share={share} track="bg-orange-200" fill="bg-orange-500" className="mt-auto" />
            <p className="mt-2 text-xs text-orange-800">
              {toRecord === "This is your record" ? `Your record: ${days(record)}` : `${toRecord} of ${days(record)}`}
            </p>
          </>
        )}
      </WidgetCard>
    );
  }

  return (
    <WidgetCard title="Your streak" icon={Flame} tint="flame" tone="orange" onOpen={onOpen} className="px-6 py-[22px]">
      <div className="mt-3.5 flex items-center gap-[18px]">
        <span aria-hidden className="flex size-16 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white">
          <Flame className="size-[30px]" />
        </span>
        <span className="min-w-0">
          <span className="tabular block text-[40px] leading-none font-semibold tracking-display lg:text-[44px]">{days(current)} in a row</span>
          <span className="mt-2 block text-[13px] text-orange-800">
            {current > 0 ? "A focus session or a goal done on every one of them." : "Finish a focus session or mark a goal event done to start one."}
          </span>
        </span>
      </div>
      {record > 0 && (
        <div className="mt-auto pt-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs font-semibold">
            <span>{toRecord}</span>
            <span className="text-orange-800">Record: {days(record)}</span>
          </div>
          <Progress share={share} track="bg-orange-200" fill="bg-orange-500" className="mt-2 h-2" />
        </div>
      )}
    </WidgetCard>
  );
}

const LEVEL_COLORS = ["bg-muted", "bg-orange-200", "bg-orange-400", "bg-orange-700"] as const;

export function HeatmapWidget({ report, onOpen }: WidgetProps) {
  const { heat } = report.focus;
  const active = heat.filter((d) => d.minutes > 0).length;
  const weeks: (typeof heat)[] = [];
  for (let i = 0; i < heat.length; i += 7) weeks.push(heat.slice(i, i + 7));
  return (
    <WidgetCard title="Last 12 weeks" icon={Grid3x3} tint="orange" onOpen={onOpen}>
      {active === 0 ? (
        <NoDataYet>No focus time in the last 12 weeks</NoDataYet>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-xl leading-[26px] font-semibold tracking-heading">
              {active} of {heat.length} days with focus time
            </span>
            <span aria-hidden className="inline-flex items-center gap-[5px] text-xs text-ink-2">
              Less
              {LEVEL_COLORS.map((c) => (
                <span key={c} className={`size-3 rounded ${c}`} />
              ))}
              More
            </span>
          </div>
          <div aria-hidden className="mt-3 flex min-h-0 flex-1 gap-2.5">
            <div className="grid grid-rows-7 items-center gap-1 text-[11px] text-ink-3">
              {["M", "", "W", "", "F", "", "S"].map((l, i) => (
                <span key={i}>{l}</span>
              ))}
            </div>
            <div className="grid flex-1 grid-flow-col grid-rows-7 gap-1 [grid-auto-columns:minmax(0,1fr)]">
              {heat.map((d) => (
                <span key={d.date} className={`min-h-0 rounded ${LEVEL_COLORS[d.level]}`} />
              ))}
            </div>
          </div>
          {heat.length > 0 && (
            <div aria-hidden className="mt-1.5 flex justify-between pl-5 text-[11px] text-ink-3">
              <span>{fmtDayMonth(heat[0].date)}</span>
              <span>{fmtDayMonth(heat[heat.length - 1].date)}</span>
            </div>
          )}
          <SrList
            label="Focus time per week"
            items={weeks.map((w) => {
              const minutes = w.reduce((sum, d) => sum + d.minutes, 0);
              const on = w.filter((d) => d.minutes > 0).length;
              return `Week of ${fmtDayMonth(w[0].date)}: ${duration(minutes)} on ${days(on)}`;
            })}
          />
        </>
      )}
    </WidgetCard>
  );
}

export function WeekdaysWidget({ report, size, onOpen }: WidgetProps) {
  const { weekdays, weekdaySessions } = report.focus;
  const best = topIndex(weekdays);
  return (
    <WidgetCard title="Focus by weekday" icon={BarChart3} tint="orange" onOpen={onOpen}>
      {weekdaySessions === 0 || best < 0 ? (
        <NoDataYet>No focus sessions in the last 4 weeks</NoDataYet>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-xl leading-[26px] font-semibold tracking-heading">
              {size === "S" ? WEEKDAYS_LONG[best] : `${WEEKDAYS_LONG[best]} is your strongest day`}
            </span>
            <span className="text-xs text-ink-2">{weekdaySessions} sessions in 4 weeks</span>
          </div>
          <Bars
            strong="bg-orange-500"
            soft="bg-orange-200"
            gap={size === "S" ? "gap-1.5" : "gap-3.5"}
            bars={weekdays.map((n, i) => ({ key: String(i), label: size === "S" ? WEEKDAYS_SHORT[i].charAt(0) : WEEKDAYS_SHORT[i], value: n, text: String(n), strong: i === best }))}
          />
          <SrList label="Sessions per weekday" items={weekdays.map((n, i) => `${WEEKDAYS_LONG[i]}: ${n}`)} />
        </>
      )}
    </WidgetCard>
  );
}
