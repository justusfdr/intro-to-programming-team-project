"use client";

// One place of the route, From or To, as in a maps app: a button with an icon, the place's name and its
// address in grey. Opened, a list drops down: a search field at the top, then "Last event" (From only),
// Home and every saved place, and while typing Google's suggestions and a last row that takes the text as
// typed. Escape or a click outside closes it.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown, History, House, MapPin, Search } from "lucide-react";
import { nextRow, usePlaceSuggestions } from "@/components/places/places";
import type { SavedPlace } from "@/lib/places/saved";

/** A row of the list. */
export type PickerChoice =
  | { kind: "last" }
  | { kind: "home" }
  | { kind: "place"; place: SavedPlace }
  | { kind: "address"; address: string };

type Props = {
  /** "From" or "To", also the button's name for screen readers. */
  label: string;
  /** What the button shows: an icon, the name and (grey) the address. */
  icon: ReactNode;
  title: string;
  detail?: string;
  /** Whether "Last event" is offered (From only). */
  withLast?: boolean;
  /** The home address ("" when not set: the row says so and cannot be picked). */
  home: string;
  places: SavedPlace[];
  /** Which row is the current one, to mark it. */
  current: (choice: PickerChoice) => boolean;
  onPick: (choice: PickerChoice) => void;
  placeholder: string;
};

export function PlacePicker({ label, icon, title, detail, withLast = false, home, places, current, onPick, placeholder }: Props) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);

  const typed = text.trim();
  const found = usePlaceSuggestions(typed, !open);
  const lower = typed.toLowerCase();
  const fits = (...words: string[]) => lower === "" || words.some((w) => w.toLowerCase().includes(lower));

  const rows: { key: string; icon: ReactNode; name: string; address?: string; choice: PickerChoice | null }[] = [];
  if (withLast && fits("Last event")) rows.push({ key: "last", icon: <History className="size-4" aria-hidden />, name: "Last event", address: "Where the event before ends", choice: { kind: "last" } });
  if (fits("Home", home)) rows.push({ key: "home", icon: <House className="size-4" aria-hidden />, name: "Home", address: home || "Add it in the settings", choice: home ? { kind: "home" } : null });
  for (const p of places) if (fits(p.name, p.address)) rows.push({ key: p.id, icon: <MapPin className="size-4" aria-hidden />, name: p.name, address: p.address, choice: { kind: "place", place: p } });
  const saved = rows.length;
  if (typed.length >= 3) {
    for (const f of found) rows.push({ key: `s-${f.label}`, icon: <Search className="size-4" aria-hidden />, name: f.label, choice: { kind: "address", address: f.label } });
    if (!found.some((f) => f.label === typed)) rows.push({ key: "typed", icon: <MapPin className="size-4" aria-hidden />, name: `Use “${typed}”`, choice: { kind: "address", address: typed } });
  }

  const close = () => {
    setOpen(false);
    setText("");
    setActive(-1);
  };
  const pick = (choice: PickerChoice | null) => {
    if (!choice) return;
    onPick(choice);
    close();
  };

  // A click outside closes the list.
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  return (
    <div ref={box} className="relative min-w-0 flex-1">
      <button
        type="button"
        aria-label={`${label}: ${title}`}
        aria-expanded={open}
        aria-controls={`${uid}-list`}
        onClick={() => (open ? close() : setOpen(true))}
        className="flex w-full min-w-0 items-center gap-2.5 rounded-lg border border-line-subtle px-2.5 py-1.5 text-left transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
      >
        <span className="w-9 shrink-0 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">{label}</span>
        <span className="shrink-0 text-ink-2">{icon}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm text-ink">{title}</span>
          {detail && <span className="truncate text-xs text-ink-3">{detail}</span>}
        </span>
        <ChevronDown className={`size-4 shrink-0 text-ink-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
          <div className="flex items-center gap-2 border-b border-line-subtle px-3">
            <Search className="size-4 shrink-0 text-ink-3" aria-hidden />
            <input
              autoFocus
              type="text"
              role="combobox"
              aria-label={`${label}: search an address`}
              aria-expanded
              aria-controls={`${uid}-list`}
              aria-autocomplete="list"
              value={text}
              maxLength={300}
              placeholder={placeholder}
              autoComplete="off"
              onChange={(e) => {
                setText(e.target.value);
                setActive(-1);
              }}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  const key = e.key;
                  setActive((i) => nextRow(i, rows.length, key));
                } else if (e.key === "Escape") {
                  // Esc closes the list, not the editor.
                  e.preventDefault();
                  e.stopPropagation();
                  close();
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (active >= 0 && rows[active]) pick(rows[active].choice);
                  else if (typed !== "") pick({ kind: "address", address: typed });
                }
              }}
              className="h-10 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
            />
          </div>
          <ul id={`${uid}-list`} role="listbox" aria-label={label} className="max-h-64 overflow-y-auto py-1">
            {rows.map((row, i) => (
              <li key={row.key} role="presentation">
                {i === saved && saved > 0 && <div className="mx-3 my-1 border-t border-line-subtle" />}
                <button
                  type="button"
                  role="option"
                  aria-selected={row.choice ? current(row.choice) : false}
                  aria-disabled={!row.choice}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(row.choice)}
                  className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left ${i === active ? "bg-raised" : "hover:bg-raised"} ${row.choice ? "" : "cursor-default opacity-60"}`}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-md bg-raised text-ink-2">{row.icon}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={`truncate text-sm ${row.choice && current(row.choice) ? "font-medium text-ink" : "text-ink"}`}>{row.name}</span>
                    {row.address && <span className="truncate text-xs text-ink-3">{row.address}</span>}
                  </span>
                </button>
              </li>
            ))}
            {rows.length === 0 && <li className="px-3 py-2 text-xs text-ink-3">Type at least 3 letters to search.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
