"use client";

// The overlap notice (issue #106): a yellow note at the top of the editor when the event, or the trip to
// it, shares time with another event. Not an error: it asks. "That's fine" accepts it for this event
// (may_overlap), "Move it" opens the start time to move the event by hand, "Discard" deletes it.
import { TriangleAlert } from "lucide-react";
import { useDisplay } from "@/components/shell/DisplayProvider";
import type { Overlap } from "@/lib/events/conflicts";
import { fmtRange } from "@/lib/time/display";
import { localTimeOf } from "@/lib/time/zoned";

type Props = {
  overlap: Overlap;
  timeZone: string;
  busy: boolean;
  onFine: () => void;
  onMove: () => void;
  onDiscard: () => void;
};

export function OverlapNotice({ overlap, timeZone, busy, onFine, onMove, onDiscard }: Props) {
  const { timeFormat } = useDisplay();
  const { other } = overlap;
  const when = fmtRange(localTimeOf(other.startAt, timeZone), localTimeOf(other.endAt, timeZone), timeFormat);
  const button = "h-7 rounded-full px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 disabled:opacity-50";
  return (
    <div role="status" className="flex flex-col gap-2 rounded-xl border border-warning/25 bg-warning-soft px-3 py-2.5">
      <p className="flex items-start gap-2 text-[13px] leading-snug text-warning">
        <TriangleAlert className="mt-px size-4 shrink-0" strokeWidth={2} aria-hidden />
        <span>
          {overlap.kind === "event" ? "Overlaps with " : "Your trip here runs into "}
          <strong className="font-semibold">{other.title}</strong> ({when})
        </span>
      </p>
      <div className="flex flex-wrap gap-1.5 pl-6">
        <button type="button" disabled={busy} onClick={onFine} className={`${button} bg-ink text-white hover:bg-ink/85`}>
          That&apos;s fine
        </button>
        <button type="button" disabled={busy} onClick={onMove} className={`${button} border border-line bg-surface text-ink hover:bg-raised`}>
          Move it
        </button>
        <button type="button" disabled={busy} onClick={onDiscard} className={`${button} text-danger hover:bg-danger-soft`}>
          Discard
        </button>
      </div>
    </div>
  );
}
