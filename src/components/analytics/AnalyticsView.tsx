// The Analytics page (spec 06): this week's numbers, today's when the week is the current one, a bar
// per day with a table of the same numbers, and the most blocked sites. Every number is calculated
// from finished sessions and blocked attempts (R19, R20); the charts are drawn with plain markup and
// hidden from screen readers, because the table and the list next to them say the same. Spec 29: a
// section "Shared with you" for the focus charts contacts share with the user (SharedFocus.tsx).
import { LinkButton } from "@/components/ui/Button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { scoreText, type Totals } from "@/lib/analytics/score";
import type { AnalyticsData } from "@/lib/analytics/types";
import { minutesText } from "@/lib/focus/session-time";
import { fmtDateShort, fmtWeekRange, fmtWeekday } from "@/lib/time/display";
import { isoWeekNumber } from "@/lib/time/zoned";
import type { SharingPerson } from "@/lib/shares/types";
import { SharedFocus } from "./SharedFocus";

const card = "rounded-card border border-line-subtle bg-surface p-5";
const eyebrow = "text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3";

function Tile({ label, value, today }: { label: string; value: string; today: string | null }) {
  return (
    <div className="min-w-0 rounded-card border border-line-subtle bg-surface p-4 md:p-5">
      <p className="text-xs text-ink-2">{label}</p>
      <p className="mt-2.5 text-[26px] leading-none font-semibold tracking-heading tabular text-ink">{value}</p>
      {today !== null && <p className="mt-2.5 text-xs text-ink-3">Today: {today}</p>}
    </div>
  );
}

export function AnalyticsView({ data, sharing = [], person }: { data: AnalyticsData; sharing?: SharingPerson[]; person?: string }) {
  const { analytics } = data;
  const todayTotals: Totals | null = data.today ? (analytics.days.find((d) => d.date === data.today) ?? null) : null;
  const maxMinutes = Math.max(1, ...analytics.days.map((d) => d.focusedMinutes));
  const maxSite = Math.max(1, ...analytics.topSites.map((s) => s.count));

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-6 md:px-8 md:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-[34px] font-semibold tracking-display text-ink md:text-[32px] md:leading-[38px]">Analytics</h1>
          <p className="mt-1 text-sm text-ink-2">
            Week {isoWeekNumber(data.monday)} · {fmtWeekRange(data.monday)}
          </p>
        </div>
        <nav aria-label="Weeks" className="flex items-center gap-1.5">
          <LinkButton href={`/analytics?week=${data.previous}`} variant="secondary" size="icon" aria-label="Previous week" title="Previous week">
            <ChevronLeft className="size-4" />
          </LinkButton>
          <LinkButton href={`/analytics?week=${data.next}`} variant="secondary" size="icon" aria-label="Next week" title="Next week">
            <ChevronRight className="size-4" />
          </LinkButton>
          <LinkButton href={`/analytics?week=${data.thisWeek}`} variant="secondary" aria-current={data.monday === data.thisWeek ? "page" : undefined}>
            This week
          </LinkButton>
        </nav>
      </header>

      <section aria-label="This week" className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <Tile label="Focus time" value={minutesText(analytics.week.focusedMinutes)} today={todayTotals && minutesText(todayTotals.focusedMinutes)} />
        <Tile label="Focus score" value={scoreText(analytics.week.score)} today={todayTotals && scoreText(todayTotals.score)} />
        <Tile label="Sessions" value={String(analytics.week.sessions)} today={todayTotals && String(todayTotals.sessions)} />
        <Tile label="Blocked visits" value={String(analytics.week.attempts)} today={todayTotals && String(todayTotals.attempts)} />
      </section>

      <div className="mt-6 grid items-start gap-4 lg:grid-cols-3">
        <section aria-labelledby="per-day-title" className={`${card} min-w-0 lg:col-span-2`}>
          <h2 id="per-day-title" className={eyebrow}>
            Focus time per day
          </h2>
          {/* The bars show the table below; screen readers read the table. */}
          <div aria-hidden className="mt-4 grid h-40 grid-cols-7 items-end gap-2">
            {analytics.days.map((day) => {
              const height = day.focusedMinutes === 0 ? 0 : Math.max(4, Math.round((day.focusedMinutes / maxMinutes) * 120));
              return (
                <div key={day.date} className="flex h-full flex-col items-center justify-end gap-1">
                  <span className="text-[10px] tabular text-ink-3">{day.focusedMinutes > 0 ? minutesText(day.focusedMinutes) : ""}</span>
                  <span className={`w-full max-w-9 rounded-t-[5px] ${day.date === data.today ? "bg-ink" : "bg-ink/20"}`} style={{ height }} />
                  <span className={`text-[11px] ${day.date === data.today ? "font-semibold text-ink" : "text-ink-3"}`}>{fmtWeekday(day.date)}</span>
                </div>
              );
            })}
          </div>

          <table className="mt-5 w-full text-left text-sm">
            <caption className="sr-only">Focus time, sessions, focus score and blocked visits per day</caption>
            <thead>
              <tr className="border-b border-line-subtle text-xs text-ink-3">
                <th scope="col" className="py-2 font-medium">Day</th>
                <th scope="col" className="py-2 text-right font-medium">Focus time</th>
                <th scope="col" className="py-2 text-right font-medium">Sessions</th>
                <th scope="col" className="py-2 text-right font-medium">Score</th>
                <th scope="col" className="py-2 text-right font-medium">Blocked</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {analytics.days.map((day) => (
                <tr key={day.date} className={`border-b border-line-subtle last:border-0 ${day.date === data.today ? "font-semibold" : ""}`}>
                  <th scope="row" className="py-2 font-normal">
                    {fmtDateShort(day.date)}
                    {day.date === data.today && <span className="ml-1 text-xs text-ink-3">(today)</span>}
                  </th>
                  <td className="py-2 text-right">{minutesText(day.focusedMinutes)}</td>
                  <td className="py-2 text-right">{day.sessions}</td>
                  <td className="py-2 text-right">{scoreText(day.score)}</td>
                  <td className="py-2 text-right">{day.attempts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section aria-labelledby="sites-title" className={`${card} min-w-0`}>
          <h2 id="sites-title" className={eyebrow}>
            Most blocked sites
          </h2>
          {analytics.topSites.length === 0 ? (
            <p className="mt-4 text-sm text-ink-2">No blocked visits this week.</p>
          ) : (
            <ol className="mt-4 flex flex-col gap-3">
              {analytics.topSites.map((site) => (
                <li key={site.domain}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-ink">{site.domain}</span>
                    <span className="tabular text-ink-2">
                      {site.count} {site.count === 1 ? "visit" : "visits"}
                    </span>
                  </div>
                  <div aria-hidden className="mt-1 h-1.5 rounded-full bg-raised">
                    <div className="h-full rounded-full bg-ink/70" style={{ width: `${(site.count / maxSite) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* Spec 29: only when a contact shares their focus chart with the user. */}
      {sharing.length > 0 && <SharedFocus people={sharing} initial={person} />}

      <section aria-labelledby="how-title" className="mt-8 text-sm text-ink-2">
        <h2 id="how-title" className={eyebrow}>
          How the focus score works
        </h2>
        <p className="mt-2 max-w-2xl">
          For each finished session: 100 × focused minutes ÷ planned minutes, rounded, minus 5 for each blocked visit during the session, kept between 0
          and 100. A day or a week shows the average of its sessions; &ldquo;–&rdquo; means no finished sessions. Focus time counts finished sessions,
          without pauses.
        </p>
      </section>
    </div>
  );
}
