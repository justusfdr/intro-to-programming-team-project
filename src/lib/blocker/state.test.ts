import { describe, expect, it } from "vitest";
import { blockingState } from "./state";

const at = (time: string) => new Date(`2026-11-16T${time}:00Z`);
const EVENT = { startAt: at("09:00"), endAt: at("11:00") };

describe("blockingState (R15)", () => {
  it("A3: an auto-block event 09:00 to 11:00, no session: asked at 10:15, blocking on until 11:00", () => {
    expect(blockingState({ now: at("10:15"), runningSessionEnd: null, autoBlockEvents: [EVENT] })).toEqual({
      blockingOn: true,
      blockingUntil: at("11:00"),
    });
  });

  it("A3: off at 11:00 (the end is not part of the event) and before 09:00", () => {
    expect(blockingState({ now: at("11:00"), runningSessionEnd: null, autoBlockEvents: [EVENT] })).toEqual({ blockingOn: false, blockingUntil: null });
    expect(blockingState({ now: at("08:59"), runningSessionEnd: null, autoBlockEvents: [EVENT] }).blockingOn).toBe(false);
    expect(blockingState({ now: at("09:00"), runningSessionEnd: null, autoBlockEvents: [EVENT] }).blockingOn).toBe(true);
  });

  it("is on during a running session until its planned end", () => {
    expect(blockingState({ now: at("09:10"), runningSessionEnd: at("10:00"), autoBlockEvents: [] })).toEqual({
      blockingOn: true,
      blockingUntil: at("10:00"),
    });
  });

  it("takes the latest end when a session and an event overlap", () => {
    expect(blockingState({ now: at("10:15"), runningSessionEnd: at("10:30"), autoBlockEvents: [EVENT] }).blockingUntil).toEqual(at("11:00"));
    expect(blockingState({ now: at("10:15"), runningSessionEnd: at("12:00"), autoBlockEvents: [EVENT] }).blockingUntil).toEqual(at("12:00"));
  });

  it("is off with no running session and no event in progress", () => {
    expect(blockingState({ now: at("10:15"), runningSessionEnd: null, autoBlockEvents: [] })).toEqual({ blockingOn: false, blockingUntil: null });
  });
});
