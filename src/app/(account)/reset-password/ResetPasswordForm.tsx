"use client";

// Form of reset_password. It only collects the new password and shows the server's answer;
// the rules are checked by the server (src/lib/server/actions/reset-password.ts).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field } from "@/components/account/Field";
import { FormMessage } from "@/components/account/FormMessage";
import { Button } from "@/components/ui/Button";
import { postJson, type PostResult } from "@/lib/client/post-json";

export function ResetPasswordForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PostResult | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    const answer = await postJson("/api/auth/reset-password", {
      password: String(form.get("password") ?? ""),
    });
    if (answer.ok) {
      // The server has ended every session of the account. Refresh first, so the sign-in page reads the cleared cookies.
      router.refresh();
      router.push("/sign-in");
      return;
    }
    setResult(answer);
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <p className="mb-4 text-sm text-ink-2">Set your new password within 15 minutes.</p>
      <Field
        id="password"
        name="password"
        type="password"
        label="New password"
        hint="At least 8 characters"
        autoComplete="new-password"
        required
      />
      {result && <FormMessage tone="error" text={result.message} />}
      {result?.status === 410 && (
        <p className="mt-4 text-sm text-ink-2">
          <Link href="/forgot-password" className="font-medium text-ink underline underline-offset-2">
            Ask for a new link
          </Link>
        </p>
      )}
      <Button type="submit" className="mt-6 w-full" disabled={busy}>
        {busy ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
