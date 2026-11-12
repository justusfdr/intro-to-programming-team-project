"use client";

// Button that ends the session. The server does the work (src/lib/server/actions/sign-out.ts);
// the page then goes to the sign-in page.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormMessage } from "@/components/account/FormMessage";
import { LogOut } from "lucide-react";
import { postJson } from "@/lib/client/post-json";

/** The account row at the bottom of the sidebar. On phones, Settings has the same action. */
export function SignOutButton() {
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
        className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm text-ink-2 transition-colors hover:bg-raised/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 disabled:opacity-50"
      >
        <LogOut className="size-[18px] text-ink-3" strokeWidth={1.8} />
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {error && <FormMessage tone="error" text={error} />}
    </div>
  );
}
