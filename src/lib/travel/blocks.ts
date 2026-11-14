// The calendar's travel blocks (R27): a dashed block in an event's day column, from the time to leave to the
// event's start. Pure, so it is tested on its own (blocks.test.ts).
import type { TravelAnswer } from "./types";

export type TravelBlock = {
  /** Minutes after midnight of the event's day; never before midnight (an earlier start is cut there). */
  fromMin: number;
  toMin: number;
  /** The trip with the buffer (and, by public transport, any wait), in minutes: the whole block, also a part cut at midnight. */
  totalMin: number;
  /** The trip alone, in minutes. */
  tripMin: number;
  mode: Extract<TravelAnswer, { status: "ok" }>["mode"];
};

/**
 * Where the travel block of an event stands: it ends at the event's start (`startMin` on the grid) and
 * begins `start − leaveAt` minutes earlier. Null when there is no time to leave (any other answer) or for
 * the part of an event after midnight, whose travel belongs to the day before.
 */
export function travelBlock(
  event: { startAt: string },
  startMin: number,
  continuesBefore: boolean,
  travel: TravelAnswer | undefined,
): TravelBlock | null {
  if (!travel || travel.status !== "ok" || continuesBefore) return null;
  const totalMin = Math.round((Date.parse(event.startAt) - Date.parse(travel.leaveAt)) / 60_000);
  if (!Number.isFinite(totalMin) || totalMin <= 0) return null;
  return { fromMin: Math.max(0, startMin - totalMin), toMin: startMin, totalMin, tripMin: travel.minutes, mode: travel.mode };
}
