"use client";

// The row "Places" in the Travel card and its list: the home address on top (changed in its own row),
// then the user's saved places ("Uni", "Gym"), each to change or delete, and "Add place" at the end.
// A native <dialog> like the shortcut help: Escape, the close button or a click on the backdrop close it.
// The address of a place is checked like the home address: a suggestion that was picked is taken as it
// is; typed text is looked up first, and only an address that is found is saved.
import { useEffect, useId, useRef, useState } from "react";
import { House, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import { useAnnounce } from "@/components/calendar/Announcer";
import { PlaceList, lookUpCurrent, nextRow, usePlaceSuggestions } from "@/components/places/places";
import { Button } from "@/components/ui/Button";
import { postJson } from "@/lib/client/post-json";
import { MAX_PLACE_NAME, MAX_PLACES, type SavedPlace } from "@/lib/places/saved";
import type { PlaceSuggestion } from "@/lib/places/places";
import { INPUT_CLASS } from "./fields";

/** "Uni, Gym": what the row says under its label (the home address has its own row). */
export function placesHint(places: SavedPlace[]): string {
  return places.length === 0 ? "No places yet" : places.map((p) => p.name).join(", ");
}

export function PlacesRow({ homeAddress, places: initial }: { homeAddress: string; places: SavedPlace[] }) {
  const [places, setPlaces] = useState(initial);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm text-ink">Places</p>
        <p className="mt-0.5 truncate text-xs text-ink-3">{placesHint(places)}</p>
      </div>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Manage
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby="places-title"
        onClose={() => setOpen(false)}
        onClick={(event) => event.target === dialog.current && setOpen(false)}
        className="event-editor m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-card bg-surface p-0 text-ink shadow-pop md:m-auto md:max-h-[calc(100dvh-3rem)] md:max-w-md md:rounded-card"
      >
        {open && <PlacesList homeAddress={homeAddress} places={places} onPlaces={setPlaces} onClose={() => setOpen(false)} />}
      </dialog>
    </div>
  );
}

export function PlacesList({
  homeAddress,
  places,
  onPlaces,
  onClose,
}: {
  homeAddress: string;
  places: SavedPlace[];
  onPlaces: (places: SavedPlace[]) => void;
  onClose: () => void;
}) {
  const announce = useAnnounce();
  // Which place is being changed: its id, "new" for a new one, or null.
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function remove(place: SavedPlace) {
    setBusy(true);
    setError("");
    const answer = await postJson(`/api/saved-places/${place.id}/remove`, {});
    setBusy(false);
    if (!answer.ok && answer.status !== 404) return setError(answer.message);
    onPlaces(places.filter((p) => p.id !== place.id));
    announce(answer.ok ? answer.message : "Place removed.");
  }

  function saved(place: SavedPlace) {
    onPlaces(places.some((p) => p.id === place.id) ? places.map((p) => (p.id === place.id ? place : p)) : [...places, place]);
    setEditing(null);
  }

  return (
    <div className="flex max-h-[inherit] flex-col">
      <div className="flex items-center justify-between px-5 pt-5">
        <h2 id="places-title" className="text-base font-semibold">
          Places
        </h2>
        <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
          <X className="size-4" aria-hidden />
        </Button>
      </div>
      <p className="px-5 pt-1 text-xs text-ink-3">Where your trips can start. Choose one for an event under “Getting there”.</p>

      <ul className="mt-3 flex flex-col overflow-y-auto px-3 pb-2">
        <li className="flex items-center gap-3 rounded-lg px-2 py-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-raised">
            <House className="size-4 text-ink-2" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink">Home</p>
            <p className="truncate text-xs text-ink-3">{homeAddress || "Not set yet: add it under Home address"}</p>
          </div>
        </li>
        {places.map((place) =>
          editing === place.id ? (
            <li key={place.id}>
              <PlaceForm place={place} names={places.filter((p) => p.id !== place.id).map((p) => p.name)} onSaved={saved} onCancel={() => setEditing(null)} />
            </li>
          ) : (
            <li key={place.id} className="flex items-center gap-3 rounded-lg px-2 py-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-raised">
                <MapPin className="size-4 text-ink-2" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{place.name}</p>
                <p className="truncate text-xs text-ink-3">{place.address}</p>
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label={`Change ${place.name}`} disabled={busy} onClick={() => setEditing(place.id)}>
                <Pencil className="size-4" aria-hidden />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${place.name}`} disabled={busy} onClick={() => void remove(place)}>
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          ),
        )}
        {editing === "new" && (
          <li>
            <PlaceForm place={null} names={places.map((p) => p.name)} onSaved={saved} onCancel={() => setEditing(null)} />
          </li>
        )}
      </ul>

      {error && (
        <p role="alert" className="px-5 text-xs text-danger">
          {error}
        </p>
      )}
      <div className="border-t border-line-subtle px-5 py-3">
        {places.length >= MAX_PLACES ? (
          <p className="text-xs text-ink-3">You have saved {MAX_PLACES} places, the most there can be.</p>
        ) : (
          <Button type="button" variant="secondary" disabled={editing !== null} onClick={() => setEditing("new")}>
            <Plus className="size-4" aria-hidden />
            Add place
          </Button>
        )}
      </div>
    </div>
  );
}

/** Name and address of one place, new or saved. */
function PlaceForm({ place, names, onSaved, onCancel }: { place: SavedPlace | null; names: string[]; onSaved: (place: SavedPlace) => void; onCancel: () => void }) {
  const uid = useId();
  const announce = useAnnounce();
  const [name, setName] = useState(place?.name ?? "");
  const [address, setAddress] = useState(place?.address ?? "");
  // An address that is known to exist: the saved one, or a suggestion that was picked.
  const [picked, setPicked] = useState<string | null>(place?.address ?? null);
  const [active, setActive] = useState(-1);
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const latest = useRef(address);
  useEffect(() => {
    latest.current = address;
  }, [address]);

  const typed = address.trim();
  const suggestions = usePlaceSuggestions(typed, typed === picked);
  const listOpen = focused && !busy && typed.length >= 3 && typed !== picked;

  const choose = (suggestion: PlaceSuggestion) => {
    setPicked(suggestion.label);
    setAddress(suggestion.label);
    setActive(-1);
  };

  async function save() {
    const cleanName = name.trim();
    if (cleanName === "") return setError("Give the place a name");
    if (names.includes(cleanName)) return setError("You already have a place with this name");
    if (typed === "") return setError("Add the place's address");
    setBusy(true);
    setError("");
    let found = typed;
    if (typed !== picked) {
      const exact = await lookUpCurrent(typed, () => latest.current);
      if (exact === "stale") return setBusy(false);
      if (exact === null) {
        setBusy(false);
        return setError("Address search is not available right now");
      }
      if (exact.length === 0) {
        setBusy(false);
        return setError("Address not found");
      }
      found = exact[0].label;
    }
    const answer = await postJson(place ? `/api/saved-places/${place.id}` : "/api/saved-places", { name: cleanName, address: found });
    setBusy(false);
    if (!answer.ok) return setError(answer.message);
    const savedPlace = (answer.data as { place?: SavedPlace } | undefined)?.place;
    if (!savedPlace) return setError("Something went wrong. Please try again.");
    announce(answer.message);
    onSaved(savedPlace);
  }

  return (
    <form
      className="my-1 flex flex-col gap-2 rounded-lg border border-line-subtle p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label htmlFor={`${uid}-name`} className="text-xs text-ink-2">
        Name
      </label>
      <input
        id={`${uid}-name`}
        type="text"
        value={name}
        maxLength={MAX_PLACE_NAME}
        placeholder="e.g. Uni, Gym"
        autoComplete="off"
        autoFocus
        disabled={busy}
        onChange={(e) => setName(e.target.value)}
        className={INPUT_CLASS}
      />
      <label htmlFor={`${uid}-address`} className="text-xs text-ink-2">
        Address
      </label>
      <div className="relative">
        <input
          id={`${uid}-address`}
          type="text"
          role="combobox"
          aria-expanded={listOpen}
          aria-controls={`${uid}-list`}
          aria-autocomplete="list"
          value={address}
          maxLength={300}
          placeholder="e.g. Rua Augusta 100, Lisbon"
          autoComplete="off"
          disabled={busy}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            setAddress(e.target.value);
            setActive(-1);
          }}
          onKeyDown={(e) => {
            if ((e.key === "ArrowDown" || e.key === "ArrowUp") && listOpen) {
              e.preventDefault();
              const key = e.key;
              setActive((i) => nextRow(i, suggestions.length + 1, key));
            } else if (e.key === "Enter" && listOpen && active >= 0 && suggestions[active]) {
              e.preventDefault();
              choose(suggestions[active]);
            }
          }}
          className={`${INPUT_CLASS} w-full`}
        />
        {listOpen && <PlaceList id={`${uid}-list`} suggestions={suggestions} typed={typed} active={active} onPick={choose} onLookUp={() => void save()} />}
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
