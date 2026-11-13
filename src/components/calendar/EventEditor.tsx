"use client";

// The event editor, in the prototype's frame and behaviour (spec 16; its components/calendar/
// EventEditor.tsx): a 360 px card floating next to the block on wider screens, a sheet from the bottom
// on phones (FloatingPanel: Esc and a click outside close it, the focus goes back).
//
// An existing event is saved with the Save button (spec 17, R39): it appears in the footer as soon as
// a field differs from the saved event, next to "Discard", and sends edit_event with the updated_at
// the screen last saw (R4). The calendar shows the change when Save is clicked; a refusal shows the
// ontology's message and keeps the fields (editor/useEventSave.ts). Closing the editor drops changes
// that were not saved. An event of a series asks "This event" or "This and following events" first, in
// the footer (R28). An Outlook event changes only its goal and done status (R11).
//
// A new event is made by the small "New event" card; its "Add details" opens this editor with what was
// filled in, for repeating, all-day, location or overlap. "Add event" creates it (create_event) and the
// editor then edits the saved event.
//
// The sections, in the prototype's order: header (goal tile, title, close), chips, WHEN, TO-DOS (spec
// 21), GOAL, LOCATION, GUESTS (spec 24), then ours: OVERLAP. Each is its own component in ./editor, so a later section
// (notes, the rating, the travel line) is one more entry in the list.
// To-dos are saved at once, each change on its own (not with the Save button); a new event keeps its
// list until "Add event" sends it with the event. Outlook events have none (R11).
// Guests (spec 24) wait for Save like the location; Outlook sends the invitations. An Outlook event shows
// its people read-only; events of a series and demo events show the section with the reason why not. The bin asks once,
// in place, before it deletes an event with guests (Outlook tells them).
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { guestCountText } from "@/lib/events/guests";
import { Play, Trash2 } from "lucide-react";
import { FormMessage } from "@/components/account/FormMessage";
import { useLive } from "@/components/live/Live";
import { Button, LinkButton } from "@/components/ui/Button";
import { postJson, type PostResult } from "@/lib/client/post-json";
import { weekdayOf, type Weekday } from "@/lib/events/repeat";
import type { CalendarEvent } from "@/lib/events/types";
import { MESSAGES } from "@/lib/messages";
import { cleanTitle, hasRoom, moveTo, type TodoItem } from "@/lib/todos/list";
import type { NewTodo } from "@/lib/todos/types";
import { addDays } from "@/lib/time/zoned";
import { useAnnounce } from "./Announcer";
import { EditorChips } from "./editor/EditorChips";
import { EditorHeader } from "./editor/EditorHeader";
import { EventTodos } from "./editor/EventTodos";
import { GoalSection } from "./editor/GoalSection";
import { GuestsSection } from "./editor/GuestsSection";
import { LocationSection } from "./editor/LocationSection";
import { OverlapSection } from "./editor/OverlapSection";
import { TodoList } from "./editor/TodoList";
import { useEventSave } from "./editor/useEventSave";
import { createBody, eventFromAnswer, newValues, type EventValues } from "./editor/values";
import { RepeatFields, WhenSection, type Frequency } from "./editor/WhenSection";
import { savedEventChange } from "./event-changes";
import { FloatingPanel, type Anchor } from "./FloatingPanel";
import type { GoalLabel } from "./TimeGrid";

export type { Frequency } from "./editor/WhenSection";

/** What the editor shows, and where it floats: a new event with what the small card filled in, or an existing event. */
export type EditorState =
  | { mode: "create"; start: string; end: string; repeat?: Frequency; title?: string; goalId?: string | null; anchor: Anchor }
  | { mode: "edit"; event: CalendarEvent; anchor: Anchor }
  | null;

type Common = {
  /** The user's goals, for the goal chips ("No goal" is always there). */
  goals: GoalLabel[];
  timeZone: string;
  /** Today in the user's time zone (the month calendar marks it). */
  today: string;
  /** Connected to Outlook: after a change the editor asks the server to send it right away (R26). */
  outlookConnected?: boolean;
  onClose: () => void;
};

type Props = Common & {
  state: EditorState;
  /** The event as the calendar shows it now (with the latest re-read), or null. */
  shown?: CalendarEvent | null;
  /** One event was deleted (not "this and following"): the calendar offers Undo, with its to-dos. */
  onDeleted?: (event: CalendarEvent, todos: NewTodo[]) => void;
  /** A change was refused after the editor closed: the calendar shows the message. */
  onRefused?: (message: string) => void;
  /** A new event was added: the editor goes on with it. */
  onCreated?: (event: CalendarEvent) => void;
};

/** The card width on wider screens, as in the prototype. */
const WIDTH = 360;

export function EventEditor({ state, shown, onDeleted, onRefused, onCreated, ...common }: Props) {
  if (!state) return null;
  if (state.mode === "edit") {
    return <EditEventCard key={state.event.id} event={state.event} anchor={state.anchor} shown={shown} onDeleted={onDeleted} onRefused={onRefused} {...common} />;
  }
  return <NewEventCard key={`${state.start}-${state.end}`} draft={state} anchor={state.anchor} onCreated={onCreated} {...common} />;
}

/** The card's frame, as in the prototype: the sections, then the footer that sticks to the bottom. */
function Card({ sections, footer }: { sections: ReactNode; footer: ReactNode }) {
  return (
    <>
      <div className="flex flex-col gap-4 p-4">{sections}</div>
      {footer && <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-line-subtle bg-surface px-4 py-3">{footer}</div>}
    </>
  );
}

/** In its floating panel, or bare (`anchor` null: the previews and markup tests draw it themselves). */
function Frame({ anchor, label, onClose, children }: { anchor: Anchor | null; label: string; onClose: () => void; children: ReactNode }) {
  if (!anchor) {
    return (
      <div role="dialog" aria-label={label}>
        {children}
      </div>
    );
  }
  return (
    <FloatingPanel anchor={anchor} label={label} width={WIDTH} onClose={onClose}>
      {children}
    </FloatingPanel>
  );
}

/** The server's refusal, with "Reload" when another device saved first (R4). */
function Refusal({ result, onReload }: { result: PostResult | null; onReload: () => void }) {
  if (!result) return null;
  const stale = result.status === 409 && result.message.startsWith("Changed on another device");
  return (
    <div className="flex flex-col gap-2">
      <FormMessage tone="error" text={result.message} />
      {stale && (
        <Button variant="secondary" size="sm" className="w-fit" onClick={onReload}>
          Reload
        </Button>
      )}
    </div>
  );
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

type EditProps = Common & {
  event: CalendarEvent;
  /** Null: drawn without the floating panel (previews, markup tests). */
  anchor: Anchor | null;
  shown?: CalendarEvent | null;
  onDeleted?: (event: CalendarEvent, todos: NewTodo[]) => void;
  onRefused?: (message: string) => void;
};

/** An existing event: changes wait for the Save button. */
export function EditEventCard({ event: initial, anchor, shown, goals, timeZone, today, outlookConnected = false, onClose, onDeleted, onRefused }: EditProps) {
  const router = useRouter();
  const save = useEventSave({ initial, shown, timeZone, outlookConnected, onDeleted, onRefused, onClose });
  const { event, values } = save;
  const fromOutlook = event.source === "outlook";
  // Whole days only (the editor knows today's date, not the time): an event that ended earlier today
  // still shows the field, and the server refuses with the same sentence.
  const endedBeforeToday = (event.allDay ? event.lastDay : event.endLocal.slice(0, 10)) < today;
  const look = values.allDay ? null : (goals.find((g) => g.id === values.goalId)?.look ?? null);
  // The question before deleting an event with guests (spec 24), in the footer like the series question.
  const [askDelete, setAskDelete] = useState(false);
  const confirmButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (askDelete) confirmButton.current?.focus();
  }, [askDelete]);

  const sections = [
    <EditorHeader
      key="header"
      look={look}
      title={fromOutlook ? event.title : values.title}
      editable={!fromOutlook}
      onType={(title) => save.change({ title })}
      onDone={(title) => title !== undefined && save.change({ title })}
      onClose={save.close}
    />,
    <EditorChips key="chips" event={event} />,
    <WhenSection key="when" event={event} values={values} onChange={(patch) => save.change(patch)} todayKey={today} />,
    // Spec 24: right under the time. An Outlook event shows its people read-only (R11); a demo event
    // and an event of a series cannot have guests and say so.
    fromOutlook ? (
      <GuestsSection key="guests" mode="outlook" guests={event.guests ?? []} organizer={event.organizer ?? null} />
    ) : event.demo ? (
      <GuestsSection key="guests" mode="unavailable" reason={`${MESSAGES.guestsNotDemo}. Create your own event to invite someone.`} />
    ) : event.seriesId ? (
      <GuestsSection key="guests" mode="unavailable" reason={`${MESSAGES.guestsNotInSeries}.`} />
    ) : endedBeforeToday ? (
      // Outlook gets no past events (R26), so nobody could be invited; the server refuses it too.
      <GuestsSection key="guests" mode="unavailable" guests={values.guests ?? []} reason={`This event has ended. ${MESSAGES.guestsNotEnded}.`} />
    ) : outlookConnected ? (
      <GuestsSection key="guests" mode="edit" guests={values.guests ?? []} onChange={(guests) => save.change({ guests })} />
    ) : (
      <GuestsSection key="guests" mode="connect" guests={values.guests ?? []} />
    ),
    // Right under the time, as in the prototype; saved at once. Outlook events have none (R11).
    !fromOutlook && <EventTodos key="todos" eventId={event.id} />,
    // All-day events have no goal (R29).
    !values.allDay && <GoalSection key="goal" goals={goals} value={values.goalId} onChange={(goalId) => save.change({ goalId })} />,
    <LocationSection
      key="location"
      value={fromOutlook ? (event.location ?? "") : values.location}
      editable={!fromOutlook}
      onType={(location) => save.change({ location })}
      onDone={() => {}}
    />,
    !values.allDay && !fromOutlook && <OverlapSection key="overlap" value={values.mayOverlap} onChange={(mayOverlap) => save.change({ mayOverlap })} />,
    <Refusal
      key="refusal"
      result={save.result}
      onReload={() => {
        router.refresh();
        onClose();
      }}
    />,
  ];

  // All-day events cannot be done and do not suggest a focus session (R29); Outlook events are deleted in Outlook (R11).
  const timed = !event.allDay;
  // Spec 24: deleting an event with guests tells them (Outlook sends a cancellation), so the bin asks once.
  const guestCount = fromOutlook ? 0 : (event.guests?.length ?? 0);
  const footer = save.ask ? (
    <SeriesQuestion kind={save.ask.kind} title={event.title} busy={save.busy} onAnswer={save.answer} onCancel={save.cancelAsk} />
  ) : askDelete && guestCount > 0 ? (
    <>
      <p className="w-full text-sm font-medium">{guestCount === 1 ? "Delete and tell the guest?" : `Delete and tell the ${guestCount} guests?`}</p>
      <Button ref={confirmButton} variant="danger" size="sm" disabled={save.busy} onClick={save.remove}>
        Delete
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setAskDelete(false)}>
        Cancel
      </Button>
    </>
  ) : save.changed ? (
    // Unsaved changes: Save or Discard first. Start focus and Mark done come back once they are saved.
    <>
      <Button size="sm" disabled={save.saving || values.title.trim() === ""} onClick={save.saveNow}>
        {save.saving ? "Saving…" : "Save"}
      </Button>
      <Button size="sm" variant="ghost" disabled={save.saving} onClick={save.discard}>
        Discard
      </Button>
    </>
  ) : timed || !fromOutlook ? (
    <>
      {timed && (
        <LinkButton href={`/focus?event=${event.id}`} size="sm">
          <Play className="size-3.5" strokeWidth={2} />
          Start focus
        </LinkButton>
      )}
      {timed && (
        <Button size="sm" variant="secondary" onClick={save.toggleDone}>
          {event.status === "done" ? "Reopen" : "Mark done"}
        </Button>
      )}
      {!fromOutlook && (
        <Button
          size="icon"
          variant="ghost"
          className="ml-auto"
          aria-label={guestCount > 0 ? `Delete event and tell ${guestCountText(guestCount)}` : "Delete event"}
          title="Delete"
          disabled={save.busy}
          onClick={guestCount > 0 ? () => setAskDelete(true) : save.remove}
        >
          <Trash2 className="size-4" strokeWidth={1.8} />
        </Button>
      )}
    </>
  ) : null;

  return (
    <Frame anchor={anchor} label={`Event: ${event.title}`} onClose={save.close}>
      <Card sections={sections} footer={footer} />
    </Frame>
  );
}

type NewProps = Common & {
  draft: { start: string; end: string; repeat?: Frequency; title?: string; goalId?: string | null };
  anchor: Anchor | null;
  onCreated?: (event: CalendarEvent) => void;
};

/** A new event from "Add details": filled in here, then "Add event" creates it (create_event). */
export function NewEventCard({ draft, anchor, goals, timeZone, today, outlookConnected = false, onClose, onCreated }: NewProps) {
  const live = useLive();
  const announce = useAnnounce();
  const [values, setValues] = useState(() => newValues(draft));
  const [frequency, setFrequency] = useState<Frequency>(draft.repeat ?? "none");
  const [weekdays, setWeekdays] = useState<Weekday[]>([]);
  const [until, setUntil] = useState(() => addDays(draft.start.slice(0, 10), 28));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PostResult | null>(null);
  // The new event's to-dos, kept here until "Add event" sends them with it (spec 21).
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [todoError, setTodoError] = useState("");
  const nextKey = useRef(1);
  const change = (patch: Partial<EventValues>) => setValues((v) => ({ ...v, ...patch }));
  const editTodos = (next: (list: TodoItem[]) => TodoItem[]) => {
    setTodos(next);
    setTodoError("");
  };
  const look = values.allDay ? null : (goals.find((g) => g.id === values.goalId)?.look ?? null);

  async function add() {
    const first = weekdayOf(values.date);
    const repeat =
      frequency === "none"
        ? null
        : { frequency, weekdays: frequency === "weekly" ? [...new Set([...weekdays, first])].sort((a, b) => a - b) : [], until };
    setBusy(true);
    const answer = await live.run({ send: () => postJson("/api/events", createBody(values, repeat, todos)), fromAnswer: savedEventChange });
    setBusy(false);
    if (!answer.ok) return setResult(answer);
    if (answer.message) announce(answer.message);
    if (outlookConnected) void postJson("/api/outlook/send", {}).then(() => live.refresh());
    // A single event stays open in the editor, now saving each change; a series waits for the re-read.
    const series = (answer.data as { count?: unknown } | undefined)?.count !== undefined;
    const created = series ? null : eventFromAnswer(answer, timeZone);
    if (created && onCreated) onCreated(created);
    else onClose();
  }

  const sections = [
    <EditorHeader key="header" look={look} title={values.title} editable onType={(title) => change({ title })} onDone={(title) => title !== undefined && change({ title })} onClose={onClose} />,
    <WhenSection key="when" event={null} values={values} onChange={change} todayKey={today}>
      {/* Repeat (R28): only when creating a timed event; a series is never extended later. */}
      {!values.allDay && (
        <RepeatFields
          date={values.date}
          frequency={frequency}
          weekdays={weekdays}
          until={until}
          todayKey={today}
          onFrequency={setFrequency}
          onWeekdays={setWeekdays}
          onUntil={setUntil}
        />
      )}
    </WhenSection>,
    // Spec 24: right under the time. A new series takes no guests (one invitation per date would flood them).
    !values.allDay && frequency !== "none" ? (
      <GuestsSection key="guests" mode="unavailable" reason={`${MESSAGES.guestsNotInSeries}.`} />
    ) : outlookConnected ? (
      <GuestsSection key="guests" mode="edit" guests={values.guests ?? []} onChange={(guests) => change({ guests })} />
    ) : (
      <GuestsSection key="guests" mode="connect" guests={[]} />
    ),
    <TodoList
      key="todos"
      todos={todos}
      error={todoError}
      onAdd={(raw) => {
        const title = cleanTitle(raw);
        if (!title) return setTodoError(MESSAGES.todoTitleLength);
        if (!hasRoom(todos)) return setTodoError(MESSAGES.tooManyTodos);
        editTodos((list) => [...list, { key: `new-${nextKey.current++}`, title, done: false }]);
      }}
      onRename={(key, raw) => {
        const title = cleanTitle(raw);
        if (!title) return setTodoError(MESSAGES.todoTitleLength);
        editTodos((list) => list.map((t) => (t.key === key ? { ...t, title } : t)));
      }}
      onToggle={(key) => editTodos((list) => list.map((t) => (t.key === key ? { ...t, done: !t.done } : t)))}
      onMove={(key, toIndex) => editTodos((list) => moveTo(list, key, toIndex))}
      onDelete={(key) => editTodos((list) => list.filter((t) => t.key !== key))}
    />,
    !values.allDay && <GoalSection key="goal" goals={goals} value={values.goalId} onChange={(goalId) => change({ goalId })} />,
    <LocationSection key="location" value={values.location} editable onType={(location) => change({ location })} onDone={() => {}} />,
    !values.allDay && <OverlapSection key="overlap" value={values.mayOverlap} onChange={(mayOverlap) => change({ mayOverlap })} />,
    <Refusal key="refusal" result={result} onReload={onClose} />,
  ];

  const footer = (
    <Button size="sm" disabled={busy || values.title.trim() === ""} onClick={() => void add()}>
      {busy ? "Adding…" : "Add event"}
    </Button>
  );

  return (
    <Frame anchor={anchor} label="New event" onClose={onClose}>
      <Card sections={sections} footer={footer} />
    </Frame>
  );
}
