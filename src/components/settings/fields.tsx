// Building blocks of the settings cards, copied from the prototype (components/settings/fields.tsx and
// ConnectionPill.tsx there): the card head with its icon tile, a row with its label, a select list,
// a segmented choice (radio pills) and the status pill. Native elements only, so keyboard, screen
// readers and phones work without extra code. Every control has a real label.
import { useId, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** Head of a settings card: icon tile, title (h2 with `titleId`), short description, optional status. */
export function SettingsCardHeader({
  icon: Icon,
  title,
  titleId,
  description,
  aside,
}: {
  icon: LucideIcon;
  title: string;
  /** id of the heading, for aria-labelledby on the card. */
  titleId: string;
  description?: ReactNode;
  /** Next to the title, for example a status pill. */
  aside?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-raised text-ink">
        <Icon className="size-5" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 id={titleId} className="text-[15px] font-semibold tracking-snug text-ink">
            {title}
          </h2>
          {aside}
        </div>
        {description && <div className="mt-1 text-sm text-ink-2">{description}</div>}
      </div>
    </div>
  );
}

/**
 * One setting: label (and hint) on the left, the control on the right; stacked on phones.
 * `htmlFor` ties the label to one field; for groups (segments) use `labelId`.
 */
export function FieldRow({
  label,
  hint,
  htmlFor,
  labelId,
  hintId,
  children,
}: {
  label: string;
  hint?: ReactNode;
  htmlFor?: string;
  labelId?: string;
  hintId?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        {htmlFor ? (
          <label id={labelId} htmlFor={htmlFor} className="text-sm text-ink">
            {label}
          </label>
        ) : (
          <p id={labelId} className="text-sm text-ink">
            {label}
          </p>
        )}
        {hint && (
          <p id={hintId} className="mt-0.5 text-xs text-ink-3">
            {hint}
          </p>
        )}
      </div>
      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export type FieldOption<T extends string | number> = { value: T; label: string };

/** Classes of inputs and select lists in settings cards. */
export const INPUT_CLASS =
  "h-9 rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10 disabled:cursor-not-allowed disabled:opacity-60";

/** Native select list. Values travel as text and are turned back through `options`. */
export function SelectField<T extends string | number>({
  id,
  value,
  options,
  onChange,
  disabled = false,
  ariaDescribedBy,
  className = "",
}: {
  /** The id a <label htmlFor> points at. */
  id: string;
  value: T;
  options: FieldOption<T>[];
  onChange: (next: T) => void;
  disabled?: boolean;
  ariaDescribedBy?: string;
  className?: string;
}) {
  return (
    <select
      id={id}
      value={String(value)}
      disabled={disabled}
      aria-describedby={ariaDescribedBy}
      onChange={(e) => {
        const hit = options.find((o) => String(o.value) === e.target.value);
        if (hit) onChange(hit.value);
      }}
      className={`${INPUT_CLASS} min-w-0 pr-8 ${className}`}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Segmented choice of radio pills (one named group). Arrow keys move as in any radio group;
 * `labelledBy` points at the row's visible label.
 */
export function SegmentedField<T extends string | number>({
  value,
  options,
  onChange,
  labelledBy,
  describedBy,
  disabled = false,
}: {
  value: T;
  options: FieldOption<T>[];
  onChange: (next: T) => void;
  labelledBy: string;
  describedBy?: string;
  disabled?: boolean;
}) {
  const name = useId();
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} aria-describedby={describedBy} className="inline-flex max-w-full flex-wrap gap-1 rounded-full bg-raised p-1">
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <label
            key={String(o.value)}
            className={`relative inline-flex h-7 cursor-pointer items-center rounded-full px-3 text-xs font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink/20 ${
              checked ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink"
            } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
          >
            <input
              type="radio"
              name={name}
              value={String(o.value)}
              checked={checked}
              disabled={disabled}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        );
      })}
    </div>
  );
}

export type PillState = "connected" | "ready" | "attention" | "off";

const PILL: Record<PillState, { cls: string; dot: string }> = {
  connected: { cls: "bg-success-soft text-success", dot: "bg-success" },
  ready: { cls: "bg-warning-soft text-warning", dot: "bg-warning" },
  attention: { cls: "bg-danger-soft text-danger", dot: "bg-danger" },
  off: { cls: "bg-raised text-ink-2", dot: "bg-ink-3" },
};

/** The status pill of a card: green connected, amber ready, red needs attention, grey off. */
export function StatusPill({ state, children }: { state: PillState; children: string }) {
  const s = PILL[state];
  return (
    <span className={`inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[11px] font-medium ${s.cls}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${s.dot}`} />
      {children}
    </span>
  );
}
