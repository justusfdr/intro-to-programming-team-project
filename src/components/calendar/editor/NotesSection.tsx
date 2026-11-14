"use client";

// NOTES (issue #5, spec 27): the user's own text about an event, up to 2,000 characters. It waits for the
// editor's Save button like the location (R39). The field grows with the text; a quiet count appears from
// 1,800 characters, and above 2,000 the message shows (the server and the database refuse it too).
// Notes stay in the app: never sent to Outlook or to Claude. Outlook events have none (R11), so the
// editor leaves this section out for them.
import { useId, useLayoutEffect, useRef } from "react";
import { MAX_NOTES, NOTES_COUNT_FROM, notesLength, notesTooLong } from "@/lib/events/notes";
import { MESSAGES } from "@/lib/messages";
import { Eyebrow } from "../fields";

/** About twelve lines; longer notes scroll inside the field. */
const MAX_HEIGHT_PX = 240;

export function NotesSection({ value, onChange }: { value: string; onChange: (notes: string) => void }) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const count = notesLength(value);
  const tooLong = notesTooLong(value);

  // Grow with the text, up to the maximum height.
  useLayoutEffect(() => {
    const field = ref.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight + 2, MAX_HEIGHT_PX)}px`;
  }, [value]);

  return (
    <section className="flex flex-col gap-1.5">
      <Eyebrow>Notes</Eyebrow>
      <textarea
        ref={ref}
        aria-label="Notes"
        aria-invalid={tooLong}
        aria-describedby={tooLong || count >= NOTES_COUNT_FROM ? `${id}-count` : undefined}
        placeholder="Add notes"
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`scroll-thin block w-full resize-none rounded-lg border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-ink/10 ${
          tooLong ? "border-danger focus:border-danger" : "border-line focus:border-ink"
        }`}
      />
      {tooLong ? (
        <p id={`${id}-count`} role="alert" className="text-xs text-danger tabular">
          {MESSAGES.notesLength} ({count.toLocaleString("en-US")})
        </p>
      ) : (
        count >= NOTES_COUNT_FROM && (
          <p id={`${id}-count`} className="text-right text-xs text-ink-3 tabular">
            {count.toLocaleString("en-US")} / {MAX_NOTES.toLocaleString("en-US")}
          </p>
        )
      )}
    </section>
  );
}
