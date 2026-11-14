"use client";

// GETTING THERE: how the user gets to this event (R27). "Standard" uses what is chosen in the settings;
// any other choice is for this event only. Timed events of our own only: all-day events have no travel
// time (R29) and an Outlook event keeps the standard (R11).
import type { TravelMode } from "@/lib/settings/types";
import { Eyebrow, ToggleChip } from "../fields";

const CHOICES: { mode: TravelMode | null; label: string }[] = [
  { mode: null, label: "Standard" },
  { mode: "driving", label: "Driving" },
  { mode: "cycling", label: "Cycling" },
  { mode: "walking", label: "Walking" },
  { mode: "transit", label: "Public transport" },
];

export function TravelSection({ value, onChange }: { value: TravelMode | null; onChange: (mode: TravelMode | null) => void }) {
  return (
    <section className="flex flex-col gap-1.5">
      <Eyebrow>Getting there</Eyebrow>
      <div role="group" aria-label="Getting there" className="flex flex-wrap gap-1.5">
        {CHOICES.map((c) => (
          <ToggleChip key={c.label} pressed={value === c.mode} onClick={() => onChange(c.mode)}>
            {c.label}
          </ToggleChip>
        ))}
      </div>
      <p className="text-xs text-ink-3">“Standard” is the way you chose in the settings.</p>
    </section>
  );
}
