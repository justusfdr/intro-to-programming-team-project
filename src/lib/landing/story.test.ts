// Spec 62: the scroll position decides which stop of the day is on screen and what time it is.
import { describe, expect, it } from "vitest";
import { clockText, ease, FADE_IN, FADE_OUT, storyFrame, type Stretch } from "./story";

const STOPS: Stretch[] = [
  { from: 480, to: 505 },
  { from: 505, to: 540 },
  { from: 540, to: 660 },
  { from: 660, to: 675 },
];

describe("where the story stands for a scroll position", () => {
  it("starts with the first stop, fully there, at the start of the day", () => {
    const frame = storyFrame(0, STOPS);
    expect(frame.index).toBe(0);
    expect(frame.local).toBe(0);
    expect(frame.minutes).toBe(480);
    expect(frame.presence).toEqual([1, 0, 0, 0]);
  });

  it("ends with the last stop, fully there, at the end of its stretch", () => {
    const frame = storyFrame(1, STOPS);
    expect(frame.index).toBe(3);
    expect(frame.local).toBe(1);
    expect(frame.minutes).toBe(675);
    expect(frame.presence).toEqual([0, 0, 0, 1]);
  });

  it("gives every stop the same share of the scroll", () => {
    for (let stop = 0; stop < STOPS.length; stop++) {
      const middle = storyFrame((stop + 0.5) / STOPS.length, STOPS);
      expect(middle.index).toBe(stop);
      expect(middle.local).toBeCloseTo(0.5);
      expect(middle.minutes).toBeCloseTo((STOPS[stop].from + STOPS[stop].to) / 2);
      expect(middle.presence[stop]).toBe(1);
    }
  });

  it("only ever moves the time forward", () => {
    let last = -Infinity;
    for (let step = 0; step <= 400; step++) {
      const { minutes } = storyFrame(step / 400, STOPS);
      expect(minutes).toBeGreaterThanOrEqual(last);
      last = minutes;
    }
  });

  it("never shows two stops at once: one goes out before the next comes in", () => {
    for (let step = 0; step <= 400; step++) {
      const { presence, index } = storyFrame(step / 400, STOPS);
      expect(presence).toHaveLength(STOPS.length);
      expect(presence.filter((value) => value > 0).length).toBeLessThanOrEqual(1);
      presence.forEach((value, at) => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
        if (at !== index) expect(value).toBe(0);
      });
    }
  });

  it("fades a stop in at its start and out at its end, except at the two ends of the story", () => {
    const share = 1 / STOPS.length;
    // The second stop: just in, half in, there, half out.
    expect(storyFrame(share, STOPS).presence[1]).toBe(0);
    expect(storyFrame(share * (1 + FADE_IN / 2), STOPS).presence[1]).toBeCloseTo(0.5);
    expect(storyFrame(share * (1 + FADE_IN), STOPS).presence[1]).toBeCloseTo(1);
    expect(storyFrame(share * (2 - FADE_OUT / 2), STOPS).presence[1]).toBeCloseTo(0.5);
    // The first stop does not fade in, the last one does not fade out.
    expect(storyFrame(share * 0.01, STOPS).presence[0]).toBe(1);
    expect(storyFrame(1 - share * 0.01, STOPS).presence[3]).toBe(1);
  });

  it("is safe outside 0 to 1, with a broken number and with no stops", () => {
    expect(storyFrame(-3, STOPS)).toEqual(storyFrame(0, STOPS));
    expect(storyFrame(7, STOPS)).toEqual(storyFrame(1, STOPS));
    expect(storyFrame(Number.NaN, STOPS)).toEqual(storyFrame(0, STOPS));
    expect(storyFrame(0.5, [])).toEqual({ index: 0, local: 0, minutes: 0, presence: [] });
  });
});

describe("the easing", () => {
  it("runs from 0 to 1 and stays inside", () => {
    expect(ease(-1)).toBe(0);
    expect(ease(0)).toBe(0);
    expect(ease(0.5)).toBeCloseTo(0.5);
    expect(ease(1)).toBe(1);
    expect(ease(2)).toBe(1);
  });
});

describe("the clock above the day", () => {
  it("shows the 12-hour clock with minutes", () => {
    expect(clockText(480)).toBe("8:00 AM");
    expect(clockText(545)).toBe("9:05 AM");
    expect(clockText(720)).toBe("12:00 PM");
    expect(clockText(13 * 60 + 30)).toBe("1:30 PM");
    expect(clockText(0)).toBe("12:00 AM");
  });

  it("rounds to the minute, also across the hour", () => {
    expect(clockText(539.6)).toBe("9:00 AM");
    expect(clockText(539.4)).toBe("8:59 AM");
  });
});
