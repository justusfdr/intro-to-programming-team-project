"use client";

// LOCATION, as in the prototype: a field with the pin for our own events (saved with the
// editor's Save button), the location as text for an Outlook event (R11; nothing when it has none).
// While typing, address suggestions appear under the field (the same search as the home address in the
// settings). A click on one fills it in. The last row, "Look up", looks up exactly what was typed: found →
// the field shows the full address and flashes green; not found → it flashes red and shakes, and the text
// stays as typed (a location may also be a room or a name, so it can still be saved). The field itself
// lives in src/components/places/AddressField.tsx, shared with a goal's place (spec 42).
// The travel line ("Leave at …", R27) is drawn below it by the editor (TravelLine).
import { MapPin } from "lucide-react";
import { AddressField } from "@/components/places/AddressField";
import { useSavedPlaces } from "@/components/places/SavedPlaces";
import { Eyebrow } from "../fields";

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
        <LocationField value={value} onType={onType} onDone={onDone} />
      ) : (
        <p className="flex min-w-0 items-center gap-2 text-sm text-ink">
          <MapPin aria-hidden className="size-4 shrink-0 text-ink-3" strokeWidth={1.8} />
          <span className="min-w-0 truncate">{value}</span>
        </p>
      )}
    </section>
  );
}

/** The address field (shared with the goals, src/components/places/AddressField.tsx) with the saved places of the calendar page. */
function LocationField({ value, onType, onDone }: Omit<Props, "editable">) {
  return <AddressField value={value} onType={onType} onDone={onDone} savedPlaces={useSavedPlaces()} />;
}
