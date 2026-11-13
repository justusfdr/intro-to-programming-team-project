import { describe, expect, it } from "vitest";
import {
  clockText,
  focusedMinutes,
  isSessionLength,
  lengthForEvent,
  minutesText,
  pausedSecondsAfterResume,
  plannedEnd,
  secondsLeft,
  type SessionTimes,
} from "./session-time";

const at = (time: string) => new Date(`2026-11-16T${time}:00Z`);

function session(fields: Partial<SessionTimes>): SessionTimes {
  return { status: "running", plannedMinutes: 60, startedAt: at("09:00"), pausedAt: null, pausedSeconds: 0, endedAt: null, ...fields };
}

describe("session arithmetic (R12, R13)", () => {
  it("allows any whole number of minutes from 1 minute to 23 h 59 min (R12)", () => {
    for (const length of [1, 3, 15, 25, 30, 60, 61, 70, 90, 120, 240, 241, 600, 1438, 1439]) expect(isSessionLength(length)).toBe(true);
    for (const other of [0, -15, 1440, 2000, 60.5, "60", null, Number.NaN]) expect(isSessionLength(other)).toBe(false);
  });

  it("A2: 60 minutes from 09:00, paused 09:20 to 09:30, ended 09:55: focused 45 minutes", () => {
    const paused = session({ status: "paused", pausedAt: at("09:20") });
    const pausedSeconds = pausedSecondsAfterResume(paused, at("09:30"));
    expect(pausedSeconds).toBe(600);
    const ended = session({ status: "finished", pausedSeconds, endedAt: at("09:55") });
    expect(focusedMinutes(ended, at("12:00"))).toBe(45);
  });

  it("rounds focused time down to whole minutes", () => {
    const ended = session({ status: "finished", endedAt: new Date(at("09:00").getTime() + 59_999) });
    expect(focusedMinutes(ended, at("12:00"))).toBe(0);
  });

  it("ends a running session at start + planned minutes + paused time", () => {
    expect(plannedEnd(session({ pausedSeconds: 600 })).toISOString()).toBe(at("10:10").toISOString());
  });

  it("counts down only while running: a paused session keeps its time left", () => {
    expect(secondsLeft(session({}), at("09:15"))).toBe(45 * 60);
    const paused = session({ status: "paused", pausedAt: at("09:15") });
    expect(secondsLeft(paused, at("11:00"))).toBe(45 * 60);
    expect(secondsLeft(session({}), at("11:00"))).toBe(0);
  });

  it("suggests the event's own length, kept within 1 minute to 23 h 59 min (R12)", () => {
    expect([lengthForEvent(10), lengthForEvent(45), lengthForEvent(60), lengthForEvent(300), lengthForEvent(1439), lengthForEvent(2000), lengthForEvent(0)]).toEqual([
      10, 45, 60, 300, 1439, 1439, 1,
    ]);
  });

  it("writes minutes and timers for people", () => {
    expect([minutesText(45), minutesText(60), minutesText(90)]).toEqual(["45 min", "1 h", "1 h 30 min"]);
    expect([clockText(1499), clockText(3900)]).toEqual(["24:59", "1:05:00"]);
  });
});
