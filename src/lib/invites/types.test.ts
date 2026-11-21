// The pure rules of spec 54's screens (from spec 36): how an answer is said and drawn (R61) and why the
// owner cannot invite (R59).
import { describe, expect, it } from "vitest";
import { answerWords, inviteBlockedReason, invitedEventEnded, inviteClass, inviteesSummary, inviteLook, invitationsText, personAnswerLabel, sameInvitees } from "./types";

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

  it("the look decided on 19 Nov 2026: white and dashed in ink, maybe lighter, accepted like an own event; never stripes", () => {
    expect(inviteClass("pending")).toBe("bg-surface border border-dashed border-ink-3 text-ink");
    expect(inviteClass("tentative")).toBe("bg-surface border border-dashed border-ink-3 text-ink-3");
    expect(inviteClass("accepted")).toBe("bg-raised border border-line-subtle text-ink");
    for (const answer of ["pending", "tentative", "accepted"] as const) expect(inviteClass(answer)).not.toMatch(/gradient|stripe/);
  });
});

describe("who can invite (R59)", () => {
  it("only an event of the app or the coach that has not ended (spec 65: also an event of a series)", () => {
    expect(inviteBlockedReason({ source: "app", seriesId: null }, false)).toBeNull();
    expect(inviteBlockedReason({ source: "assistant", seriesId: null }, false)).toBeNull();
    expect(inviteBlockedReason({ source: "outlook", seriesId: null }, false)).toBe("Outlook events cannot invite people");
    expect(inviteBlockedReason({ source: "app", demo: true, seriesId: null }, false)).toBe("Demo events cannot invite people");
    expect(inviteBlockedReason({ source: "app", seriesId: "s1" }, false)).toBeNull();
    expect(inviteBlockedReason({ source: "app", seriesId: null }, true)).toBe("This event has ended");
  });

  it("the chosen list differs only when its members differ", () => {
    expect(sameInvitees(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameInvitees(["a"], ["a", "b"])).toBe(false);
    expect(sameInvitees([], [])).toBe(true);
  });
});

describe("whether an invited event has ended (spec 64)", () => {
  it("a timed event at its end, an all-day event after its last day on the viewer's clock", () => {
    const timed = { allDay: false as const, endAt: "2026-11-20T12:00:00.000Z" };
    expect(invitedEventEnded(timed, Date.parse("2026-11-20T11:59:00.000Z"), "UTC")).toBe(false);
    expect(invitedEventEnded(timed, Date.parse("2026-11-20T12:00:00.000Z"), "UTC")).toBe(true);
    const allDay = { allDay: true as const, lastDay: "2026-11-20" };
    expect(invitedEventEnded(allDay, Date.parse("2026-11-20T23:30:00.000Z"), "UTC")).toBe(false);
    expect(invitedEventEnded(allDay, Date.parse("2026-11-21T00:30:00.000Z"), "UTC")).toBe(true);
    // Still the 20th in New York.
    expect(invitedEventEnded(allDay, Date.parse("2026-11-21T00:30:00.000Z"), "America/New_York")).toBe(false);
  });
});
