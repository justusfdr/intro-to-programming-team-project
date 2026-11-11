"use client";

// Form of resend_confirmation. It only collects the e-mail address and shows the server's answer;
// the server checks everything (src/lib/server/actions/resend-confirmation.ts).
import { useState, type FormEvent } from "react";
import { Field } from "@/components/account/Field";
import { FormMessage } from "@/components/account/FormMessage";
import { Button } from "@/components/ui/Button";
import { postJson, type PostResult } from "@/lib/client/post-json";

export function ResendForm() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PostResult | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setResult(await postJson("/api/auth/resend-confirmation", { email: String(form.get("email") ?? "") }));
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6">
      <Field id="email" name="email" type="email" label="Email" autoComplete="email" required />
      {result && <FormMessage tone={result.ok ? "success" : "error"} text={result.message} />}
      <Button type="submit" className="mt-6 w-full" disabled={busy}>
        {busy ? "Sending…" : "Send a new link"}
      </Button>
    </form>
  );
}
