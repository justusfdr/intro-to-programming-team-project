// The small line above a title on the landing page (spec 45): a number or a time, a short rule and a word.
import type { ReactNode } from "react";

export function Eyebrow({ number, children, className = "" }: { number?: string; children: ReactNode; className?: string }) {
  return (
    <p className={`flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3 ${className}`}>
      {number && (
        <>
          <span className="tabular">{number}</span>
          <span aria-hidden className="h-px w-6 bg-line" />
        </>
      )}
      <span className="text-ink">{children}</span>
    </p>
  );
}
