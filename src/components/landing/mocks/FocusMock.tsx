// "Focus" (spec 45): a running focus session with its ring and clock, and under it the sites the
// blocker stopped. They arrive one by one, get struck through and marked "Blocked"; the count follows.
import { Lock, ShieldCheck } from "lucide-react";
import { GoalTile } from "@/components/goals/GoalTile";
import { buttonClass } from "@/components/ui/Button";
import { timing } from "./parts";
import { Ticker } from "./Ticker";

/** The ring: drawn 132 px wide (smaller on phones), 6 px stroke, half of a 50 minute session done. */
const SIZE = 132;
const STROKE = 6;
const RADIUS = (SIZE - STROKE) / 2;
const LENGTH = 2 * Math.PI * RADIUS;
const DONE = 0.5;

const SITES = [
  { domain: "youtube.com", at: "9:06 AM" },
  { domain: "instagram.com", at: "9:14 AM" },
  { domain: "reddit.com", at: "9:21 AM" },
];

/** When the site at `index` arrives, in milliseconds after the scene starts. */
function arrival(index: number): number {
  return 900 + index * 950;
}
/** When it is marked as blocked. */
function blocked(index: number): number {
  return arrival(index) + 520;
}

export function FocusMock() {
  return (
    <div
      role="img"
      aria-label="A focus session for the thesis with 25 of 50 minutes left. The blocker is on and has stopped three visits: youtube.com, instagram.com and reddit.com."
      className="w-full max-w-[440px]"
    >
      <div aria-hidden className="flex flex-col gap-3">
        <div className="l-rise flex items-center gap-4 rounded-card border border-line-subtle bg-surface p-4 shadow-float sm:gap-5 sm:p-5">
          <div className="relative size-[108px] shrink-0 sm:size-[132px]">
            <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full -rotate-90">
              <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" strokeWidth={STROKE} className="stroke-muted" />
              <circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={LENGTH}
                className="l-ring stroke-indigo-500"
                style={{ strokeDashoffset: LENGTH * (1 - DONE), ...timing({ d: 250, from: LENGTH }) }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[24px] leading-none font-semibold tracking-heading text-ink tabular sm:text-[28px]">
                <Ticker from={24 * 60 + 59} />
              </span>
              <span className="mt-1.5 text-[11px] text-ink-3">of 50 min</span>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <GoalTile look={{ color: "indigo", icon: "graduation" }} size="sm" />
              <span className="min-w-0 truncate text-[15px] font-semibold tracking-snug text-ink">Thesis: chapter 3</span>
            </div>
            <span className="mt-3 inline-flex h-7 items-center gap-1.5 rounded-full bg-success-soft px-2.5 text-[12px] font-medium text-success">
              <ShieldCheck className="size-3.5" />
              Blocking on
              <span className="l-live size-1.5 rounded-full bg-success" />
            </span>
            <div className="mt-3 flex gap-2">
              <span className={buttonClass("secondary", "sm")}>Pause</span>
              <span className={buttonClass("ghost", "sm")}>End</span>
            </div>
          </div>
        </div>

        <div className="l-rise rounded-card border border-line-subtle bg-surface shadow-float" style={timing({ d: 200 })}>
          <div className="flex items-center justify-between gap-3 px-4 pt-3.5">
            <span className="text-[13px] font-semibold tracking-snug text-ink">Blocked during this session</span>
            <span className="flex items-center gap-1.5 text-[12px] text-ink-3">
              Attempts
              {/* The count: each number makes room for the next as a site is blocked. */}
              <span className="grid w-2 justify-items-center font-semibold text-ink tabular">
                <span className="l-leave col-start-1 row-start-1" style={timing({ out: blocked(0) })}>
                  0
                </span>
                {SITES.slice(0, -1).map((site, index) => (
                  <span key={site.domain} className="l-ghost col-start-1 row-start-1" style={timing({ d: blocked(index), out: blocked(index + 1) })}>
                    {index + 1}
                  </span>
                ))}
                <span className="l-pop col-start-1 row-start-1" style={timing({ d: blocked(SITES.length - 1) })}>
                  {SITES.length}
                </span>
              </span>
            </span>
          </div>
          <ul className="px-2 pb-2 pt-1.5">
            {SITES.map((site, index) => (
              <li key={site.domain} className="l-slide" style={timing({ d: arrival(index) })}>
                <div className="l-shake flex h-10 items-center gap-2.5 rounded-lg px-2" style={timing({ d: arrival(index) + 400 })}>
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-raised text-[11px] font-semibold uppercase text-ink-2">{site.domain[0]}</span>
                  <span className="relative min-w-0 truncate text-[13px] text-ink-2">
                    {site.domain}
                    <span className="l-grow absolute inset-x-0 top-1/2 h-px bg-ink-3" style={timing({ d: arrival(index) + 460 })} />
                  </span>
                  <span className="ml-auto hidden shrink-0 text-[11px] tabular text-ink-3 sm:inline">{site.at}</span>
                  <span className="l-pop ml-auto inline-flex h-5 shrink-0 items-center gap-1 rounded-md bg-danger-soft px-1.5 text-[11px] font-semibold text-danger sm:ml-0" style={timing({ d: blocked(index) })}>
                    <Lock className="size-3" strokeWidth={2.4} />
                    Blocked
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
