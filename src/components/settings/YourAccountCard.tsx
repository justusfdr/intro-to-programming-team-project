"use client";

// Card "Your account", in the layout of the prototype's data card: sign out, "Remove the demo data"
// while demo rows are left (remove_demo, spec 13), and delete the account after typing DELETE
// (delete_account). Each question opens under the buttons, as the prototype's confirmations do;
// Escape or Cancel closes it. The server checks the typed word and the plan again.
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { CircleUserRound, Eraser, LogOut, Trash2 } from "lucide-react";
import { useAnnounce } from "@/components/calendar/Announcer";
import { FormMessage } from "@/components/account/FormMessage";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { postJson, type PostResult } from "@/lib/client/post-json";
import { SettingsCardHeader, INPUT_CLASS } from "./fields";

export function YourAccountCard({
  defaultAsking = false,
  hasDemo = false,
  defaultAskingDemo = false,
}: {
  defaultAsking?: boolean;
  /** Demo rows are left: show "Remove the demo data". */
  hasDemo?: boolean;
  /** Opens the demo question at once (previews only). */
  defaultAskingDemo?: boolean;
}) {
  const router = useRouter();
  const announce = useAnnounce();
  const uid = useId();
  const [asking, setAsking] = useState(defaultAsking);
  const [askingDemo, setAskingDemo] = useState(defaultAskingDemo);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<PostResult | null>(null);

  async function leave(path: string, body: unknown) {
    setBusy(true);
    setFailure(null);
    const answer = await postJson(path, body);
    if (answer.ok) {
      // Refresh first, so the next page reads the cleared session cookies.
      router.refresh();
      router.push(answer.next ?? "/sign-in");
      return;
    }
    setFailure(answer);
    setBusy(false);
  }

  function confirmDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void leave("/api/account/delete", { confirm: typed });
  }

  async function removeDemo() {
    setBusy(true);
    setFailure(null);
    const answer = await postJson("/api/demo/remove", {});
    setBusy(false);
    if (!answer.ok) {
      setFailure(answer);
      return;
    }
    setAskingDemo(false);
    announce(answer.message);
    router.refresh();
  }

  function cancel() {
    setAsking(false);
    setTyped("");
    setFailure(null);
  }

  return (
    <Card role="region" aria-labelledby={`${uid}-title`} className="p-5 md:p-6">
      <SettingsCardHeader
        icon={CircleUserRound}
        title="Your account"
        titleId={`${uid}-title`}
        description="Your goals, events, tasks, sessions and settings are stored with your account on our server."
      />

      <div className="mt-5">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => leave("/api/auth/sign-out", {})}>
            <LogOut className="size-4" strokeWidth={1.8} aria-hidden="true" />
            Sign out
          </Button>
          {hasDemo && (
            <Button variant="secondary" disabled={busy} aria-expanded={askingDemo} onClick={() => setAskingDemo(true)}>
              <Eraser className="size-4" strokeWidth={1.8} aria-hidden="true" />
              Remove the demo data
            </Button>
          )}
          <Button variant="ghost" disabled={busy} aria-expanded={asking} onClick={() => setAsking(true)}>
            <Trash2 className="size-4" strokeWidth={1.8} aria-hidden="true" />
            Delete account
          </Button>
        </div>

        {hasDemo && askingDemo && (
          <div
            role="group"
            aria-label="Remove the demo data"
            className="mt-3 flex flex-col gap-3 rounded-xl bg-raised p-3 sm:flex-row sm:items-center sm:justify-between"
            onKeyDown={(e) => {
              if (e.key === "Escape") setAskingDemo(false);
            }}
          >
            <p className="text-sm text-ink">
              Remove the demo goals, tasks and events? Demo items you changed are removed too. Everything you added yourself stays.
            </p>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button variant="ghost" size="sm" autoFocus onClick={() => setAskingDemo(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={busy} onClick={removeDemo}>
                {busy ? "Removing…" : "Remove"}
              </Button>
            </div>
          </div>
        )}

        {asking && (
          <form
            onSubmit={confirmDelete}
            noValidate
            aria-label="Delete account"
            className="mt-3 flex flex-col gap-3 rounded-xl bg-raised p-3"
            onKeyDown={(e) => {
              if (e.key === "Escape") cancel();
            }}
          >
            <p className="text-sm text-ink">
              Delete your account and all its data? This cannot be undone. Events this app sent to Outlook stay there.
            </p>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${uid}-confirm`} className="text-xs font-medium text-ink-2">
                Type DELETE to confirm
              </label>
              <input
                id={`${uid}-confirm`}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={20}
                autoFocus
                className={`${INPUT_CLASS} w-full sm:w-56`}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={cancel}>
                Cancel
              </Button>
              <Button type="submit" variant="danger" size="sm" disabled={busy || typed.trim() !== "DELETE"}>
                {busy ? "Deleting…" : "Delete account"}
              </Button>
            </div>
          </form>
        )}

        {failure && <FormMessage tone="error" text={failure.message} />}
      </div>
    </Card>
  );
}
