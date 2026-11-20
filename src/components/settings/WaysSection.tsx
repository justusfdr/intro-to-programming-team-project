"use client";

// How the user gets to each place, and the buffer for it (asked for on 20 Nov 2026). Chips on top pick
// the place: "Other" (every address that is neither home nor a saved place: the settings' way and
// buffer), "Home" (when a home address is set) and each saved place ("Gym"). Under them, "Getting there"
// and "Buffer" for the chosen one. Home and a saved place show Other's values until they get their own;
// "Same as Other" clears them again. The server picks the same way (src/lib/travel/way.ts).
import { useId, useState } from "react";
import { useAnnounce } from "@/components/calendar/Announcer";
import { Button } from "@/components/ui/Button";
import { postJson } from "@/lib/client/post-json";
import type { SavedPlace } from "@/lib/places/saved";
import type { SettingsData, TravelMode } from "@/lib/settings/types";
import { BufferField } from "./BufferField";
import { FieldRow, SegmentedField, type FieldOption } from "./fields";

export const MODE_OPTIONS: FieldOption<TravelMode>[] = [
  { value: "driving", label: "Driving" },
  { value: "cycling", label: "Cycling" },
  { value: "walking", label: "Walking" },
  { value: "transit", label: "Public transport" },
];

/** "other", "home" or the id of a saved place. */
type Target = string;

/** The way and buffer the chosen place shows, and whether they are its own (or Other's). */
export function shownWay(target: Target, settings: SettingsData, places: SavedPlace[]): { mode: TravelMode; buffer: number; own: boolean } {
  const other = { mode: settings.travelMode, buffer: settings.travelBufferMinutes, own: true };
  if (target === "home") {
    return {
      mode: settings.homeTravelMode ?? other.mode,
      buffer: settings.homeTravelBufferMinutes ?? other.buffer,
      own: settings.homeTravelMode != null || settings.homeTravelBufferMinutes != null,
    };
  }
  const place = places.find((p) => p.id === target);
  if (!place) return other;
  return {
    mode: place.travelMode ?? other.mode,
    buffer: place.bufferMinutes ?? other.buffer,
    own: place.travelMode != null || place.bufferMinutes != null,
  };
}

export function WaysSection({
  settings,
  places,
  onPlace,
  save,
  busy,
}: {
  settings: SettingsData;
  places: SavedPlace[];
  /** A place as saved, with its new way or buffer. */
  onPlace: (place: SavedPlace) => void;
  /** Saves a change of the settings (Other's and home's values). */
  save: (patch: Partial<SettingsData>) => Promise<boolean>;
  busy: boolean;
}) {
  const uid = useId();
  const announce = useAnnounce();
  const [picked, setPicked] = useState<Target>("other");
  const [placeBusy, setPlaceBusy] = useState(false);
  const [error, setError] = useState("");

  const hasHome = settings.homeAddress.trim() !== "";
  // A place that was deleted, or home without an address: back to Other.
  const target = picked === "home" ? (hasHome ? "home" : "other") : picked === "other" || places.some((p) => p.id === picked) ? picked : "other";
  const options: FieldOption<Target>[] = [
    { value: "other", label: "Other" },
    ...(hasHome ? [{ value: "home", label: "Home" }] : []),
    ...places.map((p) => ({ value: p.id, label: p.name })),
  ];
  const shown = shownWay(target, settings, places);
  const disabled = busy || placeBusy;

  async function change(patch: { mode?: TravelMode | null; buffer?: number | null }): Promise<boolean> {
    setError("");
    if (target === "other") {
      return save({
        ...(patch.mode !== undefined && patch.mode !== null ? { travelMode: patch.mode } : {}),
        ...(patch.buffer !== undefined && patch.buffer !== null ? { travelBufferMinutes: patch.buffer } : {}),
      });
    }
    if (target === "home") {
      return save({
        ...(patch.mode !== undefined ? { homeTravelMode: patch.mode } : {}),
        ...(patch.buffer !== undefined ? { homeTravelBufferMinutes: patch.buffer } : {}),
      });
    }
    setPlaceBusy(true);
    const answer = await postJson(`/api/saved-places/${target}/travel`, {
      ...(patch.mode !== undefined ? { travelMode: patch.mode } : {}),
      ...(patch.buffer !== undefined ? { bufferMinutes: patch.buffer } : {}),
    });
    setPlaceBusy(false);
    if (!answer.ok) {
      setError(answer.message);
      return false;
    }
    const place = (answer.data as { place?: SavedPlace } | undefined)?.place;
    if (place) onPlace(place);
    announce(answer.message);
    return true;
  }

  const name = options.find((o) => o.value === target)?.label ?? "Other";

  return (
    <div>
      <FieldRow
        label="Ways"
        labelId={`${uid}-for`}
        hintId={`${uid}-for-hint`}
        hint="How you get to each place. Other is every other address."
      >
        <SegmentedField<Target> value={target} options={options} labelledBy={`${uid}-for`} describedBy={`${uid}-for-hint`} onChange={setPicked} />
      </FieldRow>

      <div className="rounded-lg bg-raised/40 px-3">
        <FieldRow
          label={`Getting there: ${name}`}
          labelId={`${uid}-mode`}
          hintId={`${uid}-mode-hint`}
          hint={target === "other" ? undefined : shown.own ? undefined : "Same as Other until you change it."}
        >
          <SegmentedField
            value={shown.mode}
            options={MODE_OPTIONS}
            labelledBy={`${uid}-mode`}
            disabled={disabled}
            onChange={(mode) => void change({ mode })}
          />
        </FieldRow>

        <BufferField
          // A new wheel for each place, so "Custom" does not carry over.
          key={target}
          value={shown.buffer}
          labelId={`${uid}-buffer`}
          hintId={`${uid}-buffer-hint`}
          disabled={disabled}
          onSave={(buffer) => change({ buffer })}
        />

        {target !== "other" && shown.own && (
          <div className="flex justify-end pb-3">
            <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => void change({ mode: null, buffer: null })}>
              Same as Other
            </Button>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="pt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
