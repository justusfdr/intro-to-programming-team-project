"use client";

// Saving an existing event at once, as in the prototype (spec 16). Each change shows in the editor
// and in the calendar straight away and is sent as edit_event with the updated_at the screen last saw
// (R4). Changes are sent one after the other, each with the updated_at of the answer before it. If
// the server refuses, the field goes back to the saved value and the ontology's message shows (R1).
// Typing (title, location) is sent after a short pause or when the field is left, not on every key.
// An event of a series first asks "This event" or "This and following events" (R28).
import { useCallback, useEffect, useRef, useState } from "react";
import { useLive } from "@/components/live/Live";
import { postJson, type PostResult } from "@/lib/client/post-json";
import type { CalendarEvent, EventDto } from "@/lib/events/types";
import { withEventChange, withEventStatus } from "@/lib/events/week-view";
import { useAnnounce } from "../Announcer";
import { savedEventChange, type Scope } from "../event-changes";
import { editBody, editedChange, eventFromAnswer, newer, valuesOf, type EventValues } from "./values";

/** How long typing may pause before it is saved. */
export const TYPING_PAUSE_MS = 800;

/** What the footer asks before a change or a delete of an event of a series. */
export type SeriesAsk = { kind: "save"; patch: Partial<EventValues> } | { kind: "delete" } | null;

type Options = {
  initial: CalendarEvent;
  /** The same event as the calendar shows it now (it may be newer, for example after a re-read). */
  shown: CalendarEvent | null | undefined;
  timeZone: string;
  outlookConnected: boolean;
  onDeleted?: (event: CalendarEvent) => void;
  onClose: () => void;
};

export function useEventSave({ initial, shown, timeZone, outlookConnected, onDeleted, onClose }: Options) {
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

  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const typed = useRef<Partial<EventValues>>({});
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const fromOutlook = initial.source === "outlook";
  const inSeries = initial.seriesId !== null && !fromOutlook;

  const show = useCallback((patch: Partial<EventValues>) => {
    valuesRef.current = { ...valuesRef.current, ...patch };
    setValues(valuesRef.current);
  }, []);

  /** Puts the fields of a refused or cancelled change back to the saved values (unless typed over since). */
  const putBack = useCallback(
    (patch: Partial<EventValues>) => {
      const base = valuesOf(latest());
      const back: Partial<EventValues> = {};
      for (const key of Object.keys(patch) as (keyof EventValues)[]) {
        if (valuesRef.current[key] === patch[key]) (back as Record<string, unknown>)[key] = base[key];
      }
      show(back);
    },
    [latest, show],
  );

  const afterSave = useCallback(
    (answer: PostResult, before: CalendarEvent) => {
      const next = eventFromAnswer(answer, timeZone, before);
      if (next) {
        saved.current = next;
        setEvent(next);
      }
      setResult(null);
      if (answer.message) announce(answer.message);
      // The change goes to Outlook now, not at the next sync; the week re-reads once it is there (R26).
      if (outlookConnected && !fromOutlook) void postJson("/api/outlook/send", {}).then(() => live.refresh());
    },
    [timeZone, announce, outlookConnected, fromOutlook, live],
  );

  /** Queues one action after the ones before it, so each carries the updated_at of the last answer. */
  const enqueue = useCallback((step: () => Promise<unknown>) => {
    const next = queue.current.then(step, step);
    queue.current = next.catch(() => undefined);
    return next;
  }, []);

  const save = useCallback(
    (patch: Partial<EventValues>, scope?: Scope) =>
      enqueue(async () => {
        const base = latest();
        const before = valuesOf(base);
        const next = { ...before, ...patch };
        // Nothing to send when the change is what the server has already.
        if (JSON.stringify(editBody(base, next, "", scope)) === JSON.stringify(editBody(base, before, "", scope))) return;
        const answer = await live.run({
          send: () => postJson(`/api/events/${base.id}/edit`, editBody(base, next, base.updatedAt, scope)),
          optimistic: editedChange(base, next, timeZone, scope) ?? undefined,
          fromAnswer: savedEventChange,
        });
        if (!answer.ok) {
          setResult(answer);
          putBack(patch);
          return;
        }
        afterSave(answer, base);
      }),
    [enqueue, latest, live, timeZone, putBack, afterSave],
  );

  /** Sends what was typed (or chosen) and not sent yet. `final`: the field was left, so an empty title goes back. */
  const commit = useCallback(
    (final: boolean) => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      const patch = { ...typed.current };
      typed.current = {};
      if (patch.title !== undefined && patch.title.trim() === "") {
        // Never saved empty: put the saved title back when the field is left, else wait for more typing.
        if (final) show({ title: latest().title });
        else typed.current.title = patch.title;
        delete patch.title;
      }
      if (Object.keys(patch).length === 0) return;
      if (inSeries && !final) {
        // An event of a series asks first; not in the middle of typing, only when the field is left.
        typed.current = { ...patch, ...typed.current };
        return;
      }
      if (inSeries) {
        setAsk((current) => ({ kind: "save", patch: { ...(current?.kind === "save" ? current.patch : {}), ...patch } }));
        return;
      }
      void save(patch);
    },
    [inSeries, latest, save, show],
  );

  /** A change: shown at once; `typing` waits for a pause or for the field to be left. */
  const change = useCallback(
    (patch: Partial<EventValues>, typing = false) => {
      show(patch);
      typed.current = { ...typed.current, ...patch };
      if (typing) {
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => commit(false), TYPING_PAUSE_MS);
      } else commit(true);
    },
    [show, commit],
  );

  /** The answer to the series question (R28). */
  const answer = useCallback(
    (scope: Scope) => {
      const current = ask;
      setAsk(null);
      if (!current) return;
      if (current.kind === "save") return void save(current.patch, scope);
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
        if (scope === "this" && onDeleted) onDeleted(base);
        else if (deleted.message) announce(deleted.message);
        onClose();
      });
    },
    [ask, save, enqueue, latest, live, outlookConnected, onDeleted, announce, onClose],
  );

  const cancelAsk = useCallback(() => {
    if (ask?.kind === "save") putBack(ask.patch);
    setAsk(null);
  }, [ask, putBack]);

  /** The bin: a single event goes at once with Undo in the calendar's toast; a series asks first. */
  const remove = useCallback(() => {
    commit(true);
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
      if (onDeleted) onDeleted(base);
      else if (deleted.message) announce(deleted.message);
      onClose();
    });
  }, [commit, inSeries, enqueue, latest, live, outlookConnected, onDeleted, announce, onClose]);

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

  /** Close: what was typed and not sent yet is sent first. */
  const close = useCallback(() => {
    commit(true);
    onClose();
  }, [commit, onClose]);

  return { event: newer(event, shown), values, result, ask, busy, change, commit, answer, cancelAsk, remove, toggleDone, close };
}
