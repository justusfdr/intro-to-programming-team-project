import type { WeekEvent } from "@/lib/events/types";
import { DeleteEvent } from "./DeleteEvent";
import { EditEvent } from "./EditEvent";
import { EventStatusToggle } from "./EventStatusToggle";

/** One event in its day: time, title, the conflict mark and the done mark, and its actions. */
export function EventItem({ event }: { event: WeekEvent }) {
  const end = event.endDay ? `${event.endTime} (next day)` : event.endTime;
  return (
    <li
      className={`rounded-xl border px-3 py-2 text-sm ${
        event.conflict ? "border-danger bg-danger-soft" : "border-line-subtle bg-surface"
      }`}
    >
      <p className="tabular text-xs text-ink-2">
        <time dateTime={event.startAt}>{event.startTime}</time>–<time dateTime={event.endAt}>{end}</time>
      </p>
      <p className={`mt-0.5 font-medium break-words ${event.status === "done" ? "text-ink-2 line-through" : ""}`}>
        {event.title}
      </p>
      {(event.conflict || event.status === "done") && (
        <p className="mt-1 flex flex-wrap gap-1 text-xs">
          {event.conflict && <span className="rounded-md bg-danger px-1.5 py-0.5 font-medium text-white">Conflict</span>}
          {event.status === "done" && <span className="rounded-md bg-success-soft px-1.5 py-0.5 text-success">Done</span>}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-1 empty:hidden">
        <EventStatusToggle event={event} />
        <EditEvent event={event} />
        <DeleteEvent event={event} />
      </div>
    </li>
  );
}
