// R15: whether blocking is on, and until when. Calculated, never saved. Pure function.
// Blocking is on when (a) a session is running (not paused), or (b) now is within a timed event
// (start ≤ now < end) whose goal has auto_block on. blocking_until is the latest of these ends.

export type BlockingInput = {
  now: Date;
  /** The user's running session's planned end (start + planned minutes + paused time), if one is running. */
  runningSessionEnd: Date | null;
  /** Timed events of goals with auto_block on, around now. */
  autoBlockEvents: { startAt: Date; endAt: Date }[];
};

export type BlockingState = { blockingOn: boolean; blockingUntil: Date | null };

export function blockingState({ now, runningSessionEnd, autoBlockEvents }: BlockingInput): BlockingState {
  const ends: number[] = [];
  if (runningSessionEnd && runningSessionEnd > now) ends.push(runningSessionEnd.getTime());
  for (const event of autoBlockEvents) {
    if (event.startAt <= now && now < event.endAt) ends.push(event.endAt.getTime());
  }
  if (ends.length === 0) return { blockingOn: false, blockingUntil: null };
  return { blockingOn: true, blockingUntil: new Date(Math.max(...ends)) };
}
