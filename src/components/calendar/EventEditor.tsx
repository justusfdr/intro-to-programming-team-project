"use client";

// The event editor, in the prototype's style: a card that floats at the right on wider screens and a
// sheet from the bottom on phones. It is a native <dialog>: the browser keeps keyboard focus inside it,
// closes it on Escape and puts the focus back where it was when it opened.
//
// It creates an event (create_event), or edits, deletes and marks done an existing one
// (edit_event, delete_event, mark_event_done, mark_event_planned). It only collects the input and
// shows the server's answer; the server checks every rule.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { FormMessage } from "@/components/account/FormMessage";
import { Button, LinkButton } from "@/components/ui/Button";
import { Check, Close, Trash, Warning } from "@/components/ui/icons";
import { postJson, type PostResult } from "@/lib/client/post-json";
import type { EventDto, WeekEvent } from "@/lib/events/types";
import { useAnnounce } from "./Announcer";
import type { GoalLabel } from "./TimeGrid";

/** What the editor shows: a new event with suggested times, or an existing event. */
export type EditorState = { mode: "create"; start: string; end: string } | { mode: "edit"; event: WeekEvent } | null;

type Props = {
  state: EditorState;
  /** The user's goals, for the Goal list ("No goal" is always there). */
  goals: GoalLabel[];
  onClose: () => void;
};

const inputClass =
  "block h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10";

function Eyebrow({ children, htmlFor }: { children: string; htmlFor?: string }) {
  const className = "text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3";
  return htmlFor ? (
    <label htmlFor={htmlFor} className={className}>
      {children}
    </label>
  ) : (
    <p className={className}>{children}</p>
  );
}

export function EventEditor({ state, goals, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const open = state !== null;

  // Open and close the native dialog together with the state.
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="editor-title"
      onClose={onClose}
      // A click on the dimmed area around the card closes it, like the prototype.
      onClick={(event) => event.target === dialog.current && onClose()}
      className="event-editor m-0 mt-auto max-h-[88dvh] w-full max-w-none overflow-hidden rounded-t-panel border border-line-subtle bg-surface p-0 text-ink shadow-pop sm:mt-4 sm:mr-4 sm:ml-auto sm:max-h-[calc(100dvh-2rem)] sm:w-[360px] sm:rounded-card"
    >
      {/* A new key for every event gives the form fresh fields and messages. */}
      {state && <EditorBody key={state.mode === "edit" ? state.event.id : "new"} state={state} goals={goals} onClose={onClose} />}
    </dialog>
  );
}

function EditorBody({ state, goals, onClose }: { state: Exclude<EditorState, null>; goals: GoalLabel[]; onClose: () => void }) {
  const router = useRouter();
  const announce = useAnnounce();
  // The event as last saved: marking done updates it, so a later save carries the new updated_at (R4).
  const [event, setEvent] = useState<WeekEvent | null>(state.mode === "edit" ? state.event : null);
  const [result, setResult] = useState<PostResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const confirmButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirmingDelete) confirmButton.current?.focus();
  }, [confirmingDelete]);

  const prefix = event ? event.id : "new";
  const initial = event
    ? { title: event.title, start: event.startLocal, end: event.endLocal, mayOverlap: event.mayOverlap, goalId: event.goalId ?? "" }
    : {
        title: "",
        start: state.mode === "create" ? state.start : "",
        end: state.mode === "create" ? state.end : "",
        mayOverlap: false,
        goalId: "",
      };

  /** Sends one action; on success announces the message, closes the editor and reloads the week. */
  async function run(path: string, body: unknown, { close = true } = {}) {
    setBusy(true);
    const answer = await postJson(path, body);
    setBusy(false);
    setResult(answer.ok ? null : answer);
    if (!answer.ok) return null;
    if (answer.message) announce(answer.message);
    router.refresh();
    if (close) onClose();
    return answer;
  }

  async function save(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const form = new FormData(formEvent.currentTarget);
    const values = {
      title: String(form.get("title") ?? ""),
      start: String(form.get("start") ?? ""),
      end: String(form.get("end") ?? ""),
      mayOverlap: form.get("mayOverlap") === "on",
      // "" is "No goal": the server takes null.
      goalId: String(form.get("goal") ?? "") || null,
    };
    if (event) await run(`/api/events/${event.id}/edit`, { ...values, updatedAt: event.updatedAt });
    else await run("/api/events", values);
  }

  async function toggleDone() {
    if (!event) return;
    setBusy(true);
    const answer = await postJson(`/api/events/${event.id}/${event.status === "done" ? "planned" : "done"}`, {});
    setBusy(false);
    setResult(answer.ok ? null : answer);
    if (!answer.ok) return;
    // Keep the editor open (as in the prototype) and show the new state.
    const saved = (answer.data as { event?: EventDto } | undefined)?.event;
    if (saved) setEvent({ ...event, status: saved.status, updatedAt: saved.updatedAt });
    router.refresh();
  }

  const stale = result?.status === 409 && result.message.startsWith("Changed on another device");

  return (
    <form onSubmit={save} noValidate className="flex max-h-[inherit] flex-col">
      <div className="scroll-thin flex flex-col gap-4 overflow-y-auto p-4">
        <div className="flex items-start gap-3">
          <h2 id="editor-title" className="sr-only">
            {event ? `Edit ${event.title}` : "New event"}
          </h2>
          <div className="min-w-0 flex-1">
            <label htmlFor={`${prefix}-title`} className="sr-only">
              Title
            </label>
            <input
              id={`${prefix}-title`}
              name="title"
              defaultValue={initial.title}
              placeholder="Event title"
              autoFocus
              className="-mx-1.5 block w-full min-w-0 rounded-md bg-transparent px-1.5 py-0.5 text-[15px] font-semibold leading-6 text-ink placeholder:text-ink-3 hover:bg-raised focus:bg-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 flex size-7 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
          >
            <Close />
          </button>
        </div>

        {event && (event.status === "done" || event.conflict) && (
          <div className="-mt-2 flex flex-wrap gap-1.5">
            {event.status === "done" && (
              <span className="inline-flex h-5 items-center gap-1 rounded-full bg-success-soft px-2 text-[11px] font-medium text-success">
                <Check className="size-3" /> Done
              </span>
            )}
            {event.conflict && (
              <span className="inline-flex h-5 items-center gap-1 rounded-full bg-danger-soft px-2 text-[11px] font-medium text-danger">
                <Warning className="size-3" /> Overlaps another event
              </span>
            )}
          </div>
        )}

        <section className="flex flex-col gap-1.5">
          <Eyebrow>When</Eyebrow>
          <div className="grid gap-2">
            <div className="grid grid-cols-[3.25rem_1fr] items-center gap-2 text-xs text-ink-2">
              <label htmlFor={`${prefix}-start`}>Starts</label>
              <input id={`${prefix}-start`} name="start" type="datetime-local" defaultValue={initial.start} className={inputClass} />
            </div>
            <div className="grid grid-cols-[3.25rem_1fr] items-center gap-2 text-xs text-ink-2">
              <label htmlFor={`${prefix}-end`}>Ends</label>
              <input id={`${prefix}-end`} name="end" type="datetime-local" defaultValue={initial.end} className={inputClass} />
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-1.5">
          <Eyebrow>Overlap</Eyebrow>
          <label htmlFor={`${prefix}-may-overlap`} className="flex items-center gap-2 text-sm text-ink">
            <input
              id={`${prefix}-may-overlap`}
              name="mayOverlap"
              type="checkbox"
              defaultChecked={initial.mayOverlap}
              className="size-4 accent-ink"
            />
            May overlap other events
          </label>
        </section>

        <section className="flex flex-col gap-1.5">
          <Eyebrow htmlFor={`${prefix}-goal`}>Goal</Eyebrow>
          <select id={`${prefix}-goal`} name="goal" defaultValue={initial.goalId} className={inputClass}>
            <option value="">No goal</option>
            {goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.title}
              </option>
            ))}
          </select>
        </section>

        {result && <FormMessage tone="error" text={result.message} />}
        {stale && (
          <Button
            variant="secondary"
            size="sm"
            className="w-fit"
            onClick={() => {
              router.refresh();
              onClose();
            }}
          >
            Reload
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line-subtle bg-surface px-4 py-3">
        {confirmingDelete && event ? (
          <>
            <p className="w-full text-sm font-medium">{`Delete '${event.title}'?`}</p>
            <Button
              ref={confirmButton}
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={() => run(`/api/events/${event.id}/delete`, { updatedAt: event.updatedAt })}
            >
              Yes, delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? "Saving…" : event ? "Save" : "Add event"}
            </Button>
            {event && (
              <Button variant="secondary" size="sm" disabled={busy} onClick={toggleDone}>
                {event.status === "done" ? "Mark not done" : "Mark done"}
              </Button>
            )}
            {event && (
              <LinkButton href={`/focus?event=${event.id}`} variant="secondary" size="sm">
                Start focus
              </LinkButton>
            )}
            {event && (
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto size-8"
                aria-label={`Delete ${event.title}`}
                title="Delete"
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash />
              </Button>
            )}
          </>
        )}
      </div>
    </form>
  );
}
