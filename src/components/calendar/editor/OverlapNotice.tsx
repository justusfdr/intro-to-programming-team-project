"use client";

// The overlap question (issue #106): shown in the calendar right after an event was dropped where it, or
// the trip to it, shares time with another event. Not an error: it asks. "That's fine" accepts it for this
// event (may_overlap), "Move it" (after a drop: "Put it back") puts the event back where it was so it can be
// moved elsewhere, "Delete event" deletes the whole event. The three buttons look the same: white, black under the pointer or when pressed.
import { TriangleAlert } from "lucide-react";
import { useDisplay } from "@/components/shell/DisplayProvider";
import type { Overlap } from "@/lib/events/conflicts";
import { fmtRange } from "@/lib/time/display";
import { localTimeOf } from "@/lib/time/zoned";

type Props = {
  overlap: Overlap;
  timeZone: string;
  onFine: () => void;
  onMove: () => void;
  onDiscard: () => void;
  /** True when the question follows a drop: the middle button then says what it does, "Put it back". */
  afterDrop?: boolean;
};

const button =
  "h-8 rounded-full border border-line bg-surface px-3.5 text-xs font-semibold text-ink transition-colors hover:border-ink hover:bg-ink hover:text-white active:bg-ink active:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30";

export function OverlapNotice({ overlap, timeZone, onFine, onMove, onDiscard, afterDrop = false }: Props) {
  const { timeFormat } = useDisplay();
  const { other } = overlap;
  const when = fmtRange(localTimeOf(other.startAt, timeZone), localTimeOf(other.endAt, timeZone), timeFormat);
  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="flex items-start gap-2 text-[13px] leading-snug text-ink">
        <TriangleAlert className="mt-px size-4 shrink-0 text-warning" strokeWidth={2} aria-hidden />
        <span>
          {overlap.kind === "event" ? "Overlaps with " : "Your trip here runs into "}
          <strong className="font-semibold">{other.title}</strong> <span className="text-ink-3">({when})</span>
        </span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={onFine} className={button}>
          That&apos;s fine
        </button>
        <button type="button" onClick={onMove} className={button}>
          {afterDrop ? "Put it back" : "Move it"}
        </button>
        <button type="button" onClick={onDiscard} className={button}>
          Delete event
        </button>
      </div>
    </div>
  );
}
