"use client";

// The small pills under the title, as in the prototype (its Badge): Done, and ours: Repeating (R28),
// From Outlook (R11), Not sent to Outlook (R26), Overlaps another event (R10). Nothing when none applies.
import type { ReactNode } from "react";
import { CalendarDays, TriangleAlert } from "lucide-react";
import { NotSentIcon } from "@/components/ui/icons";
import type { CalendarEvent } from "@/lib/events/types";

function Badge({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-medium ${className}`}>{children}</span>;
}

export function EditorChips({ event }: { event: CalendarEvent }) {
  const done = event.status === "done";
  const repeating = event.seriesId !== null;
  const fromOutlook = event.source === "outlook";
  const conflict = !event.allDay && event.conflict;
  if (!done && !repeating && !fromOutlook && !event.notSent && !conflict) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {done && <Badge className="bg-success-soft text-success">Done</Badge>}
      {repeating && <Badge className="bg-raised text-ink-2">Repeating</Badge>}
      {fromOutlook && (
        <Badge className="bg-raised text-ink-2">
          <CalendarDays className="size-3 text-ink-3" strokeWidth={2} />
          From Outlook
        </Badge>
      )}
      {event.notSent && (
        <Badge className="bg-danger-soft text-danger">
          <NotSentIcon className="size-3" />
          Not sent to Outlook
        </Badge>
      )}
      {conflict && (
        <Badge className="bg-danger-soft text-danger">
          <TriangleAlert className="size-3" strokeWidth={2} />
          Overlaps another event
        </Badge>
      )}
    </div>
  );
}
