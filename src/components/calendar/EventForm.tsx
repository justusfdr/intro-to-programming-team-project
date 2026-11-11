"use client";

// The event form: title, start, end, may overlap. Used to create an event and (task E1) to edit one.
// It only collects the input and shows the server's answer; the server checks every rule.
import { useState, type FormEvent, type ReactNode } from "react";
import { Field } from "@/components/account/Field";
import { FormMessage } from "@/components/account/FormMessage";
import { Button } from "@/components/ui/Button";
import type { PostResult } from "@/lib/client/post-json";

export type EventFormValues = { title: string; start: string; end: string; mayOverlap: boolean };

type Props = {
  /** Prefix for the field ids, so two forms on one page do not share ids ("new", or the event id). */
  idPrefix: string;
  initial: EventFormValues;
  submitLabel: string;
  /** Sends the values to the server and returns its answer. */
  onSubmit: (values: EventFormValues) => Promise<PostResult>;
  /** Called after the server accepted; for example to clear the form or close it. */
  onSaved?: () => void;
  /** Extra buttons next to the submit button (for example "Cancel"). */
  children?: ReactNode;
};

export function EventForm({ idPrefix, initial, submitLabel, onSubmit, onSaved, children }: Props) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PostResult | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    const answer = await onSubmit({
      title: String(form.get("title") ?? ""),
      start: String(form.get("start") ?? ""),
      end: String(form.get("end") ?? ""),
      mayOverlap: form.get("mayOverlap") === "on",
    });
    setResult(answer);
    setBusy(false);
    if (answer.ok) onSaved?.();
  }

  return (
    <form onSubmit={submit} noValidate>
      <Field id={`${idPrefix}-title`} name="title" label="Title" defaultValue={initial.title} required />
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field id={`${idPrefix}-start`} name="start" type="datetime-local" label="Start" defaultValue={initial.start} required />
        <Field id={`${idPrefix}-end`} name="end" type="datetime-local" label="End" defaultValue={initial.end} required />
      </div>
      <div className="mt-4 flex items-center gap-2">
        <input
          id={`${idPrefix}-may-overlap`}
          name="mayOverlap"
          type="checkbox"
          defaultChecked={initial.mayOverlap}
          className="size-4 accent-ink"
        />
        <label htmlFor={`${idPrefix}-may-overlap`} className="text-sm">
          May overlap other events
        </label>
      </div>
      {result && <FormMessage tone={result.ok ? "success" : "error"} text={result.message} />}
      <div className="mt-6 flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
        {children}
      </div>
    </form>
  );
}
