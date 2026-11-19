"use client";

// The card of an ACCEPTED invitation (spec 55; ontology R65 to R67), opened at the event's block like the
// small card of spec 54, but laid out like the own event editor: the goal's tile and the title, the date
// and time, who invited and the answer buttons, then TO-DOS, GOAL, ROUTE, NOTES and the other invited
// people. A maybe, a decline or no answer yet keep the small card (src/components/calendar/Invites.tsx).
// - Title, time, date and place are the owner's and read only (R63).
// - To-dos and notes are SHARED with the owner and everyone who accepted (R66). Each to-do change is
//   saved at once (as in the own editor); the notes wait for "Save notes" and are refused when someone
//   changed them meanwhile ("Reload" shows theirs).
// - The goal, the way of getting there and where the trip starts are the user's OWN (R67), saved at once
//   on their invitation; the travel line asks /api/invites/<id>/travel. "Mark done" marks it done for the
//   user only; then it counts for their goal.
// Everything is read again when the window comes back (at most every 10 seconds), so changes the owner
// or the others made show without Reload.
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarClock, Mail, Users } from "lucide-react";
import { PersonChip } from "@/components/people/PersonChip";
import { useRefreshOnReturn } from "@/components/live/useRefreshOnReturn";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/account/FormMessage";
import { useDisplay } from "@/components/shell/DisplayProvider";
import { getJson, postJson, type PostResult } from "@/lib/client/post-json";
import { cleanNotes, notesTooLong } from "@/lib/events/notes";
import { acceptedReadOnlyText, answerWords, type AcceptedInviteDetails, type GivenAnswer, type InvitedEvent, type InvitePerson, type InviteTravelMode } from "@/lib/invites/types";
import { MESSAGES } from "@/lib/messages";
import { cleanTitle, hasRoom, moveTo, type TodoItem } from "@/lib/todos/list";
import { useAnnounce } from "./Announcer";
import { EditorHeader } from "./editor/EditorHeader";
import { GoalSection } from "./editor/GoalSection";
import { NotesSection } from "./editor/NotesSection";
import { RouteSection } from "./editor/RouteSection";
import { TodoList } from "./editor/TodoList";
import { TravelLine } from "./editor/TravelLine";
import { FloatingPanel, type Anchor } from "./FloatingPanel";
import { AnswerButtons, InviteesList, invitedWhen, useInvitePeople } from "./Invites";
import type { GoalLabel } from "./TimeGrid";

type Props = {
  /** The invitation as the calendar has it (shown while the full card is being read). */
  event: InvitedEvent;
  busy: boolean;
  /** The quiet line after answering ("You accepted."). */
  note: string | null;
  timeZone: string;
  /** The user's own goals, for the goal chips. */
  goals: GoalLabel[];
  onAnswer: (answer: GivenAnswer) => void;
  /** After a change of the user's own goal or done mark: the calendar re-reads (goal progress). */
  onChanged?: () => void;
  onClose: () => void;
};

/** The floating card at the block (spec 38's frame), a little wider than the editor for the people's names. */
export function AcceptedInviteCard({ anchor, ...props }: Props & { anchor: Anchor }) {
  return (
    <FloatingPanel anchor={anchor} label={`${props.event.title}, invited by ${props.event.inviter.name}`} width={340} onClose={props.onClose}>
      <AcceptedInviteBody {...props} />
    </FloatingPanel>
  );
}

const detailsOf = (answer: PostResult): AcceptedInviteDetails | null => (answer.data as { details?: AcceptedInviteDetails } | undefined)?.details ?? null;

/** Reads the card, sends each change, and keeps what the server answered. */
function AcceptedInviteBody(props: Props) {
  const inviteId = props.event.inviteId;
  const announce = useAnnounce();
  const people = useInvitePeople(inviteId);
  const [details, setDetails] = useState<AcceptedInviteDetails | null>(null);
  const detailsRef = useRef<AcceptedInviteDetails | null>(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [notesError, setNotesError] = useState<{ text: string; stale: boolean } | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  // When the card was last read: "Mark done" shows once the event has started (the server decides too).
  const [readAt, setReadAt] = useState(() => Date.now());
  const pending = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const show = useCallback((next: AcceptedInviteDetails) => {
    detailsRef.current = next;
    setDetails(next);
  }, []);

  const load = useCallback(() => {
    // A change on its way answers with the newer card anyway.
    if (pending.current > 0) return;
    void getJson(`/api/invites/${encodeURIComponent(inviteId)}/details`).then((answer) => {
      const next = detailsOf(answer);
      if (next && pending.current === 0) {
        show(next);
        setReadAt(Date.now());
        setLoadError("");
      } else if (!answer.ok) setLoadError(answer.message);
    });
  }, [inviteId, show]);

  useEffect(load, [load]);
  useRefreshOnReturn(load);

  /** One change: shown at once (`optimistic`), sent after the ones before it, then the server's card. */
  const write = useCallback(
    (path: string, body: unknown, optimistic: ((d: AcceptedInviteDetails) => AcceptedInviteDetails) | null, after?: () => void) => {
      const step = async () => {
        const before = detailsRef.current;
        if (before && optimistic) show(optimistic(before));
        pending.current += 1;
        const answer = await postJson(`/api/invites/${encodeURIComponent(inviteId)}/${path}`, body);
        pending.current -= 1;
        const next = detailsOf(answer);
        if (!answer.ok || !next) {
          if (before) show(before);
          setError(answer.message);
          return;
        }
        show(next);
        setError("");
        if (answer.message) announce(answer.message);
        after?.();
      };
      queue.current = queue.current.then(step, step);
    },
    [inviteId, show, announce],
  );

  const personal = (patch: Partial<Pick<AcceptedInviteDetails, "goalId" | "travelMode" | "travelFrom">>) => {
    const d = detailsRef.current;
    if (!d) return;
    const next = { goalId: d.goalId, travelMode: d.travelMode, travelFrom: d.travelFrom, ...patch };
    write("personal", next, (old) => ({ ...old, ...next }), props.onChanged);
  };

  async function saveNotes() {
    const d = detailsRef.current;
    if (!d || notesDraft === null || notesTooLong(notesDraft)) return;
    setSavingNotes(true);
    pending.current += 1;
    const answer = await postJson(`/api/invites/${encodeURIComponent(inviteId)}/notes`, { notes: notesDraft, before: d.notes });
    pending.current -= 1;
    setSavingNotes(false);
    const next = detailsOf(answer);
    if (!answer.ok || !next) {
      setNotesError({ text: answer.message, stale: answer.status === 409 });
      return;
    }
    show(next);
    setNotesDraft(null);
    setNotesError(null);
    if (answer.message) announce(answer.message);
  }

  const find = (key: string) => detailsRef.current?.todos.find((t) => t.id === key);

  return (
    <AcceptedInviteView
      {...props}
      details={details}
      now={readAt}
      people={people}
      loadError={loadError}
      error={error}
      notes={{
        value: notesDraft ?? details?.notes ?? "",
        changed: details !== null && notesDraft !== null && cleanNotes(notesDraft) !== details.notes,
        saving: savingNotes,
        error: notesError,
        onChange: (text) => {
          setNotesDraft(text);
          setNotesError(null);
        },
        onSave: () => void saveNotes(),
        onDiscard: () => {
          setNotesDraft(null);
          setNotesError(null);
        },
        onReload: () => {
          setNotesDraft(null);
          setNotesError(null);
          load();
        },
      }}
      todos={{
        onAdd: (raw) => {
          const title = cleanTitle(raw);
          if (!title) return setError(MESSAGES.todoTitleLength);
          if (!hasRoom(detailsRef.current?.todos ?? [])) return setError(MESSAGES.tooManyTodos);
          write("todos", { title }, null);
        },
        onRename: (key, raw) => {
          const title = cleanTitle(raw);
          if (!title) return setError(MESSAGES.todoTitleLength);
          write(`todos/${key}/rename`, { title }, (d) => ({ ...d, todos: d.todos.map((t) => (t.id === key ? { ...t, title } : t)) }));
        },
        onToggle: (key) => {
          const todo = find(key);
          if (!todo) return;
          const done = !todo.done;
          write(`todos/${key}/done`, { done }, (d) => ({ ...d, todos: d.todos.map((t) => (t.id === key ? { ...t, done } : t)) }));
        },
        onMove: (key, toIndex) =>
          write(`todos/${key}/move`, { toIndex }, (d) => {
            const moved = moveTo(
              d.todos.map((t) => ({ key: t.id, title: t.title, done: t.done })),
              key,
              toIndex,
            );
            return { ...d, todos: moved.map((t) => ({ id: t.key, title: t.title, done: t.done })) };
          }),
        onDelete: (key) => write(`todos/${key}/delete`, {}, (d) => ({ ...d, todos: d.todos.filter((t) => t.id !== key) })),
      }}
      onGoal={(goalId) => personal({ goalId })}
      onFrom={(travelFrom) => personal({ travelFrom })}
      onMode={(travelMode) => personal({ travelMode })}
      onDone={(done) => write("done", { done }, (d) => ({ ...d, done }), props.onChanged)}
    />
  );
}

type NotesState = {
  value: string;
  changed: boolean;
  saving: boolean;
  error: { text: string; stale: boolean } | null;
  onChange: (text: string) => void;
  onSave: () => void;
  onDiscard: () => void;
  onReload: () => void;
};

type TodoHandlers = {
  onAdd: (title: string) => void;
  onRename: (key: string, title: string) => void;
  onToggle: (key: string) => void;
  onMove: (key: string, toIndex: number) => void;
  onDelete: (key: string) => void;
};

type ViewProps = Props & {
  /** Null while it is being read. */
  details: AcceptedInviteDetails | null;
  /** The other invited people; null while they are being read. */
  people: InvitePerson[] | null;
  loadError?: string;
  /** The last refused change (to-dos, goal, route, done). */
  error?: string;
  notes: NotesState;
  todos: TodoHandlers;
  onGoal: (goalId: string | null) => void;
  onFrom: (from: string | null) => void;
  onMode: (mode: InviteTravelMode | null) => void;
  onDone: (done: boolean) => void;
  /** The time the card was last read, for "Mark done" (the tests pass a fixed one). */
  now: number;
};

/** What the card shows (also drawn on its own in the tests). */
export function AcceptedInviteView({ event, details, people, busy, note, timeZone, goals, onAnswer, onClose, loadError, error, notes, todos, onGoal, onFrom, onMode, onDone, now }: ViewProps) {
  const { timeFormat } = useDisplay();
  const shown = details ?? event;
  const timed = !shown.allDay;
  const look = details && timed ? (goals.find((g) => g.id === details.goalId)?.look ?? null) : null;
  const started = !shown.allDay && Date.parse(shown.startAt) <= now;
  const items: TodoItem[] = details ? details.todos.map((t) => ({ key: t.id, title: t.title, done: t.done })) : [];

  return (
    <>
      <div className="flex flex-col gap-3 p-3.5">
        <EditorHeader look={look} title={shown.title} editable={false} onType={() => {}} onDone={() => {}} onClose={onClose} />
        <p className="flex items-start gap-2 text-sm text-ink-2">
          <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" strokeWidth={1.8} />
          <span>{invitedWhen(shown, timeZone, timeFormat)}</span>
        </p>
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-ink-2">
          <Mail aria-hidden className="size-4 shrink-0 text-ink-3" strokeWidth={1.8} />
          <span>Invited by</span>
          {/* The inviter is always the user's contact (R59): a plain link to their page. */}
          <PersonChip person={event.inviter} size={24} className="text-sm font-medium" />
        </p>
        <section className="flex flex-col gap-2">
          <p className="text-sm font-medium text-ink">
            Your answer: <span className="font-normal text-ink-2">{answerWords("accepted")}</span>
          </p>
          <AnswerButtons answer="accepted" busy={busy} onAnswer={onAnswer} />
          {note && (
            <p role="status" className="text-xs text-ink-3">
              {note}
            </p>
          )}
        </section>

        {!details ? (
          loadError ? <FormMessage tone="error" text={loadError} /> : <p className="text-xs text-ink-3">Loading the event…</p>
        ) : (
          <>
            {/* Shared with the owner and everyone who accepted (R66); each change saved at once. */}
            <TodoList todos={items} error={error} {...todos} />
            {/* The user's own goal (R67); all-day events have none (R29). */}
            {timed && <GoalSection goals={goals} value={details.goalId} onChange={onGoal} />}
            {timed ? (
              <RouteSection
                from={details.travelFrom}
                onFrom={onFrom}
                mode={details.travelMode}
                onMode={onMode}
                location={details.location ?? ""}
                onLocation={() => {}}
                toReadOnly
              >
                {details.location && (
                  <TravelLine
                    eventId={details.inviteId}
                    savedAt={`${details.travelMode ?? ""}|${details.travelFrom ?? ""}`}
                    timeZone={timeZone}
                    path={`/api/invites/${encodeURIComponent(details.inviteId)}/travel`}
                  />
                )}
              </RouteSection>
            ) : (
              details.location && (
                <section className="flex flex-col gap-1.5">
                  <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">Location</p>
                  {/* Other people's places are text only. */}
                  <p className="text-sm break-words text-ink">{details.location}</p>
                </section>
              )
            )}
            {/* Shared with the owner and everyone who accepted (R66); saved with its own button. */}
            <div className="flex flex-col gap-2">
              <NotesSection value={notes.value} onChange={notes.onChange} />
              {notes.error && (
                <div className="flex flex-col gap-2">
                  <FormMessage tone="error" text={notes.error.text} />
                  {notes.error.stale && (
                    <Button variant="secondary" size="sm" className="w-fit" onClick={notes.onReload}>
                      Reload
                    </Button>
                  )}
                </div>
              )}
              {notes.changed && (
                <div className="flex gap-2">
                  <Button size="sm" disabled={notes.saving || notesTooLong(notes.value)} onClick={notes.onSave}>
                    {notes.saving ? "Saving…" : "Save notes"}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={notes.saving} onClick={notes.onDiscard}>
                    Discard
                  </Button>
                </div>
              )}
            </div>
          </>
        )}

        {people === null ? (
          <p className="text-xs text-ink-3">Loading who else is invited…</p>
        ) : people.length > 0 ? (
          <section className="flex flex-col gap-1.5">
            <h3 className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">
              <Users aria-hidden className="size-3.5" strokeWidth={1.8} />
              Also invited
            </h3>
            <InviteesList people={people} label="Also invited" />
          </section>
        ) : null}
        <p className="text-xs text-ink-3">{acceptedReadOnlyText(event.inviter.name)}</p>
      </div>
      {details && timed && started && (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-line-subtle bg-surface px-3.5 py-2.5">
          <Button size="sm" variant="secondary" onClick={() => onDone(!details.done)}>
            {details.done ? "Reopen" : "Mark done"}
          </Button>
          {details.done && <span className="text-xs text-ink-3">Done for you</span>}
        </div>
      )}
    </>
  );
}
