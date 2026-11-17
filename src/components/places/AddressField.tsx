"use client";

// An address field with the app's suggestions, shared by an event's location (LocationSection) and a
// goal's place (spec 42: the guided questions and the goal editor). Moved here unchanged from the
// event editor: while typing, address suggestions appear under the field (the same search as the home
// address in the settings), the saved places whose name fits first. A click on one fills it in. The
// last row, "Look up", looks up exactly what was typed: found → the field shows the full address and
// flashes green; not found → it flashes red and shakes, and the text stays as typed (a location may
// also be a room or a name, so it can still be saved).
import { useEffect, useId, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { inputClass } from "@/components/calendar/fields";
import type { PlaceSuggestion } from "@/lib/places/places";
import type { SavedPlace } from "@/lib/places/saved";
import { withSaved } from "./SavedPlaces";
import { PlaceList, checkClass, lookUpCurrent, nextRow, usePlaceSuggestions } from "./places";

type Props = {
  value: string;
  onType: (location: string) => void;
  onDone: () => void;
  /** The user's saved places: those whose name fits are suggested first. */
  savedPlaces: SavedPlace[];
  /** The field's name for screen readers ("Location"). */
  label?: string;
  placeholder?: string;
  /** An id, for a visible label elsewhere. */
  id?: string;
  /**
   * Only where the field sits inside a scrolling area (the goal setup and the goal editor): the open
   * list of suggestions scrolls into view instead of staying cut off. The event editor does not ask for it.
   */
  revealList?: boolean;
};

type Check = { state: "idle" | "checking" | "found" | "missing"; message?: string; round: number };

export function AddressField({ value, onType, onDone, savedPlaces, label = "Location", placeholder = "Add location", id, revealList = false }: Props) {
  const uid = useId();
  // The text the field had when the editor opened: no suggestions for it until it is changed.
  const [first] = useState(value);
  // The address last chosen or found: no suggestions for it either.
  const [picked, setPicked] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [check, setCheck] = useState<Check>({ state: "idle", round: 0 });

  // What the field holds now, to drop the answer of a look-up for text that was changed meanwhile.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  const typed = value.trim();
  const settled = typed === first.trim() || typed === picked;
  const searched = usePlaceSuggestions(typed, settled);
  // The saved places whose name fits come first (typing "Gym" offers the gym's address).
  const suggestions = settled ? searched : withSaved(typed, savedPlaces, searched);
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
    const exact = await lookUpCurrent(text, () => latest.current);
    if (exact === "stale") return setCheck((c) => ({ state: "idle", round: c.round }));
    if (exact === null) return setCheck((c) => ({ state: "missing", message: "Address search is not available right now", round: c.round + 1 }));
    if (exact.length === 0) {
      return setCheck((c) => ({ state: "missing", message: "Address not found. You can still keep it as text.", round: c.round + 1 }));
    }
    setPicked(exact[0].label);
    onType(exact[0].label);
    setCheck((c) => ({ state: "found", round: c.round + 1 }));
  };

  // Inside a scrolling area the list can open below what is visible: bring it into view.
  const frame = useRef<HTMLDivElement>(null);
  const shownRows = listOpen ? rows : 0;
  useEffect(() => {
    if (!revealList || shownRows === 0) return;
    frame.current?.querySelector('[role="listbox"]')?.scrollIntoView({ block: "nearest" });
  }, [revealList, shownRows]);

  // The green or red colour fades after a moment.
  useEffect(() => {
    if (check.state !== "found" && check.state !== "missing") return;
    const timer = setTimeout(() => setCheck((c) => ({ ...c, state: "idle", message: undefined })), 2500);
    return () => clearTimeout(timer);
  }, [check.state, check.round]);

  return (
    <div ref={frame} className="relative flex flex-col gap-1">
      <div className="relative">
        <MapPin aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" strokeWidth={1.8} />
        <input
          key={check.state === "missing" ? check.round : "field"}
          aria-label={label}
          id={id}
          placeholder={placeholder}
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
