"use client";

// delete_event on the week page: a "Delete" button asks "Delete '<title>'?" in place, with
// "Yes, delete" (focused when the question opens) and "Cancel". Escape or Cancel closes the question.
// After a delete "Event deleted." is announced and the week reloads. A rejection shows its message;
// after "Changed on another device" the question also offers "Reload" to see the latest version.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FormMessage } from "@/components/account/FormMessage";
import { Button } from "@/components/ui/Button";
import { postJson } from "@/lib/client/post-json";
import type { WeekEvent } from "@/lib/events/types";

type Failure = { message: string; conflict: boolean };

export function DeleteEvent({ event }: { event: WeekEvent }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [deleted, setDeleted] = useState<string | null>(null);

  // Moves keyboard focus onto "Yes, delete" when the question opens.
  useEffect(() => {
    if (asking) document.getElementById(`${event.id}-confirm-delete`)?.focus();
  }, [asking, event.id]);

  function close() {
    setAsking(false);
    setFailure(null);
  }

  async function confirm() {
    setBusy(true);
    // updatedAt is the version this device last saw; the server rejects the delete if the event changed since.
    const answer = await postJson(`/api/events/${event.id}/delete`, { updatedAt: event.updatedAt });
    setBusy(false);
    if (answer.ok) {
      setAsking(false);
      setFailure(null);
      setDeleted(answer.message);
      router.refresh();
    } else {
      setFailure({ message: answer.message, conflict: answer.status === 409 });
    }
  }

  if (deleted) {
    return (
      <p role="status" className="w-full rounded-xl bg-success-soft px-3 py-2 text-sm text-success">
        {deleted}
      </p>
    );
  }

  if (!asking) {
    return (
      <Button
        variant="secondary"
        className="h-8 px-3 text-xs"
        onClick={() => {
          setFailure(null);
          setAsking(true);
        }}
      >
        Delete
      </Button>
    );
  }

  return (
    <div className="w-full" onKeyDown={(key) => key.key === "Escape" && close()}>
      <p className="text-sm font-medium">{`Delete '${event.title}'?`}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          id={`${event.id}-confirm-delete`}
          className="h-8 px-3 text-xs"
          disabled={busy}
          onClick={confirm}
        >
          Yes, delete
        </Button>
        <Button variant="ghost" className="h-8 px-3 text-xs" onClick={close}>
          Cancel
        </Button>
        {failure?.conflict && (
          <Button
            variant="secondary"
            className="h-8 px-3 text-xs"
            onClick={() => {
              close();
              router.refresh();
            }}
          >
            Reload
          </Button>
        )}
      </div>
      {failure && <FormMessage tone="error" text={failure.message} />}
    </div>
  );
}
