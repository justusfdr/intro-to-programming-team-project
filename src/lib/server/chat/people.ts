import "server-only";

// Spec 37 (ontology R65 to R68): reading the people the coach may take into account, always inside
// withUser and only through the functions the sharing screens use, which check the share and the
// contact in the database (R48): app.contact_cards (names and photos), app.shares_overview (who shares
// their calendar with the user), app.profile_card (their time zone, R43) and app.shared_calendar (their
// events at the level they share). Of the calendar only start and end of timed blocks are kept; a
// title or place that a "details" share returns is dropped here, before anything leaves this module.
// Demo contacts (R58) come from the code, only while the user has them switched on.
import { demoCalendar, demoPerson, DEMO_PEOPLE, isDemoId } from "@/lib/demo/people";
import { mergeBusy, type Interval, type NameCandidate } from "@/lib/chat/people";
import type { Query } from "@/lib/server/db";
import { readDemoContactsOn } from "@/lib/server/demo/people";
import { readProfileCards } from "@/lib/server/profiles/profile-card";
import { readPeople } from "@/lib/server/profiles/cards";
import { readSharedCalendar, readSharesOverview } from "@/lib/server/shares/read";
import type { PersonCard } from "@/lib/profiles/types";

/**
 * Someone who shares their calendar with the user right now: `key` is the contact row id (or the demo
 * id), `userId` the person's user id (null for a demo contact). Neither is ever sent to Claude.
 */
export type CoachCandidate = NameCandidate & { userId: string | null };

/** A named person as read for one request: what R66 allows to be sent, plus the server's key. */
export type CoachPerson = { key: string; name: string; timeZone: string; busy: Interval[] };

/**
 * R65: the people who share their calendar (free/busy or details) with the user now, real contacts by
 * their shown name, then the demo contacts that share one while they are switched on. `contacts` is the
 * whole contact list (to name someone who stopped sharing).
 */
export async function readCoachCandidates(query: Query): Promise<{ candidates: CoachCandidate[]; contacts: PersonCard[] }> {
  const [people, overview, demoOn] = await Promise.all([readPeople(query), readSharesOverview(query), readDemoContactsOn(query)]);
  const sharing = new Set(overview.filter((o) => o.in.calendar !== "none").map((o) => o.contactId));
  const real = people.contacts.filter((c) => sharing.has(c.id)).map((c) => ({ key: c.id, name: c.name, userId: c.userId }));
  const demo = demoOn
    ? DEMO_PEOPLE.filter((p) => p.shares.calendar !== "none").map((p) => ({ key: p.id as string, name: p.name, userId: null }))
    : [];
  return { candidates: [...real, ...demo], contacts: people.contacts };
}

/** Only the start and end of the timed blocks: all-day events never block a time (R29). */
function timedOnly(events: readonly { allDay: boolean; startAt?: string; endAt?: string }[]): Interval[] {
  return events.flatMap((e) => (!e.allDay && e.startAt && e.endAt ? [{ startAt: new Date(e.startAt), endAt: new Date(e.endAt) }] : []));
}

/**
 * The busy times of one candidate in [from, until), merged (R66), read at this moment through the
 * share (so a withdrawn share gives nothing: the caller checked the share in the same transaction).
 */
export async function readBusy(query: Query, candidate: CoachCandidate, from: Date, until: Date): Promise<Interval[]> {
  if (candidate.userId === null) {
    const person = isDemoId(candidate.key) ? demoPerson(candidate.key) : null;
    const answer = person ? demoCalendar(person, from, until) : null;
    return mergeBusy(answer ? timedOnly(answer.events) : [], from, until);
  }
  const answer = await readSharedCalendar(query, candidate.userId, from, until);
  return mergeBusy(timedOnly(answer.events), from, until);
}

/** R66: the named people with their time zone and busy times in [from, until), in the order given. */
export async function readCoachPeople(query: Query, named: readonly CoachCandidate[], from: Date, until: Date): Promise<CoachPerson[]> {
  const realIds = named.flatMap((c) => (c.userId ? [c.userId] : []));
  const [cards, busy] = await Promise.all([
    realIds.length > 0 ? readProfileCards(query, realIds) : Promise.resolve([]),
    Promise.all(named.map((c) => readBusy(query, c, from, until))),
  ]);
  return named.map((c, i) => {
    const timeZone = c.userId === null ? (demoPerson(c.key)?.timeZone ?? "UTC") : (cards.find((card) => card.userId === c.userId)?.timeZone ?? "UTC");
    return { key: c.key, name: c.name, timeZone, busy: busy[i] };
  });
}
