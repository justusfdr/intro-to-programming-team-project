"use client";

// Saving an existing event with the Save button (spec 17, R39). A change shows in the editor only;
// nothing is sent until "Save", which appears as soon as the fields differ from the saved event. Save
// sends edit_event with the updated_at the screen last saw (R4), and the calendar shows the change at
// once. If the server refuses, the ontology's message shows and the fields stay as typed, so the user
// can correct them (R1: nothing was saved). Closing the editor drops changes that were not saved.
// An event of a series first asks "This event" or "This and following events" (R28).
// Mark done and delete are still sent at once.
import { useCallback, useEffect, useRef, useState } from "react";
import { useLive } from "@/components/live/Live";
import { postJson, type PostResult } from "@/lib/client/post-json";
import { notesTooLong } from "@/lib/events/notes";
import { endProblem } from "@/lib/time/wheel";
import type { CalendarEvent, EventDto } from "@/lib/events/types";
import { withEventChange, withEventStatus } from "@/lib/events/week-view";
import { useAnnounce } from "../Announcer";
import { deletedTodos, savedEventChange, type Scope } from "../event-changes";
import type { NewTodo } from "@/lib/todos/types";
import { editBody, editedChange, eventFromAnswer, isChanged, newer, untouchedPatch, valuesOf, type EventValues } from "./values";

/** What the footer asks before a change or a delete of an event of a series. */
export type SeriesAsk = { kind: "save" } | { kind: "delete" } | null;

type Options = {
  initial: CalendarEvent;
  /** The same event as the calendar shows it now (it may be newer, for example after a re-read). */
  shown: CalendarEvent | null | undefined;
  timeZone: string;
  outlookConnected: boolean;
  /** One event was deleted: the calendar offers Undo, with the to-dos the answer named (spec 21). */
  onDeleted?: (event: CalendarEvent, todos: NewTodo[]) => void;
  /** A refusal that arrives after the editor has closed: the calendar shows the message instead. */
  onRefused?: (message: string) => void;
  onClose: () => void;
};

/**
 * Values the editor must not save: no title, notes too long, or (issue #127) a timed event that ends
 * less than 15 minutes after it starts. The red message under the times says why.
 */
export function cannotSave(values: Pick<EventValues, "title" | "notes" | "allDay" | "startMin" | "endMin">): boolean {
  if (values.title.trim() === "" || notesTooLong(values.notes)) return true;
  return !values.allDay && endProblem(values.startMin, values.endMin) !== null;
}

export function useEventSave({ initial, shown, timeZone, outlookConnected, onDeleted, onRefused, onClose }: Options) {
  const live = useLive();
  const announce = useAnnounce();
  // The event as last saved (from the answers), and the calendar's copy: the newer one is the base.
  const saved = useRef(initial);
  const shownRef = useRef(shown);
  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);
  const latest = useCallback(() => newer(saved.current, shownRef.current), []);

  const [event, setEvent] = useState(initial);
  const [values, setValues] = useState(() => valuesOf(initial));
  const valuesRef = useRef(values);
  const [result, setResult] = useState<PostResult | null>(null);
  const [ask, setAsk] = useState<SeriesAsk>(null);
  const [busy, setBusy] = useState(false);

  const [saving, setSaving] = useState(false);
  // The values as last sent and accepted: they count as saved even before the calendar's re-read.
  const [accepted, setAccepted] = useState<string | null>(null);

  const queue = useRef<Promise<unknown>>(Promise.resolve());

  // Whether the editor is still open: a save sent on closing may be answered after it.
  const open = useRef(true);
  useEffect(() => {
    open.current = true;
    return () => {
      open.current = false;
    };
  }, []);

  const fromOutlook = initial.source === "outlook";
  const inSeries = initial.seriesId !== null && !fromOutlook;

  const show = useCallback((patch: Partial<EventValues>) => {
    valuesRef.current = { ...valuesRef.current, ...patch };
    setValues(valuesRef.current);
  }, []);

  const afterSave = useCallback(
    (answer: PostResult, before: CalendarEvent, sent: EventValues) => {
      const next = eventFromAnswer(answer, timeZone, before);
      if (next) {
        saved.current = next;
        setEvent(next);
        // The saved event is what the fields show now (the server trims the title and the location),
        // except for fields the user changed while the save was on its way: those keep their typing.
        show(untouchedPatch(sent, valuesRef.current, valuesOf(next)));
      }
      // What counts as saved is what was sent (as the server kept it), so a later typing still shows Save.
      setAccepted(JSON.stringify(next ? valuesOf(next) : sent));
      setResult(null);
      if (answer.message) announce(answer.message);
      // The change goes to Outlook now, not at the next sync; the week re-reads once it is there (R26).
      if (outlookConnected && !fromOutlook) void postJson("/api/outlook/send", {}).then(() => live.refresh());
    },
    [timeZone, announce, outlookConnected, fromOutlook, live, show],
  );

  /** Queues one action after the ones before it, so each carries the updated_at of the last answer. */
  const enqueue = useCallback((step: () => Promise<unknown>) => {
    const next = queue.current.then(step, step);
    queue.current = next.catch(() => undefined);
    return next;
  }, []);

  const send = useCallback(
    (scope?: Scope) =>
      enqueue(async () => {
        const base = latest();
        const next = valuesRef.current;
        // Nothing to send when the fields are what the server has already.
        if (!isChanged(base, next)) return;
        setSaving(true);
        const answer = await live.run({
          send: () => postJson(`/api/events/${base.id}/edit`, editBody(base, next, base.updatedAt, scope)),
          optimistic: editedChange(base, next, timeZone, scope) ?? undefined,
          fromAnswer: savedEventChange,
        });
        setSaving(false);
        if (!answer.ok) {
          if (!open.current) onRefused?.(answer.message);
          setResult(answer);
          return;
        }
        afterSave(answer, base, next);
      }),
    [enqueue, latest, live, timeZone, afterSave, onRefused],
  );

  /** A change: shown in the editor, sent only with Save. */
  const change = useCallback(
    (patch: Partial<EventValues>) => {
      show(patch);
      setAccepted(null);
    },
    [show],
  );

  /** Discard: the fields go back to the saved event. */
  const discard = useCallback(() => {
    show(valuesOf(latest()));
    setResult(null);
  }, [show, latest]);

  /** The Save button: an event of a series asks for the scope first (R28). */
  const saveNow = useCallback(() => {
    if (cannotSave(valuesRef.current)) return;
    if (inSeries) return setAsk({ kind: "save" });
    void send();
  }, [inSeries, send]);

  /** The answer to the series question (R28). */
  const answer = useCallback(
    (scope: Scope) => {
      const current = ask;
      setAsk(null);
      if (!current) return;
      if (current.kind === "save") return void send(scope);
      void enqueue(async () => {
        const base = latest();
        const id = base.id;
        setBusy(true);
        const deleted = await live.run({
          send: () => postJson(`/api/events/${id}/delete`, { updatedAt: base.updatedAt, scope }),
          // One event goes at once (Undo brings it back); the later ones of the series go with the re-read.
          fromAnswer: () => (scope === "this" ? { week: (week) => withEventChange(week, { removed: id }) } : null),
        });
        setBusy(false);
        if (!deleted.ok) return setResult(deleted);
        if (outlookConnected) void postJson("/api/outlook/send", {}).then(() => live.refresh());
        if (scope === "this" && onDeleted) onDeleted(base, deletedTodos(deleted));
        else if (deleted.message) announce(deleted.message);
        onClose();
      });
    },
    [ask, send, enqueue, latest, live, outlookConnected, onDeleted, announce, onClose],
  );

  /** Cancel of the series question: the fields stay as they are, with Save still there. */
  const cancelAsk = useCallback(() => setAsk(null), []);

  /** The bin: a single event goes at once with Undo in the calendar's toast; a series asks first. */
  const remove = useCallback(() => {
    if (inSeries) return setAsk({ kind: "delete" });
    void enqueue(async () => {
      const base = latest();
      const id = base.id;
      setBusy(true);
      const deleted = await live.run({
        send: () => postJson(`/api/events/${id}/delete`, { updatedAt: base.updatedAt }),
        fromAnswer: () => ({ week: (week) => withEventChange(week, { removed: id }) }),
      });
      setBusy(false);
      if (!deleted.ok) return setResult(deleted);
      if (outlookConnected) void postJson("/api/outlook/send", {}).then(() => live.refresh());
      if (onDeleted) onDeleted(base, deletedTodos(deleted));
      else if (deleted.message) announce(deleted.message);
      onClose();
    });
  }, [inSeries, enqueue, latest, live, outlookConnected, onDeleted, announce, onClose]);

  /** Mark done / Reopen: shown at once, the editor stays open (as in the prototype). */
  const toggleDone = useCallback(() => {
    void enqueue(async () => {
      const base = latest();
      const status = base.status === "done" ? "planned" : "done";
      const id = base.id;
      const answered = await live.run({
        send: () => postJson(`/api/events/${id}/${status}`, {}),
        optimistic: { week: (week) => withEventStatus(week, id, status) },
        fromAnswer: savedEventChange,
      });
      if (!answered.ok) return setResult(answered);
      const dto = (answered.data as { event?: EventDto } | undefined)?.event;
      if (dto) {
        saved.current = { ...base, status: dto.status, updatedAt: dto.updatedAt };
        setEvent(saved.current);
      }
      setResult(null);
    });
  }, [enqueue, latest, live]);

  const shownEvent = newer(event, shown);
  /** Whether the fields differ from the saved event: the Save button shows only then. */
  const changed = accepted !== JSON.stringify(values) && isChanged(shownEvent, values);

  return { event: shownEvent, values, result, ask, busy, saving, changed, change, saveNow, discard, answer, cancelAsk, remove, toggleDone, close: onClose };
}
