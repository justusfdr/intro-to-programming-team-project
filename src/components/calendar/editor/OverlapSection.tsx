"use client";

// Ours, at the end of the sections: whether the event may overlap others (R10). Not for all-day events
// or Outlook events.
import { Eyebrow } from "../fields";

export function OverlapSection({ value, onChange }: { value: boolean; onChange: (mayOverlap: boolean) => void }) {
  return (
    <section className="flex flex-col gap-1.5">
      <Eyebrow>Overlap</Eyebrow>
      <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink">
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-ink" />
        May overlap other events
      </label>
    </section>
  );
}
