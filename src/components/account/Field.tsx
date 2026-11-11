import type { InputHTMLAttributes } from "react";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  /** Short help shown under the field and read out with it. */
  hint?: string;
};

/** A labelled input. The label and hint are linked to the input for screen readers. */
export function Field({ id, label, hint, className = "", ...input }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-[13px] font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={hintId}
        className="mt-1.5 block h-11 w-full rounded-lg border border-line bg-surface px-3 text-base text-ink placeholder:text-ink-3 outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
        {...input}
      />
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-ink-2">
          {hint}
        </p>
      )}
    </div>
  );
}
