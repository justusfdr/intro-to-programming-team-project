"use client";

// The event editor, in the prototype's style: a card that floats at the right on wider screens and a
// sheet from the bottom on phones. It is a native <dialog>: the browser keeps keyboard focus inside it,
// closes it on Escape and puts the focus back where it was when it opened.
//
// It creates an event or a series (create_event), or edits, deletes and marks done an existing one
// (edit_event, delete_event, mark_event_done, mark_event_planned). An event can be all day (first and
// last day, no times, no goal, R29). For an event of a series, saving and deleting first ask
// "This event" or "This and following events" (R28). It only collects the input and shows the
// server's answer; the server checks every rule.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type Ref } from "react";
import { FormMessage } from "@/components/account/FormMessage";
import { Button, LinkButton } from "@/components/ui/Button";
import { Check, Close, Trash, Warning } from "@/components/ui/icons";
import { postJson, type PostResult } from "@/lib/client/post-json";
import { weekdayOf, type Weekday } from "@/lib/events/repeat";
import type { CalendarEvent, EventDto } from "@/lib/events/types";
import { addDays } from "@/lib/time/zoned";
import { useAnnounce } from "./Announcer";
import type { GoalLabel } from "./TimeGrid";

/** What the editor shows: a new event with suggested times, or an existing event. */
export type EditorState =
  /** `repeat` is the choice the Repeat list starts with (default: does not repeat). */
  | { mode: "create"; start: string; end: string; repeat?: Frequency }
  | { mode: "edit"; event: CalendarEvent }
  | null;

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

export type Frequency = "none" | "daily" | "weekly" | "monthly";

const WEEKDAYS: { day: Weekday; short: string; long: string }[] = [
  { day: 1, short: "Mon", long: "Monday" },
  { day: 2, short: "Tue", long: "Tuesday" },
  { day: 3, short: "Wed", long: "Wednesday" },
  { day: 4, short: "Thu", long: "Thursday" },
  { day: 5, short: "Fri", long: "Friday" },
  { day: 6, short: "Sat", long: "Saturday" },
  { day: 7, short: "Sun", long: "Sunday" },
];

/** What the footer asks before an action on an event of a series: save these values, or delete. */
type ScopeQuestion = { kind: "save"; values: Record<string, unknown> } | { kind: "delete" } | null;

/** The form's starting values. Timed and all-day fields both get values, so the switch can flip. */
function initialValues(state: Exclude<EditorState, null>) {
  if (state.mode === "create") {
    const day = state.start.slice(0, 10);
    return { title: "", start: state.start, end: state.end, firstDay: day, lastDay: day, allDay: false, mayOverlap: false, goalId: "" };
  }
  const event = state.event;
  if (event.allDay) {
    const { firstDay, lastDay } = event;
    return { title: event.title, start: `${firstDay}T09:00`, end: `${firstDay}T10:00`, firstDay, lastDay, allDay: true, mayOverlap: false, goalId: "" };
  }
  const day = event.startLocal.slice(0, 10);
  return {
    title: event.title,
    start: event.startLocal,
    end: event.endLocal,
    firstDay: day,
    lastDay: day,
    allDay: false,
    mayOverlap: event.mayOverlap,
    goalId: event.goalId ?? "",
  };
}

type SeriesQuestionProps = {
  kind: "save" | "delete";
  title: string;
  busy: boolean;
  firstButton?: Ref<HTMLButtonElement>;
  onAnswer: (scope: "this" | "this_and_following") => void;
  onCancel: () => void;
};

/** The question before saving or deleting an event of a series (R28), in the editor's footer. */
export function SeriesQuestion({ kind, title, busy, firstButton, onAnswer, onCancel }: SeriesQuestionProps) {
  const variant = kind === "delete" ? "danger" : "primary";
  return (
    <>
      <p className="w-full text-sm font-medium">{kind === "delete" ? `Delete '${title}'?` : `Save changes to '${title}'?`}</p>
      <Button ref={firstButton} variant={variant} size="sm" disabled={busy} onClick={() => onAnswer("this")}>
        This event
      </Button>
      <Button variant={kind === "delete" ? "danger" : "secondary"} size="sm" disabled={busy} onClick={() => onAnswer("this_and_following")}>
        This and following events
      </Button>
      <Button variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </>
  );
}

function EditorBody({ state, goals, onClose }: { state: Exclude<EditorState, null>; goals: GoalLabel[]; onClose: () => void }) {
  const router = useRouter();
  const announce = useAnnounce();
  // The event as last saved: marking done updates it, so a later save carries the new updated_at (R4).
  const [event, setEvent] = useState<CalendarEvent | null>(state.mode === "edit" ? state.event : null);
  const [result, setResult] = useState<PostResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [question, setQuestion] = useState<ScopeQuestion>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);

  const initial = initialValues(state);
  const [allDay, setAllDay] = useState(initial.allDay);
  // The start is followed so the weekly repeat can show the first date's weekday (always included, R28).
  const [start, setStart] = useState(initial.start);
  const [frequency, setFrequency] = useState<Frequency>(state.mode === "create" ? (state.repeat ?? "none") : "none");
  const [weekdays, setWeekdays] = useState<Weekday[]>([]);

  useEffect(() => {
    if (confirmingDelete || question) confirmButton.current?.focus();
  }, [confirmingDelete, question]);

  const prefix = event ? event.id : "new";
  const inSeries = Boolean(event?.seriesId);
  const firstWeekday = /^\d{4}-\d{2}-\d{2}/.test(start) ? weekdayOf(start.slice(0, 10)) : null;

  /** Sends one action; on success announces the message, closes the editor and reloads the week. */
  async function run(path: string, body: unknown, { close = true } = {}) {
    setBusy(true);
    const answer = await postJson(path, body);
    setBusy(false);
    setQuestion(null);
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
    const title = String(form.get("title") ?? "");
    const values: Record<string, unknown> = allDay
      ? { title, allDay: true, firstDay: String(form.get("firstDay") ?? ""), lastDay: String(form.get("lastDay") ?? "") }
      : {
          title,
          start: String(form.get("start") ?? ""),
          end: String(form.get("end") ?? ""),
          mayOverlap: form.get("mayOverlap") === "on",
          // "" is "No goal": the server takes null.
          goalId: String(form.get("goal") ?? "") || null,
        };
    if (!event && !allDay && frequency !== "none") {
      values.repeat = {
        frequency,
        weekdays: frequency === "weekly" ? [...new Set([...weekdays, ...(firstWeekday ? [firstWeekday] : [])])].sort((a, b) => a - b) : [],
        until: String(form.get("until") ?? ""),
      };
    }
    if (!event) return run("/api/events", values);
    // An event of a series: ask first (R28).
    if (inSeries) return setQuestion({ kind: "save", values });
    return run(`/api/events/${event.id}/edit`, { ...values, updatedAt: event.updatedAt });
  }

  function answerScope(scope: "this" | "this_and_following") {
    if (!event || !question) return;
    if (question.kind === "save") return run(`/api/events/${event.id}/edit`, { ...question.values, updatedAt: event.updatedAt, scope });
    return run(`/api/events/${event.id}/delete`, { updatedAt: event.updatedAt, scope });
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
  const conflict = event && !event.allDay && event.conflict;

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

        {event && (event.status === "done" || conflict || inSeries) && (
          <div className="-mt-2 flex flex-wrap gap-1.5">
            {inSeries && (
              <span className="inline-flex h-5 items-center rounded-full bg-raised px-2 text-[11px] font-medium text-ink-2">Repeating</span>
            )}
            {event.status === "done" && (
              <span className="inline-flex h-5 items-center gap-1 rounded-full bg-success-soft px-2 text-[11px] font-medium text-success">
                <Check className="size-3" /> Done
              </span>
            )}
            {conflict && (
              <span className="inline-flex h-5 items-center gap-1 rounded-full bg-danger-soft px-2 text-[11px] font-medium text-danger">
                <Warning className="size-3" /> Overlaps another event
              </span>
            )}
          </div>
        )}

        <section className="flex flex-col gap-1.5">
          <Eyebrow>When</Eyebrow>
          {/* A series is timed (R29), so its events do not offer the switch. */}
          {!inSeries && (
            <label htmlFor={`${prefix}-all-day`} className="flex items-center justify-between gap-2 text-sm text-ink">
              All day
              <input
                id={`${prefix}-all-day`}
                type="checkbox"
                role="switch"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="size-4 accent-ink"
              />
            </label>
          )}
          {allDay ? (
            <div className="grid gap-2">
              <div className="grid grid-cols-[4.5rem_1fr] items-center gap-2 text-xs text-ink-2">
                <label htmlFor={`${prefix}-first-day`}>First day</label>
                <input id={`${prefix}-first-day`} name="firstDay" type="date" defaultValue={initial.firstDay} className={inputClass} />
              </div>
              <div className="grid grid-cols-[4.5rem_1fr] items-center gap-2 text-xs text-ink-2">
                <label htmlFor={`${prefix}-last-day`}>Last day</label>
                <input id={`${prefix}-last-day`} name="lastDay" type="date" defaultValue={initial.lastDay} className={inputClass} />
              </div>
            </div>
          ) : (
            <div className="grid gap-2">
              <div className="grid grid-cols-[4.5rem_1fr] items-center gap-2 text-xs text-ink-2">
                <label htmlFor={`${prefix}-start`}>Starts</label>
                <input
                  id={`${prefix}-start`}
                  name="start"
                  type="datetime-local"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-[4.5rem_1fr] items-center gap-2 text-xs text-ink-2">
                <label htmlFor={`${prefix}-end`}>Ends</label>
                <input id={`${prefix}-end`} name="end" type="datetime-local" defaultValue={initial.end} className={inputClass} />
              </div>
            </div>
          )}
        </section>

        {/* Repeat (R28): only when creating a timed event; a series is never extended later. */}
        {!event && !allDay && (
          <section className="flex flex-col gap-1.5">
            <Eyebrow htmlFor="new-repeat">Repeat</Eyebrow>
            <select id="new-repeat" value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} className={inputClass}>
              <option value="none">Does not repeat</option>
              <option value="daily">Every day</option>
              <option value="weekly">Every week</option>
              <option value="monthly">Every month</option>
            </select>
            {frequency === "weekly" && (
              <fieldset className="flex flex-wrap gap-1">
                <legend className="sr-only">On these days</legend>
                {WEEKDAYS.map(({ day, short, long }) => {
                  const fixed = day === firstWeekday;
                  const checked = fixed || weekdays.includes(day);
                  return (
                    <label
                      key={day}
                      title={fixed ? `${long}: the first date's day, always included` : long}
                      className={`flex h-8 min-w-10 cursor-pointer items-center justify-center rounded-lg border px-2 text-xs font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink/20 ${
                        checked ? "border-ink bg-ink text-surface" : "border-line text-ink-2"
                      } ${fixed ? "cursor-default opacity-80" : ""}`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        aria-label={long}
                        checked={checked}
                        disabled={fixed}
                        onChange={(e) => setWeekdays((days) => (e.target.checked ? [...days, day] : days.filter((d) => d !== day)))}
                      />
                      {short}
                    </label>
                  );
                })}
              </fieldset>
            )}
            {frequency !== "none" && (
              <div className="grid grid-cols-[4.5rem_1fr] items-center gap-2 text-xs text-ink-2">
                <label htmlFor="new-until">Until</label>
                <input id="new-until" name="until" type="date" defaultValue={addDays(initial.firstDay, 28)} className={inputClass} />
              </div>
            )}
          </section>
        )}

        {!allDay && (
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
        )}

        {/* All-day events have no goal (R29). */}
        {!allDay && (
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
        )}

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
        {question && event ? (
          <SeriesQuestion
            kind={question.kind}
            title={event.title}
            busy={busy}
            firstButton={confirmButton}
            onAnswer={answerScope}
            onCancel={() => setQuestion(null)}
          />
        ) : confirmingDelete && event ? (
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
            {/* All-day events cannot be done and do not suggest a focus session (R29). */}
            {event && !event.allDay && (
              <Button variant="secondary" size="sm" disabled={busy} onClick={toggleDone}>
                {event.status === "done" ? "Mark not done" : "Mark done"}
              </Button>
            )}
            {event && !event.allDay && (
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
                onClick={() => (inSeries ? setQuestion({ kind: "delete" }) : setConfirmingDelete(true))}
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

