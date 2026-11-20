"use client";

// Button that ends the session. The server does the work (src/lib/server/actions/sign-out.ts);
// the page then goes to the landing page (/home), where "Log in" leads back to the sign-in page.
import { useState } from "react";
import { FormMessage } from "@/components/account/FormMessage";
import { LogOut } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import { forgetWidgets } from "@/components/widgets/cache";
import { openFresh } from "@/lib/client/fresh-page";
import { postJson } from "@/lib/client/post-json";

/**
 * "Sign out" at the top right of the profile page (spec 40). Until spec 40 it was the account row at the
 * bottom of the sidebar. Settings' "Your account" card has the same action.
 */
export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setError(null);
    const answer = await postJson("/api/auth/sign-out", {});
    if (answer.ok) {
      forgetWidgets(); // spec 47: the next account must not see these widgets
      // The landing page, loaded in full: nothing of this account stays in the browser's memory
      // (src/lib/client/fresh-page.ts).
      openFresh("/home");
      return;
    }
    setError(answer.message);
    setBusy(false);
  }

  return (
    <div className="flex flex-col items-end">
      <button type="button" onClick={onClick} disabled={busy} className={buttonClass("secondary", "md")}>
        <LogOut className="size-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {error && <FormMessage tone="error" text={error} />}
    </div>
  );
}
