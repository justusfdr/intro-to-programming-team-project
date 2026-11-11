"use client";

// Shown when a page cannot load its data, for example when the database is down (ontology section 7).
import { Button } from "@/components/ui/Button";
import { MESSAGES } from "@/lib/messages";

export default function PageError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <p role="alert" className="text-lg">
        {MESSAGES.databaseDown}
      </p>
      <Button className="mt-6" onClick={() => reset()}>
        Try again
      </Button>
    </main>
  );
}
