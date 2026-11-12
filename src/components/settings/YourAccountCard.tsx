"use client";

// Card "Your account", in the layout of the prototype's data card: sign out, and delete the account
// after typing DELETE (delete_account). The question opens under the buttons, as the prototype's
// confirmations do; Escape or Cancel closes it. The server checks the typed word and the plan again.
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { CircleUserRound, LogOut, Trash2 } from "lucide-react";
import { FormMessage } from "@/components/account/FormMessage";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { postJson, type PostResult } from "@/lib/client/post-json";
import { SettingsCardHeader, INPUT_CLASS } from "./fields";

export function YourAccountCard({ defaultAsking = false }: { defaultAsking?: boolean }) {
  const router = useRouter();
  const uid = useId();
  const [asking, setAsking] = useState(defaultAsking);
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
          <Button variant="ghost" disabled={busy} aria-expanded={asking} onClick={() => setAsking(true)}>
            <Trash2 className="size-4" strokeWidth={1.8} aria-hidden="true" />
            Delete account
          </Button>
        </div>

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
