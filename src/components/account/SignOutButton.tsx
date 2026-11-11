"use client";

// Button that ends the session. The server does the work (src/lib/server/actions/sign-out.ts);
// the page then goes to the sign-in page.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormMessage } from "@/components/account/FormMessage";
import { Button } from "@/components/ui/Button";
import { SignOutIcon } from "@/components/ui/icons";
import { postJson } from "@/lib/client/post-json";

/** `compact`: an icon button (the phone's top bar); otherwise a full-width row (the sidebar). */
export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setError(null);
    const answer = await postJson("/api/auth/sign-out", {});
    if (answer.ok) {
      // Refresh first, so the next page reads the cleared session cookies.
      router.refresh();
      router.push("/sign-in");
      return;
    }
    setError(answer.message);
    setBusy(false);
  }

  return (
    <div>
      {compact ? (
        <Button variant="secondary" size="icon" aria-label="Sign out" title="Sign out" onClick={onClick} disabled={busy}>
          <SignOutIcon />
        </Button>
      ) : (
        <button
          type="button"
          onClick={onClick}
          disabled={busy}
          className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm text-ink-2 transition-colors hover:bg-raised/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 disabled:opacity-50"
        >
          <SignOutIcon className="size-[18px] text-ink-3" />
          {busy ? "Signing out…" : "Sign out"}
        </button>
      )}
      {error && <FormMessage tone="error" text={error} />}
    </div>
  );
}
