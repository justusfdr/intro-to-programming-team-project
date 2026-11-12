"use client";

// The title in the calendar's header as a button, copied from the first prototype: it opens a small
// month calendar to jump straight to a day (and with its arrows to another month).
import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { FloatingPanel, anchorOf, type Anchor } from "./FloatingPanel";
import { MiniMonth } from "./MiniMonth";

export function DateJumpTitle({
  title,
  valueKey,
  todayKey,
  onPick,
}: {
  title: string;
  /** The chosen day ("YYYY-MM-DD"), marked in the month calendar. */
  valueKey: string;
  todayKey: string;
  onPick: (dayKey: string) => void;
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  // The open panel closes already on pointerdown on this button; remember that it was open.
  const wasOpen = useRef(false);

  return (
    <>
      <h1 className="min-w-0">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={anchor !== null}
          title="Jump to a date"
          onPointerDown={() => {
            wasOpen.current = anchor !== null;
          }}
          onClick={(e) => {
            if (wasOpen.current) {
              wasOpen.current = false;
              setAnchor(null);
            } else {
              setAnchor(anchorOf(e.currentTarget));
            }
          }}
          className="group -mx-1.5 inline-flex max-w-full items-center gap-1 rounded-lg px-1.5 text-left transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
        >
          <span className="truncate text-[22px] font-semibold leading-[28px] tracking-heading text-ink @xl:text-[28px] @xl:leading-[34px]">
            {title}
          </span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-ink-3 transition-colors group-hover:text-ink" strokeWidth={2} />
        </button>
      </h1>
      {anchor && (
        <FloatingPanel anchor={anchor} label="Jump to a date" width={292} onClose={() => setAnchor(null)}>
          <div className="flex justify-center p-4">
            <MiniMonth
              value={valueKey}
              todayKey={todayKey}
              onChange={(dayKey) => {
                setAnchor(null);
                onPick(dayKey);
              }}
            />
          </div>
        </FloatingPanel>
      )}
    </>
  );
}
