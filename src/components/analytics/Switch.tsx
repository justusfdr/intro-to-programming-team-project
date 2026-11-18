// A row with a name, a line about it and a switch at the right: the whole row is the switch, so it is
// easy to hit. Used by the Export window and by "Edit widgets" (spec 49).
import type { ReactNode } from "react";

/** The switch alone, as a picture: black with the knob at the right when on, grey with the knob at the left when off. */
export function SwitchKnob({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={`relative block h-6 w-10 shrink-0 rounded-full transition-colors ${on ? "bg-ink" : "bg-[#d4d4d8]"}`}>
      <span className={`absolute top-0.5 size-5 rounded-full bg-white transition-[left] ${on ? "left-[18px]" : "left-0.5"}`} />
    </span>
  );
}

export function Switch({
  on,
  onToggle,
  title,
  about,
  disabled = false,
  className = "",
  children,
}: {
  on: boolean;
  onToggle: () => void;
  title: string;
  about?: string;
  disabled?: boolean;
  className?: string;
  /** Shown before the name (an icon). */
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onToggle}
      className={`flex min-h-14 w-full items-center gap-3.5 bg-surface px-4 py-2 text-left transition-colors hover:bg-raised/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink/20 disabled:opacity-50 ${className}`}
    >
      {children}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{title}</span>
        {about && <span className="block text-xs text-ink-2">{about}</span>}
      </span>
      <SwitchKnob on={on} />
    </button>
  );
}
