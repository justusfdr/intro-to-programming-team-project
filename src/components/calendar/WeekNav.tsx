import Link from "next/link";
import type { WeekData } from "@/lib/events/types";

const linkClass = "rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:bg-raised";

/** "Previous week", "This week", "Next week". The week is in the address (?week=2026-11-16), so links can be shared and reloaded. */
export function WeekNav({ week }: { week: WeekData }) {
  return (
    <nav aria-label="Weeks" className="flex flex-wrap gap-2">
      <Link href={`/?week=${week.previous}`} className={linkClass}>
        Previous week
      </Link>
      <Link href={`/?week=${week.thisWeek}`} className={linkClass} aria-current={week.monday === week.thisWeek ? "page" : undefined}>
        This week
      </Link>
      <Link href={`/?week=${week.next}`} className={linkClass}>
        Next week
      </Link>
    </nav>
  );
}
