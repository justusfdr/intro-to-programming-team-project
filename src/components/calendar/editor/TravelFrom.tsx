"use client";

// "From": where the trip to this event starts. Folded it is one line ("From  Last event ▾"); opened it
// shows the choices as chips: the standard (the event before, else home), Last event, Home, every saved
// place, and Other address (typed once, for this event only). A typed address can be kept as a place.
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  useAddSavedPlace,
  useSavedPlaces,
} from "@/components/places/SavedPlaces";
import { postJson } from "@/lib/client/post-json";
import {
  MAX_PLACE_NAME,
  MAX_PLACES,
  travelFromOf,
  travelFromText,
  type SavedPlace,
  type TravelFrom,
} from "@/lib/places/saved";
import { ToggleChip, inputClass } from "../fields";

/** The choice in words. */
export function fromLabel(
  from: TravelFrom | null,
  places: SavedPlace[],
): string {
  if (!from) return "Automatic";
  if (from.kind === "home") return "Home";
  if (from.kind === "last") return "Last event";
  if (from.kind === "address") return from.address;
  // A place deleted since: the standard.
  return places.find((p) => p.id === from.id)?.name ?? "Automatic";
}

export function TravelFromField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (from: string | null) => void;
}) {
  const places = useSavedPlaces();
  const from = travelFromOf(value);
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(from?.kind === "address");
  const [address, setAddress] = useState(
    from?.kind === "address" ? from.address : "",
  );

  const pick = (next: TravelFrom | null) => {
    setTyping(false);
    onChange(travelFromText(next));
    setOpen(false);
  };
  const commitAddress = () => {
    const text = address.trim();
    if (text !== "")
      onChange(travelFromText({ kind: "address", address: text }));
  };
  const is = (kind: TravelFrom["kind"] | null, id?: string) =>
    !typing &&
    (kind === null
      ? from === null ||
        (from.kind === "place" && !places.some((p) => p.id === from.id))
      : from?.kind === kind &&
        (id === undefined || (from.kind === "place" && from.id === id)));

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 self-start rounded-md text-xs text-ink-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
      >
        From
        <span className="max-w-[200px] truncate font-medium text-ink">
          {typing && address.trim() === ""
            ? "Other address"
            : fromLabel(from, places)}
        </span>
        <ChevronDown
          className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {!open && from === null && (
        <p className="text-xs text-ink-3">
          The place of the event before, else home.
        </p>
      )}
      {open && (
        <div role="group" aria-label="From" className="flex flex-wrap gap-1.5">
          <ToggleChip pressed={is(null)} onClick={() => pick(null)}>
            Automatic
          </ToggleChip>
          <ToggleChip
            pressed={is("last")}
            onClick={() => pick({ kind: "last" })}
          >
            Last event
          </ToggleChip>
          <ToggleChip
            pressed={is("home")}
            onClick={() => pick({ kind: "home" })}
          >
            Home
          </ToggleChip>
          {places.map((p) => (
            <ToggleChip
              key={p.id}
              pressed={is("place", p.id)}
              onClick={() => pick({ kind: "place", id: p.id })}
            >
              <span className="max-w-[140px] truncate">{p.name}</span>
            </ToggleChip>
          ))}
          <ToggleChip pressed={typing} onClick={() => setTyping(true)}>
            Other address
          </ToggleChip>
        </div>
      )}
      {typing && (
        <>
          <input
            type="text"
            aria-label="Start address"
            value={address}
            maxLength={300}
            placeholder="Where you start, e.g. Rua Augusta 100, Lisbon"
            autoComplete="off"
            onChange={(e) => setAddress(e.target.value)}
            onBlur={commitAddress}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitAddress();
                setOpen(false);
              }
            }}
            className={inputClass}
          />
          {address.trim() !== "" && places.length < MAX_PLACES && (
            <SaveAsPlace
              address={address.trim()}
              onSaved={(place) => pick({ kind: "place", id: place.id })}
            />
          )}
        </>
      )}
    </div>
  );
}

/** "Save as place": keeps a typed start address as a saved place under a name. */
function SaveAsPlace({
  address,
  onSaved,
}: {
  address: string;
  onSaved: (place: SavedPlace) => void;
}) {
  const add = useAddSavedPlace();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (name.trim() === "") return setError("Give the place a name");
    setBusy(true);
    setError("");
    const answer = await postJson("/api/saved-places", {
      name: name.trim(),
      address,
    });
    setBusy(false);
    const place = (answer.data as { place?: SavedPlace } | undefined)?.place;
    if (!answer.ok || !place)
      return setError(
        answer.message || "Something went wrong. Please try again.",
      );
    add(place);
    onSaved(place);
  }

  if (!naming) {
    return (
      <button
        type="button"
        onClick={() => setNaming(true)}
        className="self-start text-xs font-medium text-ink-2 underline-offset-2 hover:text-ink hover:underline"
      >
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
            }
          }}
          className={`${inputClass} min-w-0 flex-1`}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="h-8 shrink-0 rounded-lg bg-ink px-3 text-xs font-medium text-white disabled:opacity-50"
        >
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
