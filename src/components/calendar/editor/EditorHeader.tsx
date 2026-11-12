"use client";

// The editor's head, as in the prototype: the goal's tile, the title (a field for our own events, text
// for an Outlook event, R11) and the close button (phones close the sheet with its own button).
// Typing in the title is saved when the field is left or after a short pause (onType); Enter leaves the
// field; Esc puts back the title it had when the field was entered and keeps the panel open.
import { useRef, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { GoalTile } from "@/components/goals/GoalTile";
import type { GoalLook } from "@/lib/goals/style";

type Props = {
  look: GoalLook | null;
  title: string;
  /** False for an Outlook event: the title is Outlook's (R11). */
  editable: boolean;
  /** Each key: the field shows it and a save follows after a pause. */
  onType: (title: string) => void;
  /** The field was left (or Esc put the old title back): save now. */
  onDone: (title?: string) => void;
  onClose: () => void;
};

export function EditorHeader({ look, title, editable, onType, onDone, onClose }: Props) {
  // The title when the field was entered: Esc goes back to it.
  const atFocus = useRef(title);
  const cancelled = useRef(false);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // IME composition (for example Japanese): the input method owns Enter and Esc.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      // preventDefault: Esc ends the typing, not the panel.
      e.preventDefault();
      cancelled.current = true;
      onDone(atFocus.current);
      e.currentTarget.blur();
    }
  };

  return (
    <div className="flex items-start gap-3">
      <GoalTile look={look} size="md" />
      <div className="min-w-0 flex-1">
        {editable ? (
          <input
            aria-label="Title"
            placeholder="Event title"
            maxLength={100}
            value={title}
            onFocus={() => {
              atFocus.current = title;
              cancelled.current = false;
            }}
            onChange={(e) => onType(e.target.value)}
            onBlur={() => {
              if (cancelled.current) cancelled.current = false;
              else onDone();
            }}
            onKeyDown={onKeyDown}
            className="-mx-1.5 block w-full min-w-0 rounded-md bg-transparent px-1.5 py-0.5 text-[15px] font-semibold leading-6 text-ink placeholder:text-ink-3 hover:bg-raised focus:bg-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
          />
        ) : (
          <p className="break-words text-[15px] font-semibold leading-6 text-ink">{title}</p>
        )}
      </div>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="-mr-1 hidden size-7 shrink-0 items-center justify-center rounded-md text-ink-3 sm:flex hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
      >
        <X className="size-4" strokeWidth={1.8} />
      </button>
    </div>
  );
}
