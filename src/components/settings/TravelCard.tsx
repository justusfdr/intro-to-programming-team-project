"use client";

// Card "Travel", copied from the prototype's travel card: home address, how you get there, buffer.
// The values are saved now; when to leave is calculated in a later step, so this card does not talk
// about leaving times yet (no switch, no routing service, no attribution).
import { useId, useState } from "react";
import { Car } from "lucide-react";
import { FormMessage } from "@/components/account/FormMessage";
import { useLiveSettings } from "@/components/live/Live";
import { Card } from "@/components/ui/Card";
import type { SettingsData, TravelMode } from "@/lib/settings/types";
import { FieldRow, INPUT_CLASS, SegmentedField, SelectField, SettingsCardHeader, type FieldOption } from "./fields";
import { useSaveSettings } from "./useSaveSettings";

const MODE_OPTIONS: FieldOption<TravelMode>[] = [
  { value: "driving", label: "Driving" },
  { value: "cycling", label: "Cycling" },
  { value: "walking", label: "Walking" },
];

const BUFFER_OPTIONS: FieldOption<number>[] = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120].map((min) => ({
  value: min,
  label: min === 0 ? "No buffer" : `${min} min`,
}));

/** Buffer choices; a saved value that is not in the list is added to it. */
function bufferOptionsFor(value: number): FieldOption<number>[] {
  if (BUFFER_OPTIONS.some((o) => o.value === value)) return BUFFER_OPTIONS;
  return [...BUFFER_OPTIONS, { value, label: `${value} min` }].sort((a, b) => a.value - b.value);
}

export function TravelCard({ settings: serverSettings }: { settings: SettingsData }) {
  // The saved values, with a change that is on its way shown at once.
  const settings = useLiveSettings(serverSettings);
  const uid = useId();
  const { save, busy, failure } = useSaveSettings();
  const ids = { title: `${uid}-title`, home: `${uid}-home`, homeHint: `${uid}-home-hint`, mode: `${uid}-mode`, buffer: `${uid}-buffer`, bufferHint: `${uid}-buffer-hint` };

  // Draft of the address. When the saved value changes (after a save), the field shows it again.
  const [draft, setDraft] = useState({ base: settings.homeAddress, text: settings.homeAddress });
  if (draft.base !== settings.homeAddress) setDraft({ base: settings.homeAddress, text: settings.homeAddress });

  const commitAddress = () => {
    const trimmed = draft.text.trim();
    if (trimmed !== settings.homeAddress) void save({ homeAddress: trimmed });
  };

  return (
    <Card role="region" aria-labelledby={ids.title} className="p-5 md:p-6">
      <SettingsCardHeader icon={Car} title="Travel" titleId={ids.title} description="Where your trips start and how you get to your events." />

      <div className="mt-5 divide-y divide-line-subtle">
        <FieldRow label="Home address" htmlFor={ids.home} hintId={ids.homeHint} hint="Where your trips start.">
          <input
            id={ids.home}
            type="text"
            value={draft.text}
            maxLength={200}
            autoComplete="street-address"
            placeholder="e.g. Rua Augusta 100, Lisbon"
            aria-describedby={ids.homeHint}
            disabled={busy}
            onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
            onBlur={commitAddress}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitAddress();
            }}
            className={`${INPUT_CLASS} w-full sm:w-72`}
          />
        </FieldRow>

        <FieldRow label="Getting there" labelId={ids.mode}>
          <SegmentedField
            value={settings.travelMode}
            options={MODE_OPTIONS}
            labelledBy={ids.mode}
            disabled={busy}
            onChange={(travelMode) => void save({ travelMode })}
          />
        </FieldRow>

        <FieldRow label="Buffer" htmlFor={ids.buffer} hintId={ids.bufferHint} hint="Extra minutes added to each trip.">
          <SelectField
            id={ids.buffer}
            value={settings.travelBufferMinutes}
            options={bufferOptionsFor(settings.travelBufferMinutes)}
            ariaDescribedBy={ids.bufferHint}
            disabled={busy}
            onChange={(travelBufferMinutes) => void save({ travelBufferMinutes })}
          />
        </FieldRow>
      </div>
      {failure && <FormMessage tone="error" text={failure.message} />}
    </Card>
  );
}
