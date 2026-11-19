// A person named outside their own card or profile (spec 53, from spec 33): avatar and shown name, one
// plain link to their profile page. Also the small marks of what a person shares with the viewer, and
// the addresses of a person's profile page and of the calendar showing their calendar.
// Name and photo are rendered as text and an image from our own route only.
import Link from "next/link";
import { CalendarClock, CalendarDays } from "lucide-react";
import { Avatar, type AvatarSize } from "@/components/ui/Avatar";
import { shareMarks, type ShareMark } from "@/lib/people/present";
import type { ShareSetting } from "@/lib/shares/types";

/** What a chip needs of a person. */
export type ChipPerson = { userId: string; name: string; photoUrl: string | null };

export const profileHref = (userId: string) => `/people/${encodeURIComponent(userId)}`;
export const calendarHref = (userId: string) => `/?share=${encodeURIComponent(userId)}`;

const MARK_ICON: Record<ShareMark["kind"], typeof CalendarClock> = {
  "calendar-busy": CalendarClock,
  "calendar-details": CalendarDays,
};

/** Small quiet icons of what the person shares with the viewer, each with its words for screen readers. */
export function ShareMarks({ shared, className = "" }: { shared: ShareSetting | null | undefined; className?: string }) {
  const marks = shareMarks(shared);
  if (marks.length === 0) return null;
  return (
    <ul aria-label="Shares with you" className={`flex items-center gap-1.5 text-ink-3 ${className}`}>
      {marks.map((mark) => {
        const Icon = MARK_ICON[mark.kind];
        return (
          <li key={mark.kind} title={mark.label} className="inline-flex">
            <Icon className="size-4" strokeWidth={1.8} aria-hidden="true" />
            <span className="sr-only">{mark.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function PersonChip({ person, size = 24, className = "" }: { person: ChipPerson; size?: AvatarSize; className?: string }) {
  return (
    <Link
      href={profileHref(person.userId)}
      className={`inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md text-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 ${className}`}
    >
      <Avatar name={person.name} photoUrl={person.photoUrl} size={size} />
      <span className="min-w-0 truncate">{person.name}</span>
    </Link>
  );
}
