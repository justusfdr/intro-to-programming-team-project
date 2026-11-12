// The large progress ring of a running session, taken over from the first prototype.
// Decorative: the time in its middle carries the meaning.
import type { ReactNode } from "react";

export function FocusRing({
  progress,
  children,
  className = "size-60",
  strokeClass = "stroke-ink",
}: {
  progress: number;
  children?: ReactNode;
  className?: string;
  /** The ring's colour: the goal's colour, else black (as in the prototype). */
  strokeClass?: string;
}) {
  const size = 240;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));

  return (
    <div className={`relative shrink-0 ${className}`}>
      <svg viewBox={`0 0 ${size} ${size}`} className="size-full -rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          opacity={p > 0 ? 1 : 0}
          className={strokeClass}
          style={{ transition: "stroke-dashoffset 1s linear" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}
