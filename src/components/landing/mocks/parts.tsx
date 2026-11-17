// Small shared pieces of the landing page's graphics (spec 45). The graphics are drawn with the app's
// own classes and colours, so they look like the real screens; they are pictures, not the real screens.
import type { CSSProperties, ReactNode } from "react";

/**
 * Timing for the moves in src/app/home/landing.css, in milliseconds: `d` is the delay, `out` the
 * moment something leaves again, `from` where a bar or ring starts.
 */
export function timing(values: { d?: number; out?: number; from?: number | string }): CSSProperties {
  const style: Record<string, string | number> = {};
  if (values.d !== undefined) style["--d"] = values.d;
  if (values.out !== undefined) style["--out"] = values.out;
  if (values.from !== undefined) style["--from"] = values.from;
  return style as CSSProperties;
}

/** Minutes of the day, for readable block times: at(10, 30). */
export function at(hour: number, minute = 0): number {
  return hour * 60 + minute;
}

/** "10:30" or "1" on the 12-hour clock, short enough for a narrow block. */
export function clock(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const hour12 = ((hour + 11) % 12) + 1;
  return minute ? `${hour12}:${String(minute).padStart(2, "0")}` : `${hour12}`;
}

/** "9 AM", "12 PM": the labels beside the hours, as in the calendar. */
export function hourLabel(hour: number): string {
  return `${((hour + 11) % 12) + 1} ${hour < 12 ? "AM" : "PM"}`;
}

/** The soft grey stage a graphic stands on. */
export function Stage({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex min-h-[440px] items-center justify-center rounded-panel border border-line-subtle bg-raised p-4 sm:p-8 ${className}`}>
      {children}
    </div>
  );
}

/** The three dots while the coach is thinking. */
export function Dots() {
  return (
    <span className="flex gap-1">
      {[0, 160, 320].map((delay) => (
        <span key={delay} className="l-dot size-1.5 rounded-full bg-ink-3" style={timing({ d: delay })} />
      ))}
    </span>
  );
}
