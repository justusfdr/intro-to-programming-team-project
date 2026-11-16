"use client";

// The time zone in the settings, chosen by city instead of from a long list: type where you are, pick the
// city, Confirm. Picking only fills in the city's name; Confirm asks the server for the city with its
// position, and the server finds the time zone there (src/lib/server/places/time-zone.ts); the settings
// save it as before. Found → the field flashes green; not found → it flashes red and shakes and
// nothing is saved. "Use this device's time zone" takes the one the browser already knows.
import { useEffect, useRef, useState } from "react";
import { PlaceList, checkClass, lookUpCity, nextRow, useCitySuggestions } from "@/components/places/places";
import { Button } from "@/components/ui/Button";
import type { PlaceSuggestion } from "@/lib/places/places";
import type { SettingsData } from "@/lib/settings/types";
import { INPUT_CLASS } from "./fields";

type Check = { state: "idle" | "checking" | "found" | "missing"; message?: string; round: number };

/** "America/New_York" → "America/New York", as the list showed it. */
export const zoneName = (zone: string) => zone.replaceAll("_", " ");

/** The browser's own time zone, or "" if it gives none. */
function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return "";
  }
}

export function TimeZoneField({
  id,
  hintId,
  timeZone,
  busy,
  save,
}: {
  id: string;
  hintId: string;
  timeZone: string;
  busy: boolean;
  save: (patch: Partial<SettingsData>) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  // The name of a city the person clicked, so its suggestions are not asked for again.
  const [picked, setPicked] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [check, setCheck] = useState<Check>({ state: "idle", round: 0 });

  // What the field holds now, to drop the answer of a look-up for text that was changed meanwhile.
  const latest = useRef(text);
  useEffect(() => {
    latest.current = text;
  }, [text]);

  const typed = text.trim();
  const suggestions = useCitySuggestions(typed, typed === picked);

  const choose = (city: PlaceSuggestion) => {
    setPicked(city.label);
    setText(city.label);
    setActive(-1);
    setCheck((c) => ({ state: "idle", round: c.round }));
  };

  const setZone = async (zone: string) => {
    const saved = zone === timeZone ? true : await save({ timeZone: zone });
    if (!saved) return setCheck((c) => ({ state: "idle", round: c.round }));
    setCheck((c) => ({ state: "found", message: `Time zone set to ${zoneName(zone)}`, round: c.round + 1 }));
  };

  const confirm = async () => {
    if (typed === "") return;
    setCheck((c) => ({ state: "checking", round: c.round }));
    const found = await lookUpCity(typed);
    if (latest.current.trim() !== typed) return setCheck((c) => ({ state: "idle", round: c.round })); // typed on meanwhile
    if (found === null) return setCheck((c) => ({ state: "missing", message: "City search is not available right now", round: c.round + 1 }));
    if (found.length === 0) return setCheck((c) => ({ state: "missing", message: "City not found", round: c.round + 1 }));
    const city = found[0];
    setPicked(city.label);
    setText(city.label);
    await setZone(city.timeZone);
  };

  const takeDeviceZone = async () => {
    const zone = deviceTimeZone();
    if (!zone) return setCheck((c) => ({ state: "missing", message: "This device does not say its time zone", round: c.round + 1 }));
    setText("");
    setPicked(null);
    await setZone(zone);
  };

  // The green or red colour fades after a moment.
  useEffect(() => {
    if (check.state !== "found" && check.state !== "missing") return;
    const timer = setTimeout(() => setCheck((c) => ({ ...c, state: "idle", message: undefined })), 2500);
    return () => clearTimeout(timer);
  }, [check.state, check.round]);

  const listOpen = open && check.state === "idle" && typed.length >= 3 && typed !== picked;
  const rows = suggestions.length + 1;

  return (
    <div className="flex w-full flex-col gap-1 sm:w-72">
      {/* The list opens right under the field, over what follows. */}
      <div className="relative flex items-center gap-2">
        <input
          key={check.state === "missing" ? check.round : "field"}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={listOpen}
          aria-controls={`${id}-cities`}
          aria-autocomplete="list"
          aria-invalid={check.state === "missing"}
          aria-describedby={hintId}
          value={text}
          maxLength={200}
          autoComplete="off"
          placeholder="Type your city, e.g. Lisbon"
          disabled={busy}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            setText(e.target.value);
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
        <Button type="button" variant="secondary" disabled={busy || check.state === "checking" || typed === ""} onClick={() => void confirm()}>
          {check.state === "checking" ? "Checking…" : "Confirm"}
        </Button>
        {listOpen && <PlaceList id={`${id}-cities`} label="City suggestions" suggestions={suggestions} typed={typed} active={active} onPick={choose} onLookUp={() => void confirm()} />}
      </div>
      <p role="status" className={`min-h-4 text-xs ${check.state === "missing" ? "text-danger" : "text-success"}`}>
        {check.state === "missing" || check.state === "found" ? check.message : ""}
      </p>
      <p className="text-xs text-ink-2">
        Now: <span className="font-medium text-ink">{zoneName(timeZone)}</span>
      </p>
      <button
        type="button"
        disabled={busy || check.state === "checking"}
        onClick={() => void takeDeviceZone()}
        className="self-start text-xs text-ink-2 underline underline-offset-2 hover:text-ink disabled:opacity-50"
      >
        Use this device’s time zone
      </button>
    </div>
  );
}
