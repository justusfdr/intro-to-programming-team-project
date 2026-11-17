"use client";

// The goal editor's "Routine" (spec 42): what the guided questions ask, as a compact form for a new goal
// made with the form and for editing: the category (five chips, none allowed), the own word with
// "Other", the session length, the time of day, the days it is never done on and the place (the shared
// address field with the saved places). Here the server's own limits apply (R44); the stricter one
// session a day of the questions does not. The server's message shows at the form as for any field.
// The section folds: open for a new goal, folded when editing (the card already shows the routine as
// tags), with a count of what is set; "Routine" opens it.
import { useId, useState } from "react";
import { ChevronRight } from "lucide-react";
import { AddressField } from "@/components/places/AddressField";
import { fmtWeekly } from "@/lib/goals/setup";
import {
  DAY_PART_HOURS,
  DAY_PARTS,
  EMPTY_ROUTINE,
  GOAL_CATEGORIES,
  GOAL_CATEGORY_LABELS,
  MAX_CATEGORY_OTHER,
  MAX_SESSION_MINUTES,
  MIN_SESSION_MINUTES,
  WEEKDAYS,
  type DayPart,
  type GoalCategory,
  type GoalRoutine,
  type Weekday,
} from "@/lib/goals/routine";
import type { SavedPlace } from "@/lib/places/saved";

/** The routine as the form holds it: texts as typed, "" for none. */
export type RoutineValue = {
  category: GoalCategory | null;
  categoryOther: string;
  /** "" or the minutes as text ("60"). */
  sessionMinutes: string;
  /** "" for any time. */
  dayPart: DayPart | "";
  avoidDays: Weekday[];
  location: string;
};

export function routineValue(routine: GoalRoutine | undefined): RoutineValue {
  const r = routine ?? EMPTY_ROUTINE;
  return {
    category: r.category,
    categoryOther: r.categoryOther ?? "",
    sessionMinutes: r.sessionMinutes === null ? "" : String(r.sessionMinutes),
    dayPart: r.dayPart ?? "",
    avoidDays: r.avoidDays,
    location: r.location ?? "",
  };
}

/** The routine's fields of create_goal and edit_goal: every field, null (or no days) for none. */
export function routineBody(value: RoutineValue) {
  const other = value.categoryOther.trim();
  const location = value.location.trim();
  return {
    category: value.category,
    categoryOther: value.category === "other" && other !== "" ? other : null,
    sessionMinutes: value.sessionMinutes === "" ? null : Number(value.sessionMinutes),
    dayPart: value.dayPart === "" ? null : value.dayPart,
    avoidDays: [...value.avoidDays].sort((a, b) => a - b),
    location: location === "" ? null : location,
  };
}

/** The lengths the editor offers: every 15 minutes up to the most a session may last (plus a saved length in between). */
const SESSION_OPTIONS = Array.from({ length: MAX_SESSION_MINUTES / 15 }, (_, i) => (i + 1) * 15);
const sessionOptions = (saved: string) => {
  const n = Number(saved);
  return saved === "" || SESSION_OPTIONS.includes(n) || n < MIN_SESSION_MINUTES ? SESSION_OPTIONS : [...SESSION_OPTIONS, n].sort((a, b) => a - b);
};

const labelClass = "text-xs font-medium text-ink-2";
const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/50";
const inputClass =
  "block h-10 w-full min-w-0 rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10";

const chip = (on: boolean) =>
  `inline-flex h-9 items-center rounded-full border px-3 text-xs font-medium transition-colors ${focusRing} ${
    on ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink hover:bg-raised"
  }`;

/** How many parts of the routine are set (the folded section's summary). */
export function routineCount(value: RoutineValue): number {
  return [value.category !== null, value.sessionMinutes !== "", value.dayPart !== "", value.avoidDays.length > 0, value.location.trim() !== ""].filter(Boolean).length;
}

export function RoutineSection({
  value,
  onChange,
  places = [],
  startOpen,
}: {
  value: RoutineValue;
  onChange: (value: RoutineValue) => void;
  places?: SavedPlace[];
  /** Open at first (a new goal); folded otherwise. */
  startOpen: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const bodyId = useId();
  const count = routineCount(value);
  const set = (change: Partial<RoutineValue>) => onChange({ ...value, ...change });
  return (
    <section className="flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
        className={`-ml-1 flex w-fit items-center gap-1 rounded-md pr-1 ${focusRing}`}
      >
        <ChevronRight aria-hidden className={`size-3.5 text-ink-3 transition-transform ${open ? "rotate-90" : ""}`} strokeWidth={2.2} />
        <span className={labelClass}>Routine</span>
        <span className="text-xs text-ink-3">{`· ${count === 0 ? "Nothing set" : count === 1 ? "1 detail set" : `${count} details set`}`}</span>
      </button>
      {open && <RoutineFields id={bodyId} value={value} set={set} places={places} />}
    </section>
  );
}

function RoutineFields({ id, value, set, places }: { id: string; value: RoutineValue; set: (change: Partial<RoutineValue>) => void; places: SavedPlace[] }) {
  return (
    <fieldset id={id} className="flex flex-col gap-4">
      <legend className="sr-only">Routine</legend>

      <div role="group" aria-label="Category" className="flex flex-wrap gap-1.5">
        {GOAL_CATEGORIES.map((category) => {
          const on = value.category === category;
          return (
            <button key={category} type="button" aria-pressed={on} onClick={() => set({ category: on ? null : category })} className={chip(on)}>
              {GOAL_CATEGORY_LABELS[category]}
            </button>
          );
        })}
      </div>

      {value.category === "other" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="goal-category-other" className={labelClass}>
            Your own word (optional)
          </label>
          <input
            id="goal-category-other"
            value={value.categoryOther}
            maxLength={MAX_CATEGORY_OTHER}
            placeholder="e.g. Music"
            onChange={(e) => set({ categoryOther: e.target.value })}
            className={inputClass}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="goal-session" className={labelClass}>
            Each session
          </label>
          <select id="goal-session" value={value.sessionMinutes} onChange={(e) => set({ sessionMinutes: e.target.value })} className={inputClass}>
            <option value="">None</option>
            {sessionOptions(value.sessionMinutes).map((minutes) => (
              <option key={minutes} value={String(minutes)}>
                {fmtWeekly(minutes)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="goal-day-part" className={labelClass}>
            Time of day
          </label>
          <select id="goal-day-part" value={value.dayPart} onChange={(e) => set({ dayPart: e.target.value as RoutineValue["dayPart"] })} className={inputClass}>
            <option value="">Any time</option>
            {DAY_PARTS.map((part) => (
              <option key={part} value={part}>
                {DAY_PART_HOURS[part].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span id="goal-never-on" className={labelClass}>
          Never on
        </span>
        <div role="group" aria-labelledby="goal-never-on" className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map(({ day, short, long }) => {
            const off = value.avoidDays.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-label={`${long}: ${off ? "never" : "possible"}`}
                onClick={() => set({ avoidDays: off ? value.avoidDays.filter((d) => d !== day) : [...value.avoidDays, day].sort((a, b) => a - b) })}
                className={`relative flex h-10 items-center justify-center rounded-lg border text-xs font-semibold transition-colors ${focusRing} ${
                  off ? "border-line-subtle bg-raised text-ink-3" : "border-line bg-surface text-ink hover:bg-raised"
                }`}
              >
                <span className="relative inline-flex px-0.5">
                  {short}
                  {off && <span aria-hidden className="setup-strike absolute top-1/2 -right-1 -left-1 h-[1.5px] rounded-full bg-ink-3" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="goal-place" className={labelClass}>
          Place
        </label>
        <AddressField
          id="goal-place"
          label="Place"
          placeholder="At home or anywhere"
          value={value.location}
          savedPlaces={places}
          onType={(location) => set({ location })}
          onDone={() => {}}
          revealList
        />
        {places.length > 0 && (
          <div role="group" aria-label="Saved places" className="flex flex-wrap gap-1.5">
            {places.map((place) => (
              <button key={place.id} type="button" aria-pressed={value.location.trim() === place.address} onClick={() => set({ location: place.address })} className={chip(value.location.trim() === place.address)}>
                {place.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </fieldset>
  );
}
