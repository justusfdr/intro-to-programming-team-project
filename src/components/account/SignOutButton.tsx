"use client";

// Button that ends the session. The server does the work (src/lib/server/actions/sign-out.ts);
// the page then goes to the sign-in page.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormMessage } from "@/components/account/FormMessage";
import { LogOut } from "lucide-react";
import { postJson } from "@/lib/client/post-json";

/** The account row at the bottom of the sidebar. On phones, Settings has the same action. */
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
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-label={compact ? "Sign out" : undefined}
        title={compact ? "Sign out" : undefined}
        className="flex h-9 w-full items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-lg px-[9px] text-sm text-ink-2 transition-colors hover:bg-raised/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 disabled:opacity-50"
      >
        <LogOut className="size-[18px] shrink-0 text-ink-3" strokeWidth={1.8} />
        {!compact && (busy ? "Signing out…" : "Sign out")}
      </button>
      {error && !compact && <FormMessage tone="error" text={error} />}
    </div>
  );
}
