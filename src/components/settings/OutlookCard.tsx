"use client";

// Card "Outlook calendar", copied from the prototype's Microsoft card: status pill, sign in, the
// connection with its last sync, Sync now and Disconnect (spec 08's actions, moved here from the
// calendar's menu). Import and sending go together (decided), so the prototype's two switches are gone.
// Without a Microsoft registration on the server the card says so instead of offering a button that fails.
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { CalendarDays, RefreshCw } from "lucide-react";
import { FormMessage } from "@/components/account/FormMessage";
import { useAnnounce } from "@/components/calendar/Announcer";
import { useDisplay } from "@/components/shell/DisplayProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { postJson, type PostResult } from "@/lib/client/post-json";
import { syncedText } from "@/lib/events/outlook-view";
import { MESSAGES } from "@/lib/messages";
import type { SettingsPageData } from "@/lib/settings/types";
import { SettingsCardHeader, StatusPill } from "./fields";

type Props = Pick<SettingsPageData, "outlook" | "outlookAvailable" | "today"> & {
  timeZone: string;
  /** Starts at the "Disconnect Outlook?" question (static previews only). */
  defaultConfirming?: boolean;
};

/** The pill next to the title, in words. */
export function outlookPill(outlook: Props["outlook"], available: boolean): { state: "connected" | "ready" | "attention" | "off"; text: string } {
  if (outlook.status === "connected") return { state: "connected", text: "Connected" };
  if (outlook.status === "needs_reconnect") return { state: "attention", text: "Sign in again" };
  return available ? { state: "ready", text: "Ready" } : { state: "off", text: "Not set up" };
}

/** A real form POST: the server answers with a redirect to Microsoft's sign-in page. */
function SignInForm({ label, variant }: { label: string; variant: "primary" | "secondary" }) {
  return (
    <form method="post" action="/api/outlook/connect">
      <Button type="submit" variant={variant}>
        {label}
      </Button>
    </form>
  );
}

export function OutlookCard({ outlook, outlookAvailable, today, timeZone, defaultConfirming = false }: Props) {
  const router = useRouter();
  const announce = useAnnounce();
  const { timeFormat } = useDisplay();
  const titleId = useId();
  const [confirming, setConfirming] = useState(defaultConfirming);
  const [busy, setBusy] = useState<"sync" | "disconnect" | null>(null);
  const [failure, setFailure] = useState<PostResult | null>(null);
  const pill = outlookPill(outlook, outlookAvailable);
  const synced = syncedText(outlook.lastSyncedAt, timeZone, today, timeFormat);

  async function run(kind: "sync" | "disconnect") {
    setBusy(kind);
    const answer = await postJson(`/api/outlook/${kind}`, {});
    setBusy(null);
    setFailure(answer.ok ? null : answer);
    if (!answer.ok) return;
    if (answer.message) announce(answer.message);
    else if (kind === "sync") announce((answer.data as { ran?: unknown } | undefined)?.ran ? MESSAGES.outlookSynced : MESSAGES.outlookSyncedRecently);
    setConfirming(false);
    router.refresh();
  }

  return (
    <Card id="outlook" role="region" aria-labelledby={titleId} className="scroll-mt-6 p-5 md:p-6">
      <SettingsCardHeader
        icon={CalendarDays}
        title="Outlook calendar"
        titleId={titleId}
        description="Bring your Outlook events into your plan, and send the events you plan here to Outlook. Personal, work or school account."
        aside={<StatusPill state={pill.state}>{pill.text}</StatusPill>}
      />

      <div className="mt-5 flex flex-col gap-4">
        {outlook.status === "none" && !outlookAvailable && <p className="text-sm text-ink-2">Outlook is not set up on this server yet.</p>}

        {outlook.status === "none" && outlookAvailable && (
          <div className="flex flex-col gap-2">
            <div>
              <SignInForm label="Sign in with Microsoft" variant="primary" />
            </div>
            <p className="text-xs text-ink-3">Work, school or personal account (Outlook.com, Hotmail). Microsoft asks you to allow reading and writing your calendar.</p>
          </div>
        )}

        {outlook.status !== "none" && (
          <div className="rounded-lg bg-raised px-3 py-2.5 text-sm">
            <p className={outlook.status === "connected" ? "text-ink" : "font-medium text-danger"}>
              {outlook.status === "connected" ? "Connected to your Outlook calendar" : MESSAGES.outlookReconnect}
            </p>
            <p className="mt-0.5 text-xs text-ink-3 tabular">{synced}</p>
          </div>
        )}

        {outlook.status === "needs_reconnect" && !outlookAvailable && <p className="text-sm text-ink-2">Outlook is not set up on this server yet.</p>}

        {outlook.status !== "none" &&
          (confirming ? (
            <div role="group" aria-label="Disconnect Outlook" className="flex flex-col gap-3 rounded-xl bg-raised p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-ink">
                <p className="font-medium">Disconnect Outlook?</p>
                <p className="mt-0.5 text-ink-2">Outlook events leave this calendar. What this app wrote stays in Outlook.</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button variant="ghost" size="sm" autoFocus onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
                <Button variant="danger" size="sm" disabled={busy !== null} onClick={() => run("disconnect")}>
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {outlook.status === "needs_reconnect" && outlookAvailable && <SignInForm label="Sign in again" variant="primary" />}
              {outlook.status === "connected" && outlookAvailable && (
                <Button variant="secondary" onClick={() => run("sync")} disabled={busy !== null}>
                  <RefreshCw className={`size-4 ${busy === "sync" ? "animate-spin" : ""}`} strokeWidth={2} aria-hidden="true" />
                  {busy === "sync" ? "Syncing…" : "Sync now"}
                </Button>
              )}
              <Button variant="ghost" onClick={() => setConfirming(true)} disabled={busy !== null}>
                Disconnect
              </Button>
            </div>
          ))}

        {failure && <FormMessage tone="error" text={failure.message} />}
      </div>
    </Card>
  );
}
