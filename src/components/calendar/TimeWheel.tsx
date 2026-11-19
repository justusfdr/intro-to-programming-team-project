"use client";

// Choosing a time as in the iPhone's Clock app: two columns that scroll, hours 00 to 23 on the left and
// minutes 00 to 59 on the right, both going round and round (after 23 comes 00, after 59 comes 00); the
// row in the middle is the chosen time. The time can also be typed
// in its field as "HH:MM". Anything else is refused with a message and changes nothing.
// The rules themselves live in src/lib/time/wheel.ts.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  COPIES,
  HOME_COPY,
  HOURS,
  MINUTES,
  cyclicIndex,
  formatClock,
  hourFormat,
  homeScrollTop,
  maskClockTyping12,
  maskTimeTyping,
  nearestScrollTop,
  needsRecentre,
  pad2,
  parseClock,
  withHour,
  withMinute,
  wrapStep,
} from "@/lib/time/wheel";
import { useDisplay } from "@/components/shell/DisplayProvider";
import { inputClass } from "./fields";

/** Height of one row of the wheel, in pixels. Five rows are visible, the middle one is chosen. */
export const ROW = 32;
const VISIBLE = 5;
/** Space above and below the middle row; the band behind the chosen row starts here. */
export const SIDE = ((VISIBLE - 1) / 2) * ROW;

/**
 * The time as a field ("09:30"). Typing shows only digits and puts the colon in by itself; a complete
 * time is taken at once, otherwise on Enter or when the field is left. A refused time shows why and
 * keeps the old one. Esc puts the old time back.
 */
export function TimeField({
  label,
  value,
  onChange,
  onOpen,
  open = false,
}: {
  label: string;
  value: number;
  onChange: (min: number) => void;
  /** The field was clicked or focused: show its wheel. */
  onOpen?: () => void;
  /** Its wheel is showing. */
  open?: boolean;
}) {
  const errorId = useId();
  const { timeFormat } = useDisplay();
  const show = (min: number) => formatClock(min, timeFormat);
  const [text, setText] = useState(show(value));
  const [error, setError] = useState<string | null>(null);
  // A new time from outside (the wheel, a length chip) replaces what is typed.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setText(show(value));
    setError(null);
  }

  const commit = (typed: string) => {
    if (typed === show(value)) return setError(null);
    const parsed = parseClock(typed, timeFormat);
    if (!parsed.ok) return setError(parsed.message);
    setError(null);
    onChange(parsed.min);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      // Enter takes the time; it does not send the form.
      e.preventDefault();
      commit(text);
    } else if (e.key === "Escape" && (error !== null || text !== show(value))) {
      // Esc first undoes the typing; only the next Esc closes anything.
      e.preventDefault();
      setText(show(value));
      setError(null);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <input
        type="text"
        inputMode={timeFormat === "24h" ? "numeric" : "text"}
        autoComplete="off"
        aria-label={label}
        data-open={open || undefined}
        aria-invalid={error !== null}
        aria-describedby={error ? errorId : undefined}
        placeholder={timeFormat === "24h" ? "HH:MM" : "8:30am"}
        // No maxLength: a pasted " 09:30" must not be cut before the digits are picked out of it.
        value={text}
        onFocus={onOpen}
        onClick={onOpen}
        onChange={(e) => {
          if (timeFormat === "12h") {
            // 12h: taken at once only when it ends in am/pm; "10:30" may still become "10:30pm".
            const shown = maskClockTyping12(e.target.value);
            setText(shown);
            if (/m$/.test(shown) && parseClock(shown, timeFormat).ok) commit(shown);
            else setError(null);
            return;
          }
          const shown = maskTimeTyping(e.target.value);
          setText(shown);
          if (shown.length === 5) commit(shown);
          else setError(null);
        }}
        onBlur={() => commit(text)}
        onKeyDown={onKeyDown}
        className={`${inputClass} text-center tabular ${error ? "border-danger focus:border-danger" : ""}`}
      />
      {error && (
        <p id={errorId} role="alert" className="text-xs leading-snug text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** The two scrolling columns for one time: hours left, minutes right. */
export function TimeWheel({ label, value, onChange }: { label: string; value: number; onChange: (min: number) => void }) {
  const { timeFormat } = useDisplay();
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  return (
    <div role="group" aria-label={`${label} time`} className="relative mx-auto flex items-center justify-center gap-1 select-none">
      {/* The band behind the middle row. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 rounded-lg bg-raised" style={{ top: SIDE, height: ROW }} />
      <WheelColumn label={`${label} hour`} items={HOURS} selected={hour} onPick={(h) => onChange(withHour(value, h))} format={hourFormat(timeFormat)} wide={timeFormat === "12h"} />
      <span aria-hidden className="relative text-lg font-medium text-ink">
        :
      </span>
      <WheelColumn label={`${label} minute`} items={MINUTES} selected={minute} onPick={(m) => onChange(withMinute(value, m))} />
    </div>
  );
}

/**
 * One column. Scrolling (mouse wheel, trackpad, finger) stops on a row; the row in the middle is taken
 * when the scrolling stops. A click on a row takes it too. Keys: ↑ ↓, Page Up/Down (5 rows), Home, End; ↑ at the first row goes to the last and the other way round.
 * Also used for the custom length on the Focus page, where rows show "0" instead of "00".
 */
export function WheelColumn({
  label,
  items,
  selected,
  onPick,
  format = pad2,
  wide = false,
}: {
  label: string;
  items: readonly number[];
  selected: number;
  onPick: (item: number) => void;
  /** How a row shows its number; two digits unless told otherwise. */
  format?: (item: number) => string;
  /** A little wider, for labels such as "12 am". */
  wide?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const placed = useRef(false);
  // Where the column is moving by itself (after a click, a key or a typed time). Until it gets there,
  // the rows it passes are not taken. A hand on the column (wheel, finger, mouse) ends that at once.
  const target = useRef<number | null>(null);

  // The chosen row stands in the middle: at once when the wheel opens, smoothly after that.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const index = items.indexOf(selected);
    // The first time: straight to the home copy. After that: the nearest copy, so 23 to 00 is one row.
    const top = placed.current ? nearestScrollTop(el.scrollTop, index, ROW, items.length) : homeScrollTop(index, ROW, items.length);
    if (Math.abs(el.scrollTop - top) > 1) {
      target.current = placed.current ? top : null;
      el.scrollTo({ top, behavior: placed.current ? "smooth" : "auto" });
    }
    placed.current = true;
  }, [items, selected]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const settle = () => {
    const el = ref.current;
    if (!el) return;
    if (target.current !== null) {
      if (Math.abs(el.scrollTop - target.current) > 1) return;
      target.current = null;
    }
    const index = cyclicIndex(el.scrollTop, ROW, items.length);
    // Far from the middle copy: jump back to it, where the same numbers stand (nothing shows). Not for every
    // pass from 23 to 00: a jump cuts a gliding scroll short, which showed as a hitch.
    if (needsRecentre(el.scrollTop, ROW, items.length)) el.scrollTo({ top: homeScrollTop(index, ROW, items.length), behavior: "instant" });
    const item = items[index];
    if (item !== selected) onPick(item);
  };

  const handOn = () => {
    target.current = null;
  };

  const step = (by: number) => {
    onPick(items[wrapStep(items.indexOf(selected), by, items.length)]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, () => void> = {
      ArrowUp: () => step(-1),
      ArrowDown: () => step(1),
      PageUp: () => step(-VISIBLE),
      PageDown: () => step(VISIBLE),
      Home: () => onPick(items[0]),
      End: () => onPick(items[items.length - 1]),
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    move();
  };

  return (
    <div
      ref={ref}
      role="listbox"
      tabIndex={0}
      aria-label={label}
      aria-activedescendant={`${id}-${selected}`}
      onKeyDown={onKeyDown}
      onWheel={handOn}
      onTouchStart={handOn}
      onPointerDown={handOn}
      onScroll={() => {
        clearTimeout(timer.current);
        timer.current = setTimeout(settle, 120);
      }}
      className={`relative ${wide ? "w-[4.5rem]" : "w-14"} snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-lg [scrollbar-width:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 [&::-webkit-scrollbar]:hidden`}
      style={{
        height: ROW * VISIBLE,
        paddingBlock: SIDE,
        maskImage: "linear-gradient(to bottom, transparent, black 35%, black 65%, transparent)",
      }}
    >
      {Array.from({ length: COPIES }, (_, copy) =>
        items.map((item) => {
          const home = copy === HOME_COPY;
          return (
            <div
              key={`${copy}-${item}`}
              // Only the home copy is for screen readers and keys; the others are the same numbers again.
              {...(home ? { id: `${id}-${item}`, role: "option", "aria-selected": item === selected } : { "aria-hidden": true })}
              onClick={() => onPick(item)}
              className={`flex snap-center items-center justify-center tabular cursor-pointer ${
                item === selected ? "text-lg font-medium text-ink" : "text-base text-ink-3"
              }`}
              style={{ height: ROW }}
            >
              {format(item)}
            </div>
          );
        }),
      )}
    </div>
  );
}
