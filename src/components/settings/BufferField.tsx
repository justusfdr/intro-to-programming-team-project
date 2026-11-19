"use client";

// The travel buffer: chips "5 min", "10 min", "15 min" and "Custom", as the length on the Focus page.
// "Custom" opens a scrolling wheel like the iPhone's Clock app (the same WheelColumn as the Focus page's
// custom length), with every minute from 0 to 120, the range the database allows (update_settings).
// A saved value that is not one of the chips shows as "Custom", with the wheel on that value.
// The wheel saves a moment after it stops, so stepping through ten minutes with the arrow keys is one save.
import { useEffect, useRef, useState } from "react";
import { ROW, SIDE, WheelColumn } from "@/components/calendar/TimeWheel";
import { FieldRow, SegmentedField, type FieldOption } from "./fields";

/** The chips' minutes. */
export const BUFFER_CHIPS = [5, 10, 15] as const;
/** Every minute the wheel offers: 0 to 120. */
export const BUFFER_MINUTES: readonly number[] = Array.from({ length: 121 }, (_, min) => min);
/** How long the wheel rests before its value is saved, in milliseconds. */
const WHEEL_SAVE_DELAY = 500;

type Choice = number | "custom";

const OPTIONS: FieldOption<Choice>[] = [...BUFFER_CHIPS.map((min) => ({ value: min, label: `${min} min` })), { value: "custom", label: "Custom" }];

/** Whether a saved buffer is one of the chips (otherwise it shows as "Custom"). */
export const isBufferChip = (min: number) => (BUFFER_CHIPS as readonly number[]).includes(min);

/** The row "Buffer" of the Travel card: label and chips, and under them the wheel while Custom is chosen. */
export function BufferField({
  value,
  onSave,
  labelId,
  hintId,
  disabled = false,
}: {
  /** The saved buffer in minutes. */
  value: number;
  /** Saves a new buffer; resolves once the answer is there. */
  onSave: (minutes: number) => Promise<unknown>;
  /** id of the row's label, which names the chips. */
  labelId: string;
  /** id of the row's hint. */
  hintId: string;
  disabled?: boolean;
}) {
  // "Custom" stays chosen after a click, even when the wheel then lands on 5, 10 or 15.
  const [customOpen, setCustomOpen] = useState(false);
  const custom = customOpen || !isBufferChip(value);
  // Where the wheel stands while its value waits to be saved.
  const [pending, setPending] = useState<number | null>(null);
  const shown = pending ?? value;

  // The latest save function, so a new one on every render does not restart the wait.
  const saveRef = useRef(onSave);
  useEffect(() => {
    saveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    if (pending === null) return;
    const timer = setTimeout(() => {
      if (pending === value) return setPending(null);
      void saveRef.current(pending).then(() => setPending((now) => (now === pending ? null : now)));
    }, WHEEL_SAVE_DELAY);
    return () => clearTimeout(timer);
  }, [pending, value]);

  return (
    // One block, so the card's dividers do not come between the chips and the wheel.
    <div>
      <FieldRow label="Buffer" labelId={labelId} hintId={hintId} hint="Extra minutes added to each trip.">
        <SegmentedField<Choice>
          value={custom ? "custom" : value}
          options={OPTIONS}
          labelledBy={labelId}
          describedBy={hintId}
          disabled={disabled}
          onChange={(choice) => {
            if (choice === "custom") return setCustomOpen(true);
            setCustomOpen(false);
            setPending(null);
            void onSave(choice);
          }}
        />
      </FieldRow>
      {/* Under the chips: on the left on phones, on the right on wider screens, as the chips. */}
      {custom && (
        <div className="flex pb-4 sm:justify-end">
          <BufferWheel value={shown} onChange={setPending} />
        </div>
      )}
    </div>
  );
}

/** One scrolling column of minutes, 0 to 120, with the band behind the chosen row (as the Focus page's wheel). */
function BufferWheel({ value, onChange }: { value: number; onChange: (minutes: number) => void }) {
  return (
    <div role="group" aria-label="Custom buffer" className="relative mx-4 flex w-fit items-center justify-center select-none">
      {/* The band behind the chosen row, as on the calendar's time wheel. */}
      <div aria-hidden className="pointer-events-none absolute -inset-x-4 rounded-lg bg-raised" style={{ top: SIDE, height: ROW }} />
      <div className="relative flex items-center gap-1.5">
        <WheelColumn label="Buffer minutes" items={BUFFER_MINUTES} selected={value} onPick={onChange} format={String} />
        <span aria-hidden className="w-8 text-sm font-medium text-ink">
          min
        </span>
      </div>
    </div>
  );
}
