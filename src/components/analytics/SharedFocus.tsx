"use client";

// "Shared with you" on the Analytics page (spec 29, R49): the focus chart of a contact who shares it,
// picked from a list. Only what the server hands out: per week of the current week and the 7 before the
// focused minutes and the finished sessions, and this week's minutes per day, cut in the OWNER's time
// zone. Drawn in the page's chart look; the bars are hidden from screen readers and a table says the same.
import { useEffect, useId, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { DemoTag } from "@/components/ui/DemoTag";
import { INPUT_CLASS } from "@/components/settings/fields";
import { getJson } from "@/lib/client/post-json";
import { minutesText } from "@/lib/focus/session-time";
import type { SharedFocusAnswer, SharingPerson } from "@/lib/shares/types";
import { fmtDateShort, fmtDayMonth, fmtWeekday } from "@/lib/time/display";

const card = "rounded-card border border-line-subtle bg-surface p-5";
const eyebrow = "text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3";

/** Keeps only an answer of the expected shape; anything else counts as nothing. */
function asChart(data: unknown): SharedFocusAnswer | null {
  if (!data || typeof data !== "object") return null;
  const { weeks, days } = data as { weeks?: unknown; days?: unknown };
  if (!Array.isArray(weeks) || !Array.isArray(days)) return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    weeks: (weeks as Record<string, unknown>[])
      .filter((w) => typeof w.monday === "string")
      .map((w) => ({ monday: w.monday as string, focusedMinutes: num(w.focusedMinutes), sessions: num(w.sessions) })),
    days: (days as Record<string, unknown>[])
      .filter((d) => typeof d.date === "string")
      .map((d) => ({ date: d.date as string, focusedMinutes: num(d.focusedMinutes), sessions: num(d.sessions) })),
  };
}

function Bars({ bars, current }: { bars: { key: string; label: string; minutes: number }[]; current: string | null }) {
  const max = Math.max(1, ...bars.map((b) => b.minutes));
  return (
    <div aria-hidden className="mt-4 grid h-36 items-end gap-2" style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}>
      {bars.map((bar) => {
        const height = bar.minutes === 0 ? 0 : Math.max(4, Math.round((bar.minutes / max) * 100));
        return (
          <div key={bar.key} className="flex h-full min-w-0 flex-col items-center justify-end gap-1">
            <span className="truncate text-[10px] tabular text-ink-3">{bar.minutes > 0 ? minutesText(bar.minutes) : ""}</span>
            <span className={`w-full max-w-9 rounded-t-[5px] ${bar.key === current ? "bg-ink" : "bg-ink/20"}`} style={{ height }} />
            <span className={`truncate text-[11px] ${bar.key === current ? "font-semibold text-ink" : "text-ink-3"}`}>{bar.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** `initial`: the person the address names (the People page's "View focus chart"), else the first. */
export function SharedFocus({
  people,
  initial,
  title = "Shared with you",
  subtitle = "Focus charts your contacts share with you. Read only, in their own time zone.",
}: {
  people: readonly SharingPerson[];
  initial?: string;
  /** Spec 33: the person's profile page shows the same chart under its own heading. */
  title?: string;
  subtitle?: string;
}) {
  const selectId = useId();
  const [chosen, setChosen] = useState<string>(people.find((p) => p.userId === initial)?.userId ?? people[0]?.userId ?? "");
  const [chart, setChart] = useState<{ userId: string; data: SharedFocusAnswer | null; message: string } | null>(null);

  useEffect(() => {
    if (!chosen) return;
    let cancelled = false;
    void getJson(`/api/shares/${encodeURIComponent(chosen)}/focus`).then((answer) => {
      if (cancelled) return;
      setChart({ userId: chosen, data: answer.ok ? asChart(answer.data) : null, message: answer.ok ? "" : answer.message });
    });
    return () => {
      cancelled = true;
    };
  }, [chosen]);

  const person = people.find((p) => p.userId === chosen);
  if (!person) return null;
  const data = chart?.userId === chosen ? chart.data : null;
  const weeks = data?.weeks ?? [];
  const days = data?.days ?? [];
  const thisWeek = weeks[weeks.length - 1]?.monday ?? null;

  return (
    <section aria-labelledby={`${selectId}-title`} className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={`${selectId}-title`} className="text-[17px] font-semibold tracking-snug text-ink">
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>
        </div>
        {people.length > 1 && (
          <div className="flex items-center gap-2">
            <label htmlFor={selectId} className="text-xs text-ink-2">
              Person
            </label>
            <select id={selectId} value={chosen} onChange={(e) => setChosen(e.target.value)} className={`${INPUT_CLASS} pr-8`}>
              {people.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.demo ? `${p.name} (demo)` : p.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
        <section aria-label={`${person.name}'s focus time per week`} className={`${card} min-w-0`}>
          <div className="flex items-center gap-2">
            <Avatar name={person.name} photoUrl={person.photoUrl} look={person.demo} size={24} />
            <h3 className={eyebrow}>{person.name} · focus time per week</h3>
            {person.demo && <DemoTag />}
          </div>
          {chart?.userId === chosen && !data ? (
            <p className="mt-4 text-sm text-ink-2">{chart.message || "This chart is not available."}</p>
          ) : (
            <>
              <Bars bars={weeks.map((w) => ({ key: w.monday, label: fmtDayMonth(w.monday), minutes: w.focusedMinutes }))} current={thisWeek} />
              <table className="sr-only">
                <caption>{person.name}&apos;s focus time and finished sessions per week</caption>
                <thead>
                  <tr>
                    <th scope="col">Week of</th>
                    <th scope="col">Focus time</th>
                    <th scope="col">Sessions</th>
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((w) => (
                    <tr key={w.monday}>
                      <th scope="row">{fmtDateShort(w.monday)}</th>
                      <td>{minutesText(w.focusedMinutes)}</td>
                      <td>{w.sessions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>

        <section aria-label={`${person.name}'s focus time this week`} className={`${card} min-w-0`}>
          <div className="flex items-center gap-2">
            <Avatar name={person.name} photoUrl={person.photoUrl} look={person.demo} size={24} />
            <h3 className={eyebrow}>{person.name} · this week</h3>
          </div>
          {data && (
            <>
              <Bars bars={days.map((d) => ({ key: d.date, label: fmtWeekday(d.date), minutes: d.focusedMinutes }))} current={null} />
              <p className="mt-3 text-sm text-ink-2">
                {minutesText(weeks[weeks.length - 1]?.focusedMinutes ?? 0)} in {weeks[weeks.length - 1]?.sessions ?? 0}{" "}
                {(weeks[weeks.length - 1]?.sessions ?? 0) === 1 ? "session" : "sessions"} this week
              </p>
              <table className="sr-only">
                <caption>{person.name}&apos;s focus time per day this week</caption>
                <tbody>
                  {days.map((d) => (
                    <tr key={d.date}>
                      <th scope="row">{fmtDateShort(d.date)}</th>
                      <td>{minutesText(d.focusedMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
