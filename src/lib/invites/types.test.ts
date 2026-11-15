// The pure rules of spec 36's screens: how an answer is said and drawn (R61), why the owner cannot invite
// (R59), and the one made-up invitation from the demo contact Lea.
import { describe, expect, it } from "vitest";
import { demoInvite, demoInviteFor, openDemoInvite } from "@/lib/demo/invite";
import { answerWords, inviteBlockedReason, inviteesSummary, inviteLook, invitationsText, personAnswerLabel, sameInvitees } from "./types";

describe("answers in words and looks (R61)", () => {
  it("names each answer and draws pending dashed, maybe lighter, accepted solid and declined not at all", () => {
    expect(personAnswerLabel("Emily Lea", "accepted")).toBe("Emily Lea: accepted");
    expect(answerWords("tentative")).toBe("maybe");
    expect(answerWords("pending")).toBe("no answer yet");
    expect(answerWords("declined")).toBe("declined");
    expect(inviteLook("pending")).toBe("dashed");
    expect(inviteLook("tentative")).toBe("tentative");
    expect(inviteLook("accepted")).toBe("solid");
    expect(inviteLook("declined")).toBeNull();
    expect(inviteesSummary([])).toBe("");
    expect(inviteesSummary([{ userId: "u1", name: "Ben", photoUrl: null, answer: "accepted" }, { userId: "u2", name: "Dora", photoUrl: null, answer: "pending" }])).toBe(
      "2 invited: Ben accepted, Dora no answer yet",
    );
    expect(invitationsText(1)).toBe("1 invitation");
    expect(invitationsText(2)).toBe("2 invitations");
  });
});

describe("who can invite (R59)", () => {
  it("only a single event of the app or the coach that has not ended", () => {
    expect(inviteBlockedReason({ source: "app", seriesId: null }, false)).toBeNull();
    expect(inviteBlockedReason({ source: "assistant", seriesId: null }, false)).toBeNull();
    expect(inviteBlockedReason({ source: "outlook", seriesId: null }, false)).toBe("Outlook events cannot invite people");
    expect(inviteBlockedReason({ source: "app", demo: true, seriesId: null }, false)).toBe("Demo events cannot invite people");
    expect(inviteBlockedReason({ source: "app", seriesId: "s1" }, false)).toBe("Events of a series cannot invite people");
    expect(inviteBlockedReason({ source: "app", seriesId: null }, true)).toBe("This event has ended");
  });

  it("the chosen list differs only when its members differ", () => {
    expect(sameInvitees(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameInvitees(["a"], ["a", "b"])).toBe(false);
    expect(sameInvitees([], [])).toBe(true);
  });
});

describe("the demo invitation", () => {
  it("is Lea's Friday group meeting of the current week, in her zone, pending, never a uuid", () => {
    const now = new Date("2026-11-16T09:00:00Z"); // a Monday
    const invite = demoInvite(now)!;
    expect(invite).toMatchObject({ inviteId: "demo-lea-invite", title: "Group project meeting", answer: "pending", demo: true, allDay: false });
    expect(invite.allDay === false && invite.startAt).toBe("2026-11-20T11:00:00.000Z");
    expect(invite.inviter).toEqual({ userId: "demo-lea", name: "Lea Sousa", photoUrl: null, demo: { initials: "LS", color: "#0f766e" } });
    expect(demoInviteFor(now, new Date("2026-11-16T00:00:00Z"), new Date("2026-11-23T00:00:00Z"))).not.toBeNull();
    expect(demoInviteFor(now, new Date("2026-11-23T00:00:00Z"), new Date("2026-11-30T00:00:00Z"))).toBeNull();
    expect(openDemoInvite(now)).not.toBeNull();
    // Saturday: the meeting has ended, so it is no longer open.
    expect(openDemoInvite(new Date("2026-11-21T09:00:00Z"))).toBeNull();
  });
});
