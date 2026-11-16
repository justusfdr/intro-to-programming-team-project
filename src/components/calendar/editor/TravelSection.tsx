"use client";

// GETTING THERE: how the user gets to this event (R27). "Standard" uses what is chosen in the settings;
// any other choice is for this event only. While the standard is on, the other ways stay hidden; switching
// it off shows them. Timed events of our own only: all-day events have no travel time (R29) and an Outlook
// event keeps the standard (R11).
import { useState } from "react";
import type { TravelMode } from "@/lib/settings/types";
import { Eyebrow, ToggleChip } from "../fields";

const CHOICES: { mode: TravelMode; label: string }[] = [
  { mode: "driving", label: "Driving" },
  { mode: "cycling", label: "Cycling" },
  { mode: "walking", label: "Walking" },
  { mode: "transit", label: "Public transport" },
];

const switchClass =
  "relative h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full bg-line transition-colors checked:bg-ink before:absolute before:top-0.5 before:left-0.5 before:size-4 before:rounded-full before:bg-white before:shadow-sm before:transition-transform checked:before:translate-x-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-1";

export function TravelSection({ value, onChange }: { value: TravelMode | null; onChange: (mode: TravelMode | null) => void }) {
  // Standard switched off but no way picked yet: the ways show until one is chosen.
  const [picking, setPicking] = useState(false);
  const standard = value === null && !picking;
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>Getting there</Eyebrow>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-ink-2">
          Standard
          <input
            type="checkbox"
            role="switch"
            checked={standard}
            onChange={(e) => {
              setPicking(!e.target.checked);
              if (e.target.checked) onChange(null);
            }}
            className={switchClass}
          />
        </label>
      </div>
      {standard ? (
        <p className="text-xs text-ink-3">The way you chose in the settings.</p>
      ) : (
        <div role="group" aria-label="Getting there" className="flex flex-wrap gap-1.5">
          {CHOICES.map((c) => (
            <ToggleChip key={c.mode} pressed={value === c.mode} onClick={() => onChange(c.mode)}>
              {c.label}
            </ToggleChip>
          ))}
        </div>
      )}
    </section>
  );
}
