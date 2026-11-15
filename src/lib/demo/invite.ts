// The one made-up invitation (spec 36): while the demo contacts are on, Lea (src/lib/demo/people.ts)
// invites the user to her "Group project meeting" of this week, so the owner can try answering alone.
// Generated in code like the demo calendars: never a row, never sent anywhere. The answer is kept in the
// browser only (./invite-answer.ts on the screen); here it is always "pending".
import { DEMO_PEOPLE } from "@/lib/demo/people";
import type { InvitedEvent } from "@/lib/invites/types";
import { addDays, localDateOf, mondayOf, parseLocalDateTime } from "@/lib/time/zoned";

/** The invitation's id: fixed, never a uuid, so no server action ever takes it. */
export const DEMO_INVITE_ID = "demo-lea-invite";

/** Lea's Friday group meeting of the current week, in her own time zone (Europe/Lisbon). */
export function demoInvite(now: Date): InvitedEvent | null {
  const lea = DEMO_PEOPLE.find((p) => p.id === "demo-lea");
  if (!lea) return null;
  const slot = lea.week.find((s) => s.day === 4 && s.title === "Group project meeting");
  if (!slot) return null;
  const date = addDays(mondayOf(localDateOf(now, lea.timeZone)), slot.day);
  const startAt = parseLocalDateTime(`${date}T${slot.from}`, lea.timeZone);
  const endAt = parseLocalDateTime(`${date}T${slot.to}`, lea.timeZone);
  if (!startAt || !endAt) return null;
  return {
    inviteId: DEMO_INVITE_ID,
    answer: "pending",
    inviter: { userId: lea.id, name: lea.name, photoUrl: null, demo: lea.look },
    title: slot.title,
    location: slot.location,
    allDay: false,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    demo: true,
  };
}

/** The demo invitation when it falls into [from, to) and has not ended at `now`; else null. */
export function demoInviteFor(now: Date, from: Date, to: Date): InvitedEvent | null {
  const invite = demoInvite(now);
  if (!invite || invite.allDay) return null;
  return Date.parse(invite.startAt) < to.getTime() && Date.parse(invite.endAt) > from.getTime() ? invite : null;
}

/** The demo invitation for the open list: only while it has not ended. */
export function openDemoInvite(now: Date): InvitedEvent | null {
  const invite = demoInvite(now);
  if (!invite || invite.allDay) return null;
  return Date.parse(invite.endAt) > now.getTime() ? invite : null;
}
