"use client";

// edit_event on the week page: an "Edit" button opens the event form under the event, with this
// event's values. Escape or Cancel closes it. After a save the form closes, "Event saved." is
// announced and the week reloads. After a conflict (another device saved first) the form offers
// "Reload" to see the latest version.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { postJson } from "@/lib/client/post-json";
import type { WeekEvent } from "@/lib/events/types";
import { Button } from "@/components/ui/Button";
import { EventForm, type EventFormValues } from "./EventForm";

export function EditEvent({ event }: { event: WeekEvent }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  // Moves keyboard focus into the form when it opens.
  useEffect(() => {
    if (open) document.getElementById(`${event.id}-title`)?.focus();
  }, [open, event.id]);

  function close() {
    setOpen(false);
    setConflict(false);
  }

  async function save(values: EventFormValues) {
    // updatedAt is the version this device last saw; the server rejects the save if the event changed since.
    const answer = await postJson(`/api/events/${event.id}/edit`, { ...values, updatedAt: event.updatedAt });
    if (answer.ok) {
      setSaved(answer.message);
      router.refresh();
    } else {
      setConflict(answer.status === 409);
    }
    return answer;
  }

  if (!open) {
    return (
      <>
        <Button
          variant="secondary"
          className="h-8 px-3 text-xs"
          onClick={() => {
            setSaved(null);
            setOpen(true);
          }}
        >
          Edit
        </Button>
        {saved && (
          <p role="status" className="mt-2 w-full rounded-xl bg-success-soft px-3 py-2 text-sm text-success">
            {saved}
          </p>
        )}
      </>
    );
  }

  return (
    <div className="w-full" onKeyDown={(key) => key.key === "Escape" && close()}>
      <EventForm
        idPrefix={event.id}
        initial={{ title: event.title, start: event.startLocal, end: event.endLocal, mayOverlap: event.mayOverlap }}
        submitLabel="Save"
        onSubmit={save}
        onSaved={close}
      >
        {conflict && (
          <Button
            variant="secondary"
            onClick={() => {
              close();
              router.refresh();
            }}
          >
            Reload
          </Button>
        )}
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
      </EventForm>
    </div>
  );
}
