"use client";

// mark_event_done and mark_event_planned on the week page: "Mark done" for a planned event,
// "Mark not done" for a done one. After a change the week reloads. A rejection (marking done before
// the event has started) shows its message under the event.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormMessage } from "@/components/account/FormMessage";
import { Button } from "@/components/ui/Button";
import { postJson } from "@/lib/client/post-json";
import type { WeekEvent } from "@/lib/events/types";

export function EventStatusToggle({ event }: { event: WeekEvent }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const done = event.status === "done";

  async function toggle() {
    setBusy(true);
    setFailure(null);
    const answer = await postJson(`/api/events/${event.id}/${done ? "planned" : "done"}`, {});
    setBusy(false);
    if (answer.ok) router.refresh();
    else setFailure(answer.message);
  }

  return (
    <div className="w-full">
      <Button variant="secondary" className="h-8 px-3 text-xs" disabled={busy} onClick={toggle}>
        {done ? "Mark not done" : "Mark done"}
      </Button>
      {failure && <FormMessage tone="error" text={failure} />}
    </div>
  );
}
