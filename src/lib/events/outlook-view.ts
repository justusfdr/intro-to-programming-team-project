// What the calendar says about the Outlook connection. Pure, for the toolbar and its tests.
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
