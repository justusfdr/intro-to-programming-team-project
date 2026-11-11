"use client";

// Form of sign_up. It only collects the input and shows the server's answer;
// all rules are checked by the server (src/lib/server/actions/sign-up.ts).
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Field } from "@/components/account/Field";
import { FormMessage } from "@/components/account/FormMessage";
import { Button } from "@/components/ui/Button";
import { postJson, type PostResult } from "@/lib/client/post-json";

/** The browser's time zone, e.g. "Europe/Berlin"; undefined if the browser gives none. */
function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

export function SignUpForm() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PostResult | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setResult(
      await postJson("/api/auth/sign-up", {
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
        timeZone: browserTimeZone(),
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
          <Link href="/check-email" className="font-medium text-ink underline underline-offset-2">
            Ask for a new link
          </Link>
        </p>
      </>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Field id="email" name="email" type="email" label="Email" autoComplete="email" required />
      <Field
        id="password"
        name="password"
        type="password"
        label="Password"
        hint="At least 8 characters"
        autoComplete="new-password"
        className="mt-4"
        required
      />
      {result && <FormMessage tone="error" text={result.message} />}
      <Button type="submit" className="mt-6 w-full" disabled={busy}>
        {busy ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
