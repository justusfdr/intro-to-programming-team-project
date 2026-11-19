import "server-only";

// Spec 55 (R66): events the user ACCEPTED an invitation to and gave one of their own goals count for
// that goal like an own event: done (the user's own done mark on the invitation) for the rules (R8) and
// the days row (R9), planned for the days row, and in analytics as the goal's events (R49). Read through
// app.accepted_invite_goal_events (20261220000000_accepted_invite_details.sql), which returns only the
// caller's own accepted invitations to timed events with a goal, and of the owner's event only its title
// and times. Named in this module only (src/lib/server/invites/details-hygiene.test.ts).
import type { Query } from "@/lib/server/db";

export type InvitedGoalEvent = {
  /** The invitation's id: it stands in for an event id where the numbers need one (never the owner's event id). */
  id: string;
  goalId: string;
  title: string;
  startAt: Date;
  endAt: Date;
  status: "planned" | "done";
};

/** All of them (a person has few), without parameters, so it goes out with the other first reads. */
export async function readInvitedGoalEvents(query: Query): Promise<InvitedGoalEvent[]> {
  const rows = await query<{ invite_id: string; goal_id: string; title: string; start_at: Date; end_at: Date; status: "planned" | "done" }>(
    "select invite_id, goal_id, title, start_at, end_at, status from app.accepted_invite_goal_events()",
  );
  return rows.map((r) => ({ id: r.invite_id, goalId: r.goal_id, title: r.title, startAt: new Date(r.start_at), endAt: new Date(r.end_at), status: r.status }));
}

/** Those that start in [from, to). */
export function startingBetween(events: readonly InvitedGoalEvent[], from: Date, to: Date): InvitedGoalEvent[] {
  return events.filter((e) => e.startAt >= from && e.startAt < to);
}
