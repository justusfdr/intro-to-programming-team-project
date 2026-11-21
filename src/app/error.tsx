"use client";

// Shown when a page cannot load its data, for example when the database is down (ontology section 7).
// "Try again" asks the server for the page again (issue #209); there is also a way back to the calendar.
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button, LinkButton } from "@/components/ui/Button";
import { MESSAGES } from "@/lib/messages";
import { retryPage } from "@/lib/retry-page";

export default function PageError({ reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <p role="alert" className="text-lg">
        {MESSAGES.databaseDown}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button disabled={pending} onClick={() => retryPage(() => router.refresh(), reset, startTransition)}>
          Try again
        </Button>
        <LinkButton href="/" variant="secondary">
          Back to the calendar
        </LinkButton>
      </div>
    </main>
  );
}
