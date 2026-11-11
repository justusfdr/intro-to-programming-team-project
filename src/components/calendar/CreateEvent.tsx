"use client";

// create_event on the week page. After the server saves, the form is cleared, "Event saved." is
// shown and the page reloads its data, so the new event appears in its day.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/client/post-json";
import { EventForm, type EventFormValues } from "./EventForm";

export function CreateEvent({ initial }: { initial: EventFormValues }) {
  const router = useRouter();
  // Changing the key gives a fresh, empty form after each saved event.
  const [formKey, setFormKey] = useState(0);
  const [saved, setSaved] = useState<string | null>(null);

  async function create(values: EventFormValues) {
    const answer = await postJson("/api/events", values);
    if (answer.ok) {
      setSaved(answer.message);
      setFormKey((key) => key + 1);
      router.refresh();
    } else {
      setSaved(null);
    }
    return answer;
  }

  return (
    <section aria-labelledby="new-event-title" className="rounded-card border border-line-subtle bg-surface p-5">
      <h2 id="new-event-title" className="text-lg font-semibold">
        New event
      </h2>
      <div className="mt-4">
        <EventForm key={formKey} idPrefix="new" initial={initial} submitLabel="Add event" onSubmit={create} />
        {saved && (
          <p role="status" className="mt-4 rounded-xl bg-success-soft px-3 py-2 text-sm text-success">
            {saved}
          </p>
        )}
      </div>
    </section>
  );
}
