import "server-only";

// Reading shares (spec 53, from spec 29): the overview for the People page, the people who share their
// calendar with the signed-in user (calendar page) and a shared calendar's window. Everything comes from
// the database functions of 20261204000000_shares.sql, which check the share and the contact themselves
// and return only the reduced shape (R56). This module only renames the columns and keeps to the
// allow-list of keys in src/lib/shares/types.ts. It is the only place that asks app.shared_calendar
// (a test checks this, E12).
import type { Query } from "@/lib/server/db";
import { readPeople } from "@/lib/server/profiles/cards";
import type { PersonCard } from "@/lib/profiles/types";
import {
  NOTHING_SHARED,
  type CalendarLevel,
  type ContactShares,
  type SharedCalendarAnswer,
  type SharedEvent,
  type SharingPerson,
} from "@/lib/shares/types";

type OverviewRow = { direction: "in" | "out"; contact_id: string; user_id: string; calendar: CalendarLevel; focus: boolean };

/** Per contact row: what the user shares and what is shared with them. Contacts without any share are left out. */
export async function readSharesOverview(query: Query): Promise<ContactShares[]> {
  const rows = await query<OverviewRow>("select direction, contact_id, user_id, calendar, focus from app.shares_overview()");
  const byContact = new Map<string, ContactShares>();
  for (const row of rows) {
    const entry = byContact.get(row.contact_id) ?? { contactId: row.contact_id, userId: row.user_id, out: NOTHING_SHARED, in: NOTHING_SHARED };
    entry[row.direction] = { calendar: row.calendar, focus: row.focus };
    byContact.set(row.contact_id, entry);
  }
  return [...byContact.values()];
}

/** The contacts who share their calendar with the user, by name, with their card. */
export function sharingPeople(contacts: PersonCard[], overview: ContactShares[]): SharingPerson[] {
  const people: SharingPerson[] = [];
  for (const card of contacts) {
    const shared = overview.find((o) => o.contactId === card.id)?.in ?? NOTHING_SHARED;
    if (shared.calendar === "none") continue;
    people.push({ userId: card.userId, name: card.name, photoUrl: card.photoUrl, calendar: shared.calendar, focus: shared.focus });
  }
  return people;
}

/** The overview and the contacts' cards in one go (both reads without parameters, so they travel together). */
export async function readSharingPeople(query: Query): Promise<SharingPerson[]> {
  const [people, overview] = await Promise.all([readPeople(query), readSharesOverview(query)]);
  return sharingPeople(people.contacts, overview);
}

type CalendarRow = {
  level: "busy" | "details";
  all_day: boolean;
  start_at: Date | string | null;
  end_at: Date | string | null;
  first_day: string | null;
  last_day: string | null;
  title: string | null;
  location: string | null;
};

const iso = (value: Date | string) => new Date(value).toISOString();

/**
 * The owner's calendar between `from` and `to` for the signed-in user. The database refuses with
 * "Not found" (no share, no contact, no such user) or "Choose at most 62 days".
 */
export async function readSharedCalendar(query: Query, owner: string, from: Date, to: Date): Promise<SharedCalendarAnswer> {
  const rows = await query<CalendarRow>(
    `select level, all_day, start_at, end_at, first_day::text as first_day, last_day::text as last_day, title, location
       from app.shared_calendar($1::uuid, $2::timestamptz, $3::timestamptz)`,
    [owner, from.toISOString(), to.toISOString()],
  );
  // Each row says its level; an empty window asks the share row itself (the viewer may read it, and the
  // function above has already refused when there is none).
  const level =
    rows[0]?.level ??
    (await query<{ calendar: "busy" | "details" }>("select calendar from app.shares where owner = $1::uuid and viewer = auth.uid()", [owner]))[0]?.calendar;
  const details = level === "details";
  const events: SharedEvent[] = rows.map((row) => {
    const text = details ? { title: row.title ?? "", location: row.location } : {};
    return row.all_day
      ? { allDay: true, firstDay: row.first_day!, lastDay: row.last_day!, ...text }
      : { allDay: false, startAt: iso(row.start_at!), endAt: iso(row.end_at!), ...text };
  });
  return { level: details ? "details" : "busy", events };
}
