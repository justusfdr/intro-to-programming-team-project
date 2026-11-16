"use client";

// "From": where the trip to this event starts. Folded it is one line ("From  Last event ▾"); opened it
// shows the choices as chips: the standard (the event before, else home), Last event, Home, every saved
// place, and Other address (typed once, for this event only). A typed address can be kept as a place.
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useSavedPlaces } from "@/components/places/SavedPlaces";
import { travelFromOf, travelFromText, type SavedPlace, type TravelFrom } from "@/lib/places/saved";
import { ToggleChip, inputClass } from "../fields";

/** The choice in words. */
export function fromLabel(from: TravelFrom | null, places: SavedPlace[]): string {
  if (!from) return "Automatic";
  if (from.kind === "home") return "Home";
  if (from.kind === "last") return "Last event";
  if (from.kind === "address") return from.address;
  // A place deleted since: the standard.
  return places.find((p) => p.id === from.id)?.name ?? "Automatic";
}

export function TravelFromField({ value, onChange }: { value: string | null; onChange: (from: string | null) => void }) {
  const places = useSavedPlaces();
  const from = travelFromOf(value);
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(from?.kind === "address");
  const [address, setAddress] = useState(from?.kind === "address" ? from.address : "");

  const pick = (next: TravelFrom | null) => {
    setTyping(false);
    onChange(travelFromText(next));
    setOpen(false);
  };
  const commitAddress = () => {
    const text = address.trim();
    if (text !== "") onChange(travelFromText({ kind: "address", address: text }));
  };
  const is = (kind: TravelFrom["kind"] | null, id?: string) =>
    !typing && (kind === null ? from === null || (from.kind === "place" && !places.some((p) => p.id === from.id)) : from?.kind === kind && (id === undefined || (from.kind === "place" && from.id === id)));

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 self-start rounded-md text-xs text-ink-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
      >
        From
        <span className="max-w-[200px] truncate font-medium text-ink">{typing && address.trim() === "" ? "Other address" : fromLabel(from, places)}</span>
        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {!open && from === null && <p className="text-xs text-ink-3">The place of the event before, else home.</p>}
      {open && (
        <div role="group" aria-label="From" className="flex flex-wrap gap-1.5">
          <ToggleChip pressed={is(null)} onClick={() => pick(null)}>
            Automatic
          </ToggleChip>
          <ToggleChip pressed={is("last")} onClick={() => pick({ kind: "last" })}>
            Last event
          </ToggleChip>
          <ToggleChip pressed={is("home")} onClick={() => pick({ kind: "home" })}>
            Home
          </ToggleChip>
          {places.map((p) => (
            <ToggleChip key={p.id} pressed={is("place", p.id)} onClick={() => pick({ kind: "place", id: p.id })}>
              <span className="max-w-[140px] truncate">{p.name}</span>
            </ToggleChip>
          ))}
          <ToggleChip pressed={typing} onClick={() => setTyping(true)}>
            Other address
          </ToggleChip>
        </div>
      )}
      {typing && (
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
      )}
    </div>
  );
}
