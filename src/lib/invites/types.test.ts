// The pure rules of spec 54's screens (from spec 36): how an answer is said and drawn (R61) and why the
// owner cannot invite (R59).
import { describe, expect, it } from "vitest";
import { answerWords, inviteBlockedReason, inviteClass, inviteesSummary, inviteLook, invitationsText, personAnswerLabel, sameInvitees } from "./types";

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
