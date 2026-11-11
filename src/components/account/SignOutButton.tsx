"use client";

// Button that ends the session. The server does the work (src/lib/server/actions/sign-out.ts);
// the page then goes to the sign-in page.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormMessage } from "@/components/account/FormMessage";
import { Button } from "@/components/ui/Button";
import { postJson } from "@/lib/client/post-json";

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
      <Button variant="secondary" onClick={onClick} disabled={busy}>
        {busy ? "Signing out…" : "Sign out"}
      </Button>
      {error && <FormMessage tone="error" text={error} />}
    </div>
  );
}
