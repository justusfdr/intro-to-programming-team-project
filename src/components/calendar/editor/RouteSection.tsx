"use client";

// ROUTE: the way to a timed event of our own, in the order of the trip, as in a maps app:
//   From  where the trip starts (Last event, Home, a saved place or an address)
//    ┊    how (Driving, Cycling, Walking, Public transport; the settings' way unless one is chosen)
//   To    where the event is (Home, a saved place, an address, or any text such as a room)
// Under it the travel line ("Leave at …", "Show map"). A typed address can be kept as a saved place.
// "Last event" is also the start when nothing was chosen: the place of the event before, else home.
import { useState, type ReactNode } from "react";
import { Bike, Car, ChevronDown, Footprints, History, House, MapPin, TramFront } from "lucide-react";
import { useAddSavedPlace, useSavedPlaces, useTravelDefaults } from "@/components/places/SavedPlaces";
import { postJson } from "@/lib/client/post-json";
import { MAX_PLACE_NAME, MAX_PLACES, travelFromOf, travelFromText, type SavedPlace, type TravelFrom } from "@/lib/places/saved";
import type { TravelMode } from "@/lib/settings/types";
import { Eyebrow, ToggleChip, inputClass } from "../fields";
import { PlacePicker, type PickerChoice } from "./PlacePicker";

const MODES: { mode: TravelMode; label: string; icon: typeof Car }[] = [
  { mode: "driving", label: "Driving", icon: Car },
  { mode: "cycling", label: "Cycling", icon: Bike },
  { mode: "walking", label: "Walking", icon: Footprints },
  { mode: "transit", label: "Public transport", icon: TramFront },
];

type Props = {
  from: string | null;
  onFrom: (from: string | null) => void;
  mode: TravelMode | null;
  onMode: (mode: TravelMode | null) => void;
  location: string;
  onLocation: (location: string) => void;
  /** The travel line under the route (only for a saved event). */
  children?: ReactNode;
};

/** What the From button shows: a deleted place and nothing chosen are "Last event". */
export function fromView(from: TravelFrom | null, home: string, places: SavedPlace[]): { kind: "last" | "home" | "place" | "address"; title: string; detail?: string } {
  if (from?.kind === "home") return { kind: "home", title: "Home", detail: home || "Add it in the settings" };
  if (from?.kind === "address") return { kind: "address", title: from.address };
  if (from?.kind === "place") {
    const place = places.find((p) => p.id === from.id);
    if (place) return { kind: "place", title: place.name, detail: place.address };
  }
  return { kind: "last", title: "Last event" };
}

/** What the To button shows: Home or a saved place by name when the location is its address. */
export function toView(location: string, home: string, places: SavedPlace[]): { kind: "none" | "home" | "place" | "address"; title: string; detail?: string } {
  const text = location.trim();
  if (text === "") return { kind: "none", title: "Add destination" };
  if (home && text === home.trim()) return { kind: "home", title: "Home", detail: text };
  const place = places.find((p) => p.address === text);
  if (place) return { kind: "place", title: place.name, detail: text };
  return { kind: "address", title: text };
}

const ICON: Record<"none" | "last" | "home" | "place" | "address", ReactNode> = {
  none: <MapPin className="size-4" aria-hidden />,
  last: <History className="size-4" aria-hidden />,
  home: <House className="size-4" aria-hidden />,
  place: <MapPin className="size-4" aria-hidden />,
  address: <MapPin className="size-4" aria-hidden />,
};

export function RouteSection({ from, onFrom, mode, onMode, location, onLocation, children }: Props) {
  const places = useSavedPlaces();
  const { home, travelMode } = useTravelDefaults();
  const [modesOpen, setModesOpen] = useState(false);

  const start = travelFromOf(from);
  const fromShown = fromView(start, home, places);
  const toShown = toView(location, home, places);
  const way = mode ?? travelMode;
  const Way = MODES.find((m) => m.mode === way) ?? MODES[0];

  const pickFrom = (choice: PickerChoice) => {
    if (choice.kind === "place") return onFrom(travelFromText({ kind: "place", id: choice.place.id }));
    // "Last event" is what happens without a choice, so it is saved as the standard.
    if (choice.kind === "last") return onFrom(null);
    onFrom(travelFromText(choice));
  };
  const pickTo = (choice: PickerChoice) => {
    if (choice.kind === "home") return onLocation(home);
    if (choice.kind === "place") return onLocation(choice.place.address);
    if (choice.kind === "address") return onLocation(choice.address);
  };

  return (
    <section className="flex flex-col gap-1.5">
      <Eyebrow>Route</Eyebrow>
      <PlacePicker
        label="From"
        icon={ICON[fromShown.kind]}
        title={fromShown.title}
        detail={fromShown.detail}
        withLast
        home={home}
        places={places}
        placeholder="Search where you start"
        current={(c) => c.kind === fromShown.kind && (c.kind !== "place" || c.place.id === (start?.kind === "place" ? start.id : ""))}
        onPick={pickFrom}
      />
      {start?.kind === "address" && places.length < MAX_PLACES && <SaveAsPlace address={start.address} onSaved={(place) => onFrom(travelFromText({ kind: "place", id: place.id }))} />}

      <div className="flex items-stretch gap-2 pl-[3.6rem]">
        <span aria-hidden className="w-px border-l border-dashed border-line" />
        <div className="flex min-w-0 flex-col gap-1.5 py-0.5">
          <button
            type="button"
            aria-expanded={modesOpen}
            onClick={() => setModesOpen((o) => !o)}
            className="flex items-center gap-1.5 self-start rounded-md px-1 py-0.5 text-xs text-ink-2 hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
          >
            <Way.icon className="size-3.5" aria-hidden />
            <span className="font-medium text-ink">{Way.label}</span>
            {mode === null && <span className="text-ink-3">(default)</span>}
            <ChevronDown className={`size-3.5 transition-transform ${modesOpen ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {modesOpen && (
            <div role="group" aria-label="Getting there" className="flex flex-wrap gap-1.5">
              {MODES.map((m) => (
                <ToggleChip
                  key={m.mode}
                  pressed={way === m.mode}
                  onClick={() => {
                    // The settings' way stays the standard, so a later change in the settings counts.
                    onMode(m.mode === travelMode ? null : m.mode);
                    setModesOpen(false);
                  }}
                >
                  <m.icon className="size-3.5" aria-hidden />
                  {m.label}
                </ToggleChip>
              ))}
            </div>
          )}
        </div>
      </div>

      <PlacePicker
        label="To"
        icon={ICON[toShown.kind]}
        title={toShown.title}
        detail={toShown.detail}
        home={home}
        places={places}
        placeholder="Search an address or type a room"
        current={(c) => (c.kind === "home" && toShown.kind === "home") || (c.kind === "place" && c.place.address === location.trim())}
        onPick={pickTo}
      />
      {toShown.kind === "address" && places.length < MAX_PLACES && <SaveAsPlace address={toShown.title} onSaved={() => {}} />}
      {children}
    </section>
  );
}

/** "Save as place": keeps a typed address as a saved place under a name. */
function SaveAsPlace({ address, onSaved }: { address: string; onSaved: (place: SavedPlace) => void }) {
  const add = useAddSavedPlace();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (name.trim() === "") return setError("Give the place a name");
    setBusy(true);
    setError("");
    const answer = await postJson("/api/saved-places", { name: name.trim(), address });
    setBusy(false);
    const place = (answer.data as { place?: SavedPlace } | undefined)?.place;
    if (!answer.ok || !place) return setError(answer.message || "Something went wrong. Please try again.");
    add(place);
    setNaming(false);
    setName("");
    onSaved(place);
  }

  if (!naming) {
    return (
      <button type="button" onClick={() => setNaming(true)} className="self-end text-xs text-ink-3 underline-offset-2 hover:text-ink hover:underline">
        Save as place
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          aria-label="Name of the place"
          value={name}
          maxLength={MAX_PLACE_NAME}
          placeholder="Name, e.g. Gym"
          autoComplete="off"
          autoFocus
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setNaming(false);
            }
          }}
          className={`${inputClass} min-w-0 flex-1`}
        />
        <button type="button" disabled={busy} onClick={() => void save()} className="h-8 shrink-0 rounded-lg bg-ink px-3 text-xs font-medium text-white disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
