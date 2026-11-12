"use client";

// LOCATION, as in the prototype: a field with the pin for our own events (saved with the
// editor's Save button), the location as text for an Outlook event (R11; nothing when it has none).
// The travel line ("Leave by …", R27) comes in a later step, below the field.
import { MapPin } from "lucide-react";
import { Eyebrow, inputClass } from "../fields";

type Props = {
  value: string;
  /** False for an Outlook event: its location is Outlook's (R11). */
  editable: boolean;
  onType: (location: string) => void;
  onDone: () => void;
};

export function LocationSection({ value, editable, onType, onDone }: Props) {
  if (!editable && !value) return null;
  return (
    <section className="flex flex-col gap-1.5">
      <Eyebrow>Location</Eyebrow>
      {editable ? (
        <div className="relative">
          <MapPin aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" strokeWidth={1.8} />
          <input
            aria-label="Location"
            placeholder="Add location"
            maxLength={200}
            value={value}
            onChange={(e) => onType(e.target.value)}
            onBlur={onDone}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur();
            }}
            className={`${inputClass} pl-9`}
          />
        </div>
      ) : (
        <p className="flex min-w-0 items-center gap-2 text-sm text-ink">
          <MapPin aria-hidden className="size-4 shrink-0 text-ink-3" strokeWidth={1.8} />
          <span className="min-w-0 truncate">{value}</span>
        </p>
      )}
    </section>
  );
}
