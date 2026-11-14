/**
 * Milliseconds from `nowMs` until the clock shows the next minute (1 to 60000). A timer set to this
 * fires right when the minute changes, however far into the minute the page was opened.
 */
export function msToNextMinute(nowMs: number): number {
  return 60_000 - (((nowMs % 60_000) + 60_000) % 60_000);
}
