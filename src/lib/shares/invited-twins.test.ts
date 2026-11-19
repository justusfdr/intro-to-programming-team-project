// Spec 54: invited events drawn like shared calendars (one per inviter, declined ones left out, R61), and
// "the same event twice": a shared block of the inviter with exactly the same start and end as an
// invitation from them that is drawn is left out, so the event shows once.
import { describe, expect, it } from "vitest";
import type { InvitedEvent } from "@/lib/invites/types";
import { invitedCalendars, placeShared, sharedAllDayByDay, withoutInvitedTwins, type ShownCalendar } from "./place";

const ANA = { userId: "ana", name: "Ana", photoUrl: null };
const DORA = { userId: "dora", name: "Dora", photoUrl: null };

const timed = (inviteId: string, inviter = ANA, answer: InvitedEvent["answer"] = "pending"): InvitedEvent => ({
  inviteId,
  answer,
  inviter,
  title: "Group project meeting",
  location: "Library",
  allDay: false,
  startAt: "2026-11-20T11:00:00.000Z",
  endAt: "2026-11-20T12:00:00.000Z",
});
const allDay = (inviteId: string): InvitedEvent => ({ inviteId, answer: "accepted", inviter: ANA, title: "Trip", location: null, allDay: true, firstDay: "2026-11-21", lastDay: "2026-11-22" });

const anasShared = (level: "busy" | "details" = "details"): ShownCalendar => ({
  person: { ...ANA, calendar: level, focus: false },
  level,
  events: [
    // The same event as the invitation, as Ana's shared calendar sends it (another spelling of the same instants).
    { allDay: false, startAt: "2026-11-20T11:00:00Z", endAt: "2026-11-20T12:00:00Z", ...(level === "details" ? { title: "Group project meeting", location: "Library" } : {}) },
    { allDay: false, startAt: "2026-11-20T14:00:00.000Z", endAt: "2026-11-20T15:00:00.000Z", title: "Gym", location: null },
    { allDay: true, firstDay: "2026-11-21", lastDay: "2026-11-22", title: "Trip", location: null },
  ],
});

describe("invited events as read-only calendars", () => {
  it("groups them by inviter, marks each with its invitation and leaves declined ones out of the grid", () => {
    const calendars = invitedCalendars([timed("i1"), timed("i2", DORA), timed("i3", ANA, "declined")], (e) => e.answer);
    expect(calendars.map((c) => [c.person.userId, c.events.map((e) => e.invite?.inviteId)])).toEqual([
      ["ana", ["i1"]],
      ["dora", ["i2"]],
    ]);
    // The answer given on the screen counts at once.
    expect(invitedCalendars([timed("i1")], () => "declined")).toEqual([]);
    const [day] = placeShared(calendars, ["2026-11-20"], "UTC");
    expect(day.map((b) => [b.key, b.invite?.answer])).toEqual([
      ["invite-i1", "pending"],
      ["invite-i2", "pending"],
    ]);
  });
});

describe("the same event twice (shared and invited)", () => {
  it("leaves out the inviter's shared block with exactly the same start and end, timed and all-day, at both levels", () => {
    const invited = invitedCalendars([timed("i1"), allDay("i2")], (e) => e.answer);
    for (const level of ["details", "busy"] as const) {
      const [kept] = withoutInvitedTwins([anasShared(level)], invited);
      expect(kept.events.map((e) => (e.allDay ? `${e.firstDay}` : e.startAt))).toEqual(["2026-11-20T14:00:00.000Z"]);
    }
    // Drawn together: one block at 11:00 (the invitation), the gym, one all-day chip (the invitation).
    const calendars = [...withoutInvitedTwins([anasShared()], invited), ...invited];
    const [day] = placeShared(calendars, ["2026-11-20"], "UTC");
    expect(day.map((b) => b.key).sort()).toEqual(["ana-2026-11-20T14:00:00.000Z-2026-11-20T15:00:00.000Z-Gym", "invite-i1"]);
    expect(sharedAllDayByDay(calendars, ["2026-11-21"])[0].map((i) => i.key)).toEqual(["invite-i2"]);
  });

  it("keeps the shared block when the times differ, when another person invited, or when the invitation is declined", () => {
    const moved = { ...timed("i1"), startAt: "2026-11-20T11:30:00.000Z" } as InvitedEvent;
    expect(withoutInvitedTwins([anasShared()], invitedCalendars([moved], (e) => e.answer))[0].events).toHaveLength(3);
    expect(withoutInvitedTwins([anasShared()], invitedCalendars([timed("i1", DORA)], (e) => e.answer))[0].events).toHaveLength(3);
    expect(withoutInvitedTwins([anasShared()], invitedCalendars([timed("i1")], () => "declined"))[0].events).toHaveLength(3);
    expect(withoutInvitedTwins([anasShared()], [])[0]).toEqual(anasShared());
  });
});
