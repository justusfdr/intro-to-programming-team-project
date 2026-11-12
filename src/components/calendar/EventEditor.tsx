"use client";

// The event editor, in the prototype's style (spec 10): a panel at the right edge on wider screens and
// a sheet from the bottom on phones. It is a native <dialog>: the browser keeps keyboard focus inside it,
// closes it on Escape and puts the focus back where it was when it opened.
//
// It creates an event or a series (create_event), or edits, deletes and marks done an existing one
// (edit_event, delete_event, mark_event_done, mark_event_planned). An event can be all day (first and
// last day, no times, no goal, R29). For an event of a series, saving and deleting first ask
// "This event" or "This and following events" (R28). It only collects the input and shows the
// server's answer; the server checks every rule. The week shows a saved, deleted or done event as soon
// as the answer arrives ("Mark done" at once) and re-reads in the background (components/live/Live.tsx).
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type Ref } from "react";
import { FormMessage } from "@/components/account/FormMessage";
import { Button, LinkButton } from "@/components/ui/Button";
import { GoalTile } from "@/components/goals/GoalTile";
import { CalendarDays, Check, MapPin, Play, Trash2, TriangleAlert, X } from "lucide-react";
import { NotSentIcon } from "@/components/ui/icons";
import { formatMinute } from "@/lib/events/grid";
import { useDisplay } from "@/components/shell/DisplayProvider";
import { fmtDateLong, fmtMinutes, fmtTime, type TimeFormat } from "@/lib/time/display";
import { MESSAGES } from "@/lib/messages";
import { postJson, type PostResult } from "@/lib/client/post-json";
import { weekdayOf, type Weekday } from "@/lib/events/repeat";
import type { CalendarEvent, EventDto } from "@/lib/events/types";
import { addDays } from "@/lib/time/zoned";
import { type Changes, useLive } from "@/components/live/Live";
import { withEventChange, withEventStatus } from "@/lib/events/week-view";
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
  /** Connected to Outlook: after a change the editor asks the server to send it right away (R26). */
  outlookConnected?: boolean;
  onClose: () => void;
};

const inputClass =
  "block h-10 w-full min-w-0 rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10";
/** A box that shows a value as text, in the same frame as the fields. */
const boxClass = "flex min-h-10 items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm";
const eyebrowClass = "text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3";

function Eyebrow({ children, htmlFor }: { children: string; htmlFor?: string }) {
  const className = eyebrowClass;
  return htmlFor ? (
    <label htmlFor={htmlFor} className={className}>
      {children}
    </label>
  ) : (
    <p className={className}>{children}</p>
  );
}

export function EventEditor({ state, goals, outlookConnected = false, onClose }: Props) {
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
      className="event-editor m-0 mt-auto max-h-[88dvh] w-full max-w-none overflow-hidden rounded-t-panel border border-line-subtle bg-surface p-0 text-ink shadow-pop sm:my-2 sm:mr-2 sm:ml-auto sm:h-[calc(100dvh-1rem)] sm:max-h-none sm:w-[380px] sm:rounded-[20px]"
    >
      {/* A new key for every event gives the form fresh fields and messages. */}
      {state && (
        <EditorBody
          key={state.mode === "edit" ? state.event.id : "new"}
          state={state}
          goals={goals}
          outlookConnected={outlookConnected}
          onClose={onClose}
        />
      )}
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

/** When an Outlook event takes place, in words (its editor shows it as text, R11). */
function whenText(event: CalendarEvent, format: TimeFormat): string {
  if (event.allDay) {
    const first = fmtDateLong(event.firstDay);
    return event.lastDay === event.firstDay ? `${first}, all day` : `${first} to ${fmtDateLong(event.lastDay)}, all day`;
  }
  const endTime = fmtTime(event.endTime, format);
  const end = event.endDay ? `${endTime} the next day` : endTime;
  return `${fmtDateLong(event.startLocal.slice(0, 10))}, ${fmtTime(event.startTime, format)} to ${end}`;
}

type BodyProps = { state: Exclude<EditorState, null>; goals: GoalLabel[]; outlookConnected: boolean; onClose: () => void };

const DAY = 24 * 60;

/** Minutes from midnight of the start's day: "2026-11-17T09:30" gives 570. */
function minuteOf(local: string): number {
  return Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16));
}

/** The end in minutes from midnight of the start's day; past midnight it is more than 24 hours. */
function endMinuteOf(start: string, end: string): number {
  const length = Math.round((Date.parse(`${end}:00Z`) - Date.parse(`${start}:00Z`)) / 60_000);
  return Number.isFinite(length) ? minuteOf(start) + length : minuteOf(start) + 60;
}

/** "YYYY-MM-DDTHH:MM" for minute `min` from midnight of `date`; minutes past 24 hours go to the next day. */
function localAt(date: string, min: number): string {
  return `${addDays(date, Math.floor(min / DAY))}T${formatMinute(((min % DAY) + DAY) % DAY)}`;
}

/** Every quarter of an hour of the day, plus `value` if it is between them. */
function startOptions(value: number): number[] {
  const options = Array.from({ length: DAY / 15 }, (_, i) => i * 15);
  return options.includes(value) ? options : [...options, value].sort((a, b) => a - b);
}

/** Every quarter of an hour up to 24 hours after the start, plus `value` if it is between them. */
function endOptions(start: number, value: number): number[] {
  const options = Array.from({ length: DAY / 15 }, (_, i) => start + (i + 1) * 15);
  return options.includes(value) ? options : [...options, value].sort((a, b) => a - b);
}

const switchClass =
  "relative h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full bg-line transition-colors checked:bg-ink before:absolute before:top-0.5 before:left-0.5 before:size-4 before:rounded-full before:bg-white before:shadow-sm before:transition-transform checked:before:translate-x-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-1";

const chipClass = "inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium";

/** The week change an accepted save describes: the event as saved. A series (with a count) waits for the re-read. */
function savedEventChange(answer: PostResult): Changes | null {
  const data = answer.data as { event?: EventDto; count?: unknown } | undefined;
  if (!data?.event || data.count !== undefined) return null;
  const saved = data.event;
  return { week: (week) => withEventChange(week, { event: saved }) };
}

function EditorBody({ state, goals, outlookConnected, onClose }: BodyProps) {
  const router = useRouter();
  const live = useLive();
  const { timeFormat } = useDisplay();
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
  // Date, start and end are followed: the end list counts from the start, and the weekly repeat shows
  // the first date's weekday (always included, R28).
  const [date, setDate] = useState(initial.start.slice(0, 10));
  const [startMin, setStartMin] = useState(minuteOf(initial.start));
  const [endMin, setEndMin] = useState(endMinuteOf(initial.start, initial.end));
  const [goalId, setGoalId] = useState(initial.goalId);
  const [frequency, setFrequency] = useState<Frequency>(state.mode === "create" ? (state.repeat ?? "none") : "none");
  const [weekdays, setWeekdays] = useState<Weekday[]>([]);

  useEffect(() => {
    if (confirmingDelete || question) confirmButton.current?.focus();
  }, [confirmingDelete, question]);

  const prefix = event ? event.id : "new";
  const inSeries = Boolean(event?.seriesId);
  // R11: an Outlook event keeps title, times and days from Outlook; here only its goal and done status.
  const fromOutlook = event?.source === "outlook";
  const firstWeekday = /^\d{4}-\d{2}-\d{2}$/.test(date) ? weekdayOf(date) : null;
  const tileLook = allDay ? null : (goals.find((goal) => goal.id === goalId)?.look ?? null);

  /**
   * Sends one action; on success shows the change in the week at once (`fromAnswer`), announces the
   * message, closes the editor and lets the week re-read in the background.
   */
  async function run(path: string, body: unknown, { close = true, fromAnswer = savedEventChange }: { close?: boolean; fromAnswer?: (answer: PostResult) => Changes | null } = {}) {
    setBusy(true);
    const answer = await live.run({ send: () => postJson(path, body), fromAnswer });
    setBusy(false);
    setQuestion(null);
    setResult(answer.ok ? null : answer);
    if (!answer.ok) return null;
    if (answer.message) announce(answer.message);
    // The change goes to Outlook now, not at the next sync; the week re-reads once it is there.
    if (outlookConnected && !fromOutlook) void postJson("/api/outlook/send", {}).then(() => live.refresh());
    if (close) onClose();
    return answer;
  }

  async function save(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const form = new FormData(formEvent.currentTarget);
    if (event && fromOutlook) {
      return run(`/api/events/${event.id}/edit`, { goalId: String(form.get("goal") ?? "") || null, updatedAt: event.updatedAt });
    }
    const title = String(form.get("title") ?? "");
    const values: Record<string, unknown> = allDay
      ? { title, allDay: true, firstDay: String(form.get("firstDay") ?? ""), lastDay: String(form.get("lastDay") ?? "") }
      : {
          title,
          start: localAt(date, startMin),
          end: localAt(date, endMin),
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
    const id = event.id;
    return run(`/api/events/${id}/delete`, { updatedAt: event.updatedAt, scope }, {
      // Only "this event" is known here; the later ones of the series go with the re-read.
      fromAnswer: () => (scope === "this" ? { week: (week) => withEventChange(week, { removed: id }) } : null),
    });
  }

  async function toggleDone() {
    if (!event) return;
    setBusy(true);
    const status = event.status === "done" ? "planned" : "done";
    const id = event.id;
    const answer = await live.run({
      send: () => postJson(`/api/events/${id}/${status}`, {}),
      // The week shows it at once; a rejection puts it back.
      optimistic: { week: (week) => withEventStatus(week, id, status) },
      fromAnswer: savedEventChange,
    });
    setBusy(false);
    setResult(answer.ok ? null : answer);
    if (!answer.ok) return;
    // Keep the editor open (as in the prototype) and show the new state.
    const saved = (answer.data as { event?: EventDto } | undefined)?.event;
    if (saved) setEvent({ ...event, status: saved.status, updatedAt: saved.updatedAt });
  }

  /** A new start keeps the event's length. */
  function moveStart(next: number) {
    setEndMin(next + (endMin - startMin));
    setStartMin(next);
  }

  const stale = result?.status === 409 && result.message.startsWith("Changed on another device");
  const conflict = event && !event.allDay && event.conflict;

  return (
    <form onSubmit={save} noValidate className="flex h-full max-h-[inherit] flex-col">
      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pt-5 pb-6">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-3">
            <h2 id="editor-title" className="sr-only">
              {event ? `Edit ${event.title}` : "New event"}
            </h2>
            <GoalTile look={tileLook} size="lg" />
            <div className="min-w-0 flex-1">
              {fromOutlook ? (
                <p className="truncate py-0.5 text-[15px] font-semibold leading-6 text-ink">{initial.title}</p>
              ) : (
                <>
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
                </>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
            >
              <X className="size-4" />
            </button>
          </div>

          {event && (event.status === "done" || conflict || inSeries || fromOutlook || event.notSent) && (
            <div className="flex flex-wrap gap-1.5">
              {event.status === "done" && (
                <span className={`${chipClass} bg-success-soft text-success`}>
                  <Check className="size-3" strokeWidth={2.5} /> Done
                </span>
              )}
              {inSeries && <span className={`${chipClass} bg-raised text-ink-2`}>Repeating</span>}
              {fromOutlook && (
                <span className={`${chipClass} bg-raised text-ink-2`}>
                  <CalendarDays className="size-3" /> From Outlook
                </span>
              )}
              {event.notSent && (
                <span className={`${chipClass} bg-danger-soft text-danger`}>
                  <NotSentIcon className="size-3" /> Not sent to Outlook
                </span>
              )}
              {conflict && (
                <span className={`${chipClass} bg-danger-soft text-danger`}>
                  <TriangleAlert className="size-3" /> Overlaps another event
                </span>
              )}
            </div>
          )}
        </div>

        {event && fromOutlook ? (
          <>
            <section className="flex flex-col gap-2">
              <Eyebrow>When</Eyebrow>
              <p className={`${boxClass} text-ink`}>
                <CalendarDays className="size-4 shrink-0 text-ink-3" />
                {whenText(event, timeFormat)}
              </p>
              <p className="text-xs text-ink-2">{MESSAGES.changeInOutlook}</p>
            </section>
            {event.location && (
              <section className="flex flex-col gap-2">
                <Eyebrow>Location</Eyebrow>
                <p className={`${boxClass} text-ink`}>
                  <MapPin className="size-4 shrink-0 text-ink-3" />
                  {event.location}
                </p>
              </section>
            )}
          </>
        ) : (
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <Eyebrow>When</Eyebrow>
              {/* A series is timed (R29), so its events do not offer the switch. */}
              {!inSeries && (
                <label htmlFor={`${prefix}-all-day`} className="flex cursor-pointer items-center gap-2 text-xs font-medium text-ink-2">
                  All day
                  <input
                    id={`${prefix}-all-day`}
                    type="checkbox"
                    role="switch"
                    checked={allDay}
                    onChange={(e) => setAllDay(e.target.checked)}
                    className={switchClass}
                  />
                </label>
              )}
            </div>
            {allDay ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <label htmlFor={`${prefix}-first-day`} className="text-xs text-ink-2">First day</label>
                  <input id={`${prefix}-first-day`} name="firstDay" type="date" defaultValue={initial.firstDay} className={inputClass} />
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <label htmlFor={`${prefix}-last-day`} className="text-xs text-ink-2">Last day</label>
                  <input id={`${prefix}-last-day`} name="lastDay" type="date" defaultValue={initial.lastDay} className={inputClass} />
                </div>
              </div>
            ) : (
              <>
                <div className="relative">
                  <label htmlFor={`${prefix}-date`} className="sr-only">
                    Date
                  </label>
                  <CalendarDays className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
                  <input
                    id={`${prefix}-date`}
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={`${inputClass} pl-9`}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="min-w-0">
                    <label htmlFor={`${prefix}-start`} className="sr-only">
                      Start time
                    </label>
                    <select id={`${prefix}-start`} value={startMin} onChange={(e) => moveStart(Number(e.target.value))} className={`${inputClass} tabular`}>
                      {startOptions(startMin).map((min) => (
                        <option key={min} value={min}>
                          {fmtTime(min, timeFormat)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-0">
                    <label htmlFor={`${prefix}-end`} className="sr-only">
                      End time
                    </label>
                    <select id={`${prefix}-end`} value={endMin} onChange={(e) => setEndMin(Number(e.target.value))} className={`${inputClass} tabular`}>
                      {endOptions(startMin, endMin).map((min) => (
                        <option key={min} value={min}>
                          {`${fmtTime(min, timeFormat)} · ${fmtMinutes(min - startMin)}${min >= DAY ? " (next day)" : ""}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        {/* Repeat (R28): only when creating a timed event; a series is never extended later. */}
        {!event && !allDay && (
          <section className="flex flex-col gap-2">
            <Eyebrow htmlFor="new-repeat">Repeat</Eyebrow>
            <select id="new-repeat" value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} className={inputClass}>
              <option value="none">Does not repeat</option>
              <option value="daily">Every day</option>
              <option value="weekly">Every week</option>
              <option value="monthly">Every month</option>
            </select>
            {frequency === "weekly" && (
              <fieldset className="flex flex-wrap gap-1.5">
                <legend className="sr-only">On these days</legend>
                {WEEKDAYS.map(({ day, short, long }) => {
                  const fixed = day === firstWeekday;
                  const checked = fixed || weekdays.includes(day);
                  return (
                    <label
                      key={day}
                      title={fixed ? `${long}: the first date's day, always included` : long}
                      className={`flex h-8 min-w-11 cursor-pointer items-center justify-center rounded-full border px-2.5 text-xs font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink/30 ${
                        checked ? "border-ink bg-ink text-surface" : "border-line-subtle text-ink-2 hover:bg-raised"
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

        {/* All-day events have no goal (R29). The chips are radio inputs named "goal", like a list. */}
        {!allDay && (
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className={`${eyebrowClass} mb-2`}>Goal</legend>
            <div className="flex flex-wrap gap-1.5">
              {[{ id: "", title: "No goal", look: null as GoalLabel["look"] | null }, ...goals].map((goal) => (
                <label
                  key={goal.id || "none"}
                  className={`inline-flex h-8 max-w-full cursor-pointer items-center gap-1.5 rounded-full border pr-3 pl-1.5 text-[13px] transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink/30 ${
                    goalId === goal.id ? "border-ink font-medium text-ink" : "border-line-subtle text-ink-2 hover:bg-raised"
                  }`}
                >
                  <input
                    type="radio"
                    name="goal"
                    value={goal.id}
                    checked={goalId === goal.id}
                    onChange={() => setGoalId(goal.id)}
                    className="sr-only"
                  />
                  <GoalTile look={goal.look} size="xs" />
                  <span className="min-w-0 truncate">{goal.title}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {!allDay && !fromOutlook && (
          <section className="flex flex-col gap-2">
            <Eyebrow>Overlap</Eyebrow>
            <label htmlFor={`${prefix}-may-overlap`} className="flex cursor-pointer items-center gap-2.5 text-sm text-ink">
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

      <div className="flex flex-wrap items-center gap-2 border-t border-line-subtle bg-surface px-5 py-3.5">
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
              onClick={() => {
                const id = event.id;
                void run(`/api/events/${id}/delete`, { updatedAt: event.updatedAt }, { fromAnswer: () => ({ week: (week) => withEventChange(week, { removed: id }) }) });
              }}
            >
              Yes, delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            {!(fromOutlook && event?.allDay) && (
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? "Saving…" : event ? "Save" : "Add event"}
              </Button>
            )}
            {/* All-day events cannot be done and do not suggest a focus session (R29). */}
            {event && !event.allDay && (
              <LinkButton href={`/focus?event=${event.id}`} variant="secondary" size="sm">
                <Play className="size-3.5" />
                Start focus
              </LinkButton>
            )}
            {event && !event.allDay && (
              <Button variant="secondary" size="sm" disabled={busy} onClick={toggleDone}>
                {event.status === "done" ? "Reopen" : "Mark done"}
              </Button>
            )}
            {event && !fromOutlook && (
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto size-8 text-ink-3"
                aria-label={`Delete ${event.title}`}
                title="Delete"
                onClick={() => (inSeries ? setQuestion({ kind: "delete" }) : setConfirmingDelete(true))}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </>
        )}
      </div>
    </form>
  );
}
