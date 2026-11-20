// The day the landing page scrolls through (spec 62): which stop is on screen and what time it is
// for a scroll position. Pure numbers, so it can be tested without a browser.

/** The stretch of the day the red line crosses while a stop is on screen, in minutes of the day. */
export type Stretch = { from: number; to: number };

export type StoryFrame = {
  /** The stop on screen. */
  index: number;
  /** How far the scroll is through that stop, from 0 to 1. */
  local: number;
  /** The time of day, in minutes. */
  minutes: number;
  /** How visible each stop is, from 0 to 1. Only the stop on screen is above 0. */
  presence: number[];
};

/** The share of a stop's scroll it spends coming in, and going out. */
export const FADE_IN = 0.14;
export const FADE_OUT = 0.1;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** From 0 to 1, slow at both ends. */
export function ease(value: number): number {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

/**
 * Where the story stands for a scroll progress from 0 (the stage has just stopped) to 1 (it is about
 * to move on). Every stop gets the same share of the scroll. The first stop is there from the start
 * and the last one stays; in between a stop goes out before the next one comes in.
 */
export function storyFrame(progress: number, stops: readonly Stretch[]): StoryFrame {
  const count = stops.length;
  if (count === 0) return { index: 0, local: 0, minutes: 0, presence: [] };

  const position = clamp(Number.isFinite(progress) ? progress : 0) * count;
  const index = Math.min(count - 1, Math.floor(position));
  const local = clamp(position - index);
  const stop = stops[index];

  const arriving = index === 0 ? 1 : ease(local / FADE_IN);
  const leaving = index === count - 1 ? 1 : 1 - ease((local - (1 - FADE_OUT)) / FADE_OUT);
  const presence = stops.map((_, at) => (at === index ? Math.min(arriving, leaving) : 0));

  return { index, local, minutes: stop.from + (stop.to - stop.from) * local, presence };
}

/** "9:05 AM": the clock above the day. */
export function clockText(minutes: number): string {
  const whole = Math.round(minutes);
  const hour = Math.floor(whole / 60) % 24;
  const minute = whole % 60;
  return `${((hour + 11) % 12) + 1}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}
