"use client";

// LOCATION, as in the prototype: a field with the pin for our own events (saved with the
// editor's Save button), the location as text for an Outlook event (R11; nothing when it has none).
// While typing, address suggestions appear under the field (the same search as the home address in the
// settings). A click on one fills it in. The last row, "Look up", looks up exactly what was typed: found →
// the field shows the full address and flashes green; not found → it flashes red and shakes, and the text
// stays as typed (a location may also be a room or a name, so it can still be saved).
// The travel line ("Leave at …", R27) is drawn below it by the editor (TravelLine).
import { useEffect, useId, useState } from "react";
import { MapPin } from "lucide-react";
import { PlaceList, checkClass, lookUp, nextRow, usePlaceSuggestions } from "@/components/places/places";
import type { PlaceSuggestion } from "@/lib/places/places";
import { Eyebrow, inputClass } from "../fields";

type Props = {
  value: string;
  /** False for an Outlook event: its location is Outlook's (R11). */
  editable: boolean;
  onType: (location: string) => void;
  onDone: () => void;
};

type Check = { state: "idle" | "checking" | "found" | "missing"; message?: string; round: number };

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

function LocationField({ value, onType, onDone }: Omit<Props, "editable">) {
  const uid = useId();
  // The text the field had when the editor opened: no suggestions for it until it is changed.
  const [first] = useState(value);
  // The address last chosen or found: no suggestions for it either.
  const [picked, setPicked] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [check, setCheck] = useState<Check>({ state: "idle", round: 0 });

  const typed = value.trim();
  const settled = typed === first.trim() || typed === picked;
  const suggestions = usePlaceSuggestions(typed, settled);
  const listOpen = open && check.state === "idle" && typed.length >= 3 && !settled;
  const rows = suggestions.length + 1;

  const choose = (place: PlaceSuggestion) => {
    setPicked(place.label);
    onType(place.label);
    setActive(-1);
    setCheck((c) => ({ state: "idle", round: c.round }));
  };

  const lookUpTyped = async () => {
    const text = value.trim();
    if (text === "") return;
    setCheck((c) => ({ state: "checking", round: c.round }));
    const exact = await lookUp(text, undefined, true);
    if (exact === null) return setCheck((c) => ({ state: "missing", message: "Address search is not available right now", round: c.round + 1 }));
    if (exact.length === 0) {
      return setCheck((c) => ({ state: "missing", message: "Address not found. You can still keep it as text.", round: c.round + 1 }));
    }
    setPicked(exact[0].label);
    onType(exact[0].label);
    setCheck((c) => ({ state: "found", round: c.round + 1 }));
  };

  // The green or red colour fades after a moment.
  useEffect(() => {
    if (check.state !== "found" && check.state !== "missing") return;
    const timer = setTimeout(() => setCheck((c) => ({ ...c, state: "idle", message: undefined })), 2500);
    return () => clearTimeout(timer);
  }, [check.state, check.round]);

  return (
    <div className="relative flex flex-col gap-1">
      <div className="relative">
        <MapPin aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" strokeWidth={1.8} />
        <input
          key={check.state === "missing" ? check.round : "field"}
          aria-label="Location"
          placeholder="Add location"
          maxLength={200}
          role="combobox"
          aria-expanded={listOpen}
          aria-controls={`${uid}-places`}
          aria-autocomplete="list"
          aria-invalid={check.state === "missing"}
          autoComplete="off"
          value={value}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            onType(e.target.value);
            setActive(-1);
            setCheck((c) => ({ state: "idle", round: c.round }));
          }}
          onBlur={() => {
            setOpen(false);
            onDone();
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if ((e.key === "ArrowDown" || e.key === "ArrowUp") && listOpen) {
              e.preventDefault();
              const key = e.key;
              setActive((i) => nextRow(i, rows, key));
            } else if (e.key === "Escape" && listOpen) {
              // Esc first closes the list; the next Esc closes the editor.
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (listOpen && active >= 0 && suggestions[active]) choose(suggestions[active]);
              else if (listOpen && active === suggestions.length) void lookUpTyped();
              else e.currentTarget.blur();
            }
          }}
          className={`${inputClass} pl-9 transition-colors ${checkClass(check.state)}`}
        />
      </div>
      {listOpen && <PlaceList id={`${uid}-places`} suggestions={suggestions} typed={typed} active={active} onPick={choose} onLookUp={() => void lookUpTyped()} />}
      {check.state !== "idle" && (
        <p role="status" className={`text-xs ${check.state === "missing" ? "text-danger" : check.state === "found" ? "text-success" : "text-ink-3"}`}>
          {check.state === "missing" ? check.message : check.state === "found" ? "Address found" : "Looking up…"}
        </p>
      )}
    </div>
  );
}
