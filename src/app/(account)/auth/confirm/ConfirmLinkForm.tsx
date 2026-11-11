"use client";

// Form of confirm_email and of the reset link. It only sends the link's token and shows the server's answer;
// the server checks the link (src/lib/server/actions/confirm-link.ts).
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { FormMessage } from "@/components/account/FormMessage";
import { Button } from "@/components/ui/Button";

const NETWORK_ERROR = "We could not reach the server. Check your connection and try again.";

type Props = { tokenHash: string; type: "email" | "recovery" };

export function ConfirmLinkForm({ tokenHash, type }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; status: number } | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tokenHash, type }),
      });
      const data = (await response.json().catch(() => ({}))) as { next?: unknown; message?: unknown };
      if (response.ok && typeof data.next === "string") {
        // A full page load, so the next page sees the new session cookie.
        window.location.assign(data.next);
        return;
      }
      const message = typeof data.message === "string" ? data.message : NETWORK_ERROR;
      setError({ message, status: response.status });
    } catch {
      setError({ message: NETWORK_ERROR, status: 0 });
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {type === "recovery" && (
        <p className="mb-4 text-sm text-ink-2">Set your new password within 15 minutes.</p>
      )}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Please wait…" : type === "email" ? "Confirm my email" : "Set a new password"}
      </Button>
      {error && (
        <>
          <FormMessage tone="error" text={error.message} />
          {error.status === 410 && (
            <p className="mt-4 text-sm text-ink-2">
              <Link
                href={type === "email" ? "/check-email" : "/forgot-password"}
                className="font-medium text-ink underline underline-offset-2"
              >
                Ask for a new link
              </Link>
            </p>
          )}
        </>
      )}
    </form>
  );
}
