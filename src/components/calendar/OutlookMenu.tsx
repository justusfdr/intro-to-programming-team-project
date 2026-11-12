"use client";

// The Outlook button in the calendar's toolbar (spec 08) and the small panel it opens: connect, see the
// status and the last sync, reconnect, disconnect. It also starts sync_outlook once when the calendar
// opens (the server allows one every 5 minutes) and announces the result of a sign-in.
// The calendar is the place for it because that is where Outlook's events show and where the sync runs;
// the settings page comes in build step 7.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { postJson } from "@/lib/client/post-json";
import { lastSyncedText, signInResultMessage, statusText } from "@/lib/events/outlook-view";
import type { OutlookView } from "@/lib/events/types";
import { MESSAGES } from "@/lib/messages";
import { useAnnounce } from "./Announcer";

type Props = {
  outlook: OutlookView;
  timeZone: string;
  today: string;
  /** The panel starts open (static previews only). */
  defaultOpen?: boolean;
  /** The panel starts at the "Disconnect Outlook?" question (static previews only). */
  defaultConfirming?: boolean;
};

const dotClass: Record<OutlookView["status"], string> = {
  connected: "bg-success",
  needs_reconnect: "bg-danger",
  none: "bg-ink-3",
};

export function OutlookMenu({ outlook, timeZone, today, defaultOpen = false, defaultConfirming = false }: Props) {
  const router = useRouter();
  const announce = useAnnounce();
  const [open, setOpen] = useState(defaultOpen);
  const [confirming, setConfirming] = useState(defaultConfirming);
  const [busy, setBusy] = useState(false);
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

  async function disconnect() {
    setBusy(true);
    const answer = await postJson("/api/outlook/disconnect", {});
    setBusy(false);
    if (answer.message) announce(answer.message);
    if (!answer.ok) return;
    setConfirming(false);
    setOpen(false);
    router.refresh();
  }

  const connectForm = (label: string) => (
    // A real form POST: the server answers with a redirect to Microsoft's sign-in page.
    <form method="post" action="/api/outlook/connect">
      <Button type="submit" size="sm">
        {label}
      </Button>
    </form>
  );

  return (
    <div className="relative">
      <Button variant="secondary" aria-expanded={open} aria-controls="outlook-panel" onClick={() => setOpen((v) => !v)}>
        <span aria-hidden className={`size-2 rounded-full ${dotClass[outlook.status]}`} />
        Outlook
        <span className="sr-only">{`, ${statusText(outlook)}`}</span>
      </Button>
      {open && (
        <section
          id="outlook-panel"
          aria-label="Outlook"
          className="absolute left-0 top-full z-30 mt-2 flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-3 rounded-card border border-line-subtle bg-surface p-4 text-sm shadow-pop"
        >
          {outlook.status === "none" && (
            <>
              <p className="text-ink">Show your Outlook events here, and send the events you plan here to Outlook.</p>
              <p className="text-xs text-ink-2">Microsoft asks you to allow reading and writing your calendar.</p>
              {connectForm("Connect Outlook")}
            </>
          )}
          {outlook.status === "needs_reconnect" && (
            <>
              <p className="font-medium text-danger">{MESSAGES.outlookReconnect}</p>
              <p className="text-xs text-ink-2">{lastSyncedText(outlook.lastSyncedAt, timeZone, today)}</p>
              {connectForm("Reconnect Outlook")}
            </>
          )}
          {outlook.status === "connected" && (
            <>
              <p className="flex items-center gap-2 font-medium text-ink">
                <span aria-hidden className="size-2 rounded-full bg-success" /> Connected
              </p>
              <p className="text-xs text-ink-2">{lastSyncedText(outlook.lastSyncedAt, timeZone, today)}</p>
            </>
          )}
          {outlook.status !== "none" &&
            (confirming ? (
              <div className="flex flex-col gap-2 border-t border-line-subtle pt-3">
                <p className="font-medium">Disconnect Outlook?</p>
                <p className="text-xs text-ink-2">Outlook events leave this calendar. What this app wrote stays in Outlook.</p>
                <div className="flex gap-2">
                  <Button variant="danger" size="sm" disabled={busy} onClick={disconnect}>
                    Disconnect
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="ghost" size="sm" className="w-fit" onClick={() => setConfirming(true)}>
                Disconnect Outlook
              </Button>
            ))}
        </section>
      )}
    </div>
  );
}
