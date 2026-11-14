"use client";

// The small Outlook status in the calendar's toolbar, copied from the prototype's chip: "Outlook · Last
// synced 8:40am" with a button to sync now; without a connection a "Connect Outlook" pill that links to
// Settings, where connecting, reconnecting and disconnecting live (spec 12). It also starts sync_outlook
// once when the calendar opens (the server allows one every 5 minutes) and announces the result of a
// Microsoft sign-in, which comes back to the calendar.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, RefreshCw } from "lucide-react";
import { useDisplay } from "@/components/shell/DisplayProvider";
import { postJson } from "@/lib/client/post-json";
import { signInResultMessage, syncedText, syncNote } from "@/lib/events/outlook-view";
import type { OutlookView } from "@/lib/events/types";
import { useAnnounce } from "./Announcer";

type Props = {
  outlook: OutlookView;
  /** Outlook is set up on this server (Microsoft registration and key). */
  available: boolean;
  timeZone: string;
  today: string;
};

const PILL =
  "inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-xs font-medium text-ink transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20";

export function OutlookChip({ outlook, available, timeZone, today }: Props) {
  const router = useRouter();
  const announce = useAnnounce();
  const { timeFormat } = useDisplay();
  const [syncing, setSyncing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const synced = useRef(false);

  // Once per page load: say how the sign-in went, then remove ?outlook=… from the address.
  useEffect(() => {
    const url = new URL(window.location.href);
    const message = signInResultMessage(url.searchParams.get("outlook"));
    if (!message) return;
    announce(message);
    url.searchParams.delete("outlook");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [announce]);

  // sync_outlook when the calendar opens; the week reloads when something ran.
  useEffect(() => {
    if (synced.current || outlook.status !== "connected") return;
    synced.current = true;
    void postJson("/api/outlook/sync", {}).then((answer) => {
      if (answer.ok && (answer.data as { ran?: unknown } | undefined)?.ran) router.refresh();
    });
  }, [outlook.status, router]);

  async function syncNow() {
    setSyncing(true);
    const answer = await postJson("/api/outlook/sync", {});
    setSyncing(false);
    const quiet = syncNote(answer);
    setNote(quiet);
    if (quiet) announce(quiet);
    if (answer.ok) router.refresh();
  }

  if (outlook.status === "none") {
    if (!available) return null;
    return (
      <Link href="/settings#outlook" className={PILL}>
        <CalendarDays className="size-3.5 text-ink-3" strokeWidth={2} aria-hidden="true" />
        Connect Outlook
      </Link>
    );
  }

  if (outlook.status === "needs_reconnect") {
    return (
      <Link href="/settings#outlook" className="inline-flex h-9 items-center gap-1 rounded-full bg-warning-soft px-3 text-xs font-medium text-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20">
        Outlook · Sign in again
      </Link>
    );
  }

  return (
    <div className="inline-flex h-9 items-center gap-1 rounded-full border border-line bg-surface pl-3 pr-1 text-xs text-ink-2">
      <Link href="/settings#outlook" className="min-w-0 truncate rounded-full hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20">
        {syncing ? "Outlook · syncing…" : note ? `Outlook · ${note}` : `Outlook · ${syncedText(outlook.lastSyncedAt, timeZone, today, timeFormat)}`}
      </Link>
      <button
        type="button"
        aria-label="Sync Outlook now"
        disabled={syncing}
        onClick={syncNow}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 disabled:pointer-events-none disabled:opacity-40"
      >
        <RefreshCw className={`size-3.5 ${syncing ? "animate-spin" : ""}`} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}
