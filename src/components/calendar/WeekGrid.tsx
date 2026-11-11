import type { WeekData } from "@/lib/events/types";
import { EventItem } from "./EventItem";

/** Monday to Sunday, each day with its events in start order. A list per day, readable by screen readers. */
export function WeekGrid({ week }: { week: WeekData }) {
  return (
    <ol className="grid gap-3 md:grid-cols-7" aria-label="Days of the week">
      {week.days.map((day) => (
        <li key={day.date} className={`min-w-0 rounded-card p-2 ${day.isToday ? "bg-raised" : ""}`}>
          <h2 className="px-1 text-sm font-semibold">
            {day.label}
            {day.isToday && <span className="ml-1 font-normal text-ink-2">(today)</span>}
          </h2>
          {day.events.length === 0 ? (
            <p className="px-1 pt-1 text-xs text-ink-3">No events</p>
          ) : (
            <ul className="mt-2 grid gap-2">
              {day.events.map((event) => (
                <EventItem key={event.id} event={event} />
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
