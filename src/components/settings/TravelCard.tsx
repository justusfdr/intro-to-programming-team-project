"use client";

// Card "Travel", copied from the prototype's travel card: home address, how you get there, buffer
// (chips and a custom wheel, BufferField.tsx).
// The values are saved now; when to leave is calculated in a later step, so this card does not talk
// about leaving times yet (no switch, no routing service, no attribution).
// The home address is checked before it is saved: suggestions appear while typing, and "Confirm" looks the
// address up. Found → it is saved and the field flashes green; not found → nothing is saved, the field
// flashes red and shakes.
import { useEffect, useId, useRef, useState } from "react";
import { Car } from "lucide-react";
import { FormMessage } from "@/components/account/FormMessage";
import { useLiveSettings } from "@/components/live/Live";
import { Card } from "@/components/ui/Card";
import { PlaceList, checkClass, lookUpCurrent, nextRow, usePlaceSuggestions } from "@/components/places/places";
import type { PlaceSuggestion } from "@/lib/places/places";
import type { SavedPlace } from "@/lib/places/saved";
import type { SettingsData, TravelMode } from "@/lib/settings/types";
import { Button } from "@/components/ui/Button";
import { BufferField } from "./BufferField";
import { FieldRow, INPUT_CLASS, SegmentedField, SettingsCardHeader, type FieldOption } from "./fields";
import { PlacesRow } from "./PlacesDialog";
import { useSaveSettings } from "./useSaveSettings";

const MODE_OPTIONS: FieldOption<TravelMode>[] = [
  { value: "driving", label: "Driving" },
  { value: "cycling", label: "Cycling" },
  { value: "walking", label: "Walking" },
  { value: "transit", label: "Public transport" },
];

export function TravelCard({ settings: serverSettings, places = [] }: { settings: SettingsData; places?: SavedPlace[] }) {
  // The saved values, with a change that is on its way shown at once.
  const settings = useLiveSettings(serverSettings);
  const uid = useId();
  const { save, busy, failure } = useSaveSettings();
  const ids = { title: `${uid}-title`, home: `${uid}-home`, homeHint: `${uid}-home-hint`, mode: `${uid}-mode`, buffer: `${uid}-buffer`, bufferHint: `${uid}-buffer-hint` };

  // Draft of the address. When the saved value changes (after a save), the field shows it again.
  const [draft, setDraft] = useState({ base: settings.homeAddress, text: settings.homeAddress });
  if (draft.base !== settings.homeAddress) setDraft({ base: settings.homeAddress, text: settings.homeAddress });

  // What the field holds now, to drop the answer of a look-up for text that was changed meanwhile.
  const latest = useRef(draft.text);
  useEffect(() => {
    latest.current = draft.text;
  }, [draft.text]);

  const [active, setActive] = useState(-1);
  // The list shows only while the field has focus.
  const [open, setOpen] = useState(false);
  // A suggestion the person clicked: its text is known to exist, so Confirm needs no new look-up.
  const [picked, setPicked] = useState<string | null>(null);
  const [check, setCheck] = useState<{ state: "idle" | "checking" | "found" | "missing"; message?: string; round: number }>({ state: "idle", round: 0 });

  // Suggestions while typing, a moment after the last key.
  const typed = draft.text.trim();
  const suggestions = usePlaceSuggestions(typed, typed === settings.homeAddress || typed === picked);

  const choose = (place: PlaceSuggestion) => {
    setPicked(place.label);
    setDraft((d) => ({ ...d, text: place.label }));
    setCheck((c) => ({ state: "idle", round: c.round }));
  };

  const confirm = async () => {
    const text = draft.text.trim();
    setCheck((c) => ({ state: "checking", round: c.round }));
    let address = text;
    if (text !== "" && text !== picked) {
      const exact = await lookUpCurrent(text, () => latest.current);
      if (exact === "stale") return setCheck((c) => ({ state: "idle", round: c.round }));
      if (exact === null) return setCheck((c) => ({ state: "missing", message: "Address search is not available right now", round: c.round + 1 }));
      if (exact.length === 0) return setCheck((c) => ({ state: "missing", message: "Address not found", round: c.round + 1 }));
      address = exact[0].label;
    }
    const saved = address === settings.homeAddress ? true : await save({ homeAddress: address });
    if (saved === false) return setCheck((c) => ({ state: "idle", round: c.round }));
    setPicked(address);
    setDraft({ base: address, text: address });
    setCheck((c) => ({ state: "found", round: c.round + 1 }));
  };

  // The green or red colour fades after a moment.
  useEffect(() => {
    if (check.state !== "found" && check.state !== "missing") return;
    const timer = setTimeout(() => setCheck((c) => ({ ...c, state: "idle", message: undefined })), 2500);
    return () => clearTimeout(timer);
  }, [check.state, check.round]);

  const unchanged = draft.text.trim() === settings.homeAddress;
  // The list under the field: the suggestions, and always a last row that looks up exactly what was typed
  // (for an address the suggestions miss).
  const listOpen = open && check.state === "idle" && typed.length >= 3 && typed !== settings.homeAddress && typed !== picked;
  const rows = suggestions.length + 1;

  return (
    <Card role="region" aria-labelledby={ids.title} className="p-5 md:p-6">
      <SettingsCardHeader icon={Car} title="Travel" titleId={ids.title} description="Where your trips start and how you get to your events." />

      <div className="mt-5 divide-y divide-line-subtle">
        <FieldRow label="Home address" htmlFor={ids.home} hintId={ids.homeHint} hint="Where your trips start.">
          <div className="relative flex w-full flex-col gap-1 sm:w-72">
            <div className="flex items-center gap-2">
              <input
                key={check.state === "missing" ? check.round : "field"}
                id={ids.home}
                type="text"
                role="combobox"
                aria-expanded={listOpen}
                aria-controls={`${uid}-places`}
                aria-autocomplete="list"
                aria-invalid={check.state === "missing"}
                value={draft.text}
                maxLength={200}
                autoComplete="off"
                placeholder="e.g. Rua Augusta 100, Lisbon"
                aria-describedby={ids.homeHint}
                disabled={busy}
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, text: e.target.value }));
                  setActive(-1);
                  setCheck((c) => ({ state: "idle", round: c.round }));
                }}
                onKeyDown={(e) => {
                  if ((e.key === "ArrowDown" || e.key === "ArrowUp") && listOpen) {
                    e.preventDefault();
                    const key = e.key;
                    setActive((i) => nextRow(i, rows, key));
                  } else if (e.key === "Escape") {
                    setOpen(false);
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    if (active >= 0 && suggestions[active]) choose(suggestions[active]);
                    else void confirm();
                  }
                }}
                className={`${INPUT_CLASS} min-w-0 flex-1 transition-colors ${checkClass(check.state)}`}
              />
              <Button type="button" variant="secondary" disabled={busy || check.state === "checking" || unchanged} onClick={() => void confirm()}>
                {check.state === "checking" ? "Checking…" : "Confirm"}
              </Button>
            </div>
            {listOpen && <PlaceList id={`${uid}-places`} suggestions={suggestions} typed={typed} active={active} onPick={choose} onLookUp={() => void confirm()} />}
            <p role="status" className={`min-h-4 text-xs ${check.state === "missing" ? "text-danger" : "text-success"}`}>
              {check.state === "missing" ? check.message : check.state === "found" ? "Address confirmed" : ""}
            </p>
          </div>
        </FieldRow>

        <PlacesRow homeAddress={settings.homeAddress} places={places} />

        <FieldRow label="Getting there" labelId={ids.mode}>
          <SegmentedField
            value={settings.travelMode}
            options={MODE_OPTIONS}
            labelledBy={ids.mode}
            disabled={busy}
            onChange={(travelMode) => void save({ travelMode })}
          />
        </FieldRow>

        <FieldRow label="Buffer" labelId={ids.buffer} hintId={ids.bufferHint} hint="Extra minutes added to each trip.">
          <BufferField
            value={settings.travelBufferMinutes}
            labelledBy={ids.buffer}
            describedBy={ids.bufferHint}
            disabled={busy}
            onSave={(travelBufferMinutes) => save({ travelBufferMinutes })}
          />
        </FieldRow>
      </div>
      {failure && <FormMessage tone="error" text={failure.message} />}
      {/* Google's terms ask for this credit where its data is shown without a Google map. */}
      <p className="mt-3 text-[11px] text-ink-3">Addresses, routes and timetables: Google Maps.</p>
    </Card>
  );
}
