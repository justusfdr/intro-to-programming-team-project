"use client";

// Form of request_password_reset. It only collects the e-mail and shows the server's answer;
// the rules are checked by the server (src/lib/server/actions/request-password-reset.ts).
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Field } from "@/components/account/Field";
import { FormMessage } from "@/components/account/FormMessage";
import { Button } from "@/components/ui/Button";
import { postJson, type PostResult } from "@/lib/client/post-json";

export function ForgotPasswordForm() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PostResult | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setResult(
      await postJson("/api/auth/request-password-reset", {
        email: String(form.get("email") ?? ""),
      }),
    );
    setBusy(false);
  }

  if (result?.ok) {
    return (
      <>
        <FormMessage tone="success" text={result.message} />
        <p className="mt-4 text-sm text-ink-2">
          No e-mail?{" "}
          <Link href="/forgot-password" className="font-medium text-ink underline underline-offset-2">
            Try again
          </Link>
        </p>
      </>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Field id="email" name="email" type="email" label="Email" autoComplete="email" required />
      {result && <FormMessage tone="error" text={result.message} />}
      <Button type="submit" className="mt-6 w-full" disabled={busy}>
        {busy ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
