// What the calendar says about the Outlook connection. Pure, for the toolbar and its tests.
import { fmtDayMonth, fmtTime, type TimeFormat } from "@/lib/time/display";
import { localDateOf, localTimeOf } from "@/lib/time/zoned";
import type { OutlookView } from "./types";

/** "Last synced 08:40" today, "Last synced 16 Nov, 08:40" on another day, "Not synced yet" before the first. */
export function lastSyncedText(lastSyncedAt: string | null, timeZone: string, today: string): string {
  if (!lastSyncedAt) return "Not synced yet";
  const at = new Date(lastSyncedAt);
  const time = localTimeOf(at, timeZone);
  const day = localDateOf(at, timeZone);
  if (day === today) return `Last synced ${time}`;
  const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
  return `Last synced ${date}, ${time}`;
}

/**
 * The same in the display format of the settings: "Last synced 8:40am" today, "Last synced Nov 16, 8:40am"
 * on another day, "Not synced yet" before the first.
 */
export function syncedText(lastSyncedAt: string | null, timeZone: string, today: string, format: TimeFormat): string {
  if (!lastSyncedAt) return "Not synced yet";
  const at = new Date(lastSyncedAt);
  const time = fmtTime(localTimeOf(at, timeZone), format);
  const day = localDateOf(at, timeZone);
  return day === today ? `Last synced ${time}` : `Last synced ${fmtDayMonth(day)}, ${time}`;
}

/** The short status next to the toolbar button. */
export function statusText(outlook: OutlookView): string {
  if (outlook.status === "connected") return "Connected";
  if (outlook.status === "needs_reconnect") return "Sign in again";
  return "Not connected";
}

/** The message for the result the sign-in sends back in the address (?outlook=…), or null. */
export function signInResultMessage(result: string | null): string | null {
  if (result === "connected") return "Outlook connected.";
  if (result === "failed") return "Outlook was not connected";
  return null;
}

/**
 * The quiet line after "Sync now" when nothing was synced: the 5-minute gap (`ran: false`) or a failed
 * sync (`ok: false`). Null when the sync ran fine, or when the answer is not a sync answer at all.
 */
export function syncNote(answer: { ok: boolean; message: string; data?: unknown }): string | null {
  const data = answer.data as { ran?: unknown; ok?: unknown } | undefined;
  if (!answer.ok) return answer.message || "Outlook is not available right now";
  if (data?.ran === false) return "Already synced a few minutes ago";
  if (data?.ran === true && data.ok === false) return answer.message || "Outlook is not available right now";
  return null;
}
