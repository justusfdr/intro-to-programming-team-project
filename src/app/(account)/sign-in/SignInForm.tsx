"use client";

// Form of sign_in. It only collects the input and shows the server's answer;
// all rules are checked by the server (src/lib/server/actions/sign-in.ts).
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Field } from "@/components/account/Field";
import { FormMessage } from "@/components/account/FormMessage";
import { Button } from "@/components/ui/Button";
import { openFresh } from "@/lib/client/fresh-page";
import { postJson, type PostResult } from "@/lib/client/post-json";

export function SignInForm() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PostResult | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    const answer = await postJson("/api/auth/sign-in", {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    if (answer.ok) {
      // On to the start page, loaded in full so it reads the new session cookie (src/lib/client/fresh-page.ts).
      // The button keeps saying "Signing in…" until the calendar is there.
      openFresh("/");
      return;
    }
    setResult(answer);
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Field id="email" name="email" type="email" label="Email" autoComplete="email" required />
      <Field
        id="password"
        name="password"
        type="password"
        label="Password"
        autoComplete="current-password"
        className="mt-4"
        required
      />
      {result && <FormMessage tone="error" text={result.message} />}
      {result?.status === 403 && (
        <p className="mt-4 text-sm text-ink-2">
          <Link href="/check-email" className="font-medium text-ink underline underline-offset-2">
            Ask for a new link
          </Link>
        </p>
      )}
      <Button type="submit" size="lg" className="mt-6 w-full" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
