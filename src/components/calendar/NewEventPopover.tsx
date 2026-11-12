"use client";

// The small floating card "New event", copied from the first prototype: after a click or a drag on
// free time in the calendar (and from "+"). Title, goal, start and end, length chips. "Add" creates the
// event right away (create_event; it shows at once when the answer arrives); "Add details" opens the
// full editor with what is filled in, for repeating, all-day, location or overlap. The server checks every rule.
import { useState, type FormEvent } from "react";
import { FormMessage } from "@/components/account/FormMessage";
import { Button } from "@/components/ui/Button";
import { useLive } from "@/components/live/Live";
import { postJson, type PostResult } from "@/lib/client/post-json";
import { localAt, MIN_DURATION } from "@/lib/events/drag";
import { fmtDateShort, fmtMinutes } from "@/lib/time/display";
import { LAST_MINUTE, endProblem } from "@/lib/time/wheel";
import { useAnnounce } from "./Announcer";
import { savedEventChange } from "./event-changes";
import { Eyebrow, GoalChips, ToggleChip, inputClass } from "./fields";
import { FloatingPanel, type Anchor } from "./FloatingPanel";
import { TimeField, TimeWheel } from "./TimeWheel";
import type { GoalLabel } from "./TimeGrid";

const DURATIONS = [
  { min: 30, label: "30m" },
  { min: 60, label: "1h" },
  { min: 90, label: "1.5h" },
  { min: 120, label: "2h" },
];

/** What "Add details" hands to the full editor. */
export type NewEventDraft = { title: string; goalId: string | null; start: string; end: string };

type Props = {
  date: string;
  startMin: number;
  endMin: number;
  anchor: Anchor;
  goals: GoalLabel[];
  /** Connected to Outlook: the new event is sent there right away (R26). */
  outlookConnected?: boolean;
  onClose: () => void;
  onOpenEditor: (draft: NewEventDraft) => void;
};

/** The card in its floating panel (a sheet from the bottom on phones). */
export function NewEventPopover({ anchor, ...rest }: Props) {
  return (
    <FloatingPanel anchor={anchor} label="New event" width={320} onClose={rest.onClose}>
      <NewEventForm {...rest} />
    </FloatingPanel>
  );
}

/** The card's content (also rendered on its own for the previews and tests). */
export function NewEventForm({ date, startMin, endMin, goals, outlookConnected = false, onClose, onOpenEditor }: Omit<Props, "anchor">) {
  const live = useLive();
  const announce = useAnnounce();
  const [title, setTitle] = useState("");
  const [goalId, setGoalId] = useState<string | null>(null);
  const [start, setStart] = useState(startMin);
  // At least MIN_DURATION long, even if the input does not say so; at the latest 23:59 (the wheel's end).
  const [end, setEnd] = useState(() => Math.min(LAST_MINUTE, Math.max(endMin, startMin + MIN_DURATION)));
  // Which time's wheel is showing under the fields, if any.
  const [wheel, setWheel] = useState<"start" | "end" | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PostResult | null>(null);
  const duration = end - start;
  const timeProblem = endProblem(start, end);
  const canSubmit = title.trim().length > 0 && !busy && timeProblem === null;

  const draft = (): NewEventDraft => ({ title: title.trim(), goalId, start: localAt(date, start), end: localAt(date, end) });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const { title: name, start: from, end: to } = draft();
    setBusy(true);
    const answer = await live.run({
      send: () => postJson("/api/events", { title: name, start: from, end: to, goalId }),
      fromAnswer: savedEventChange,
    });
    setBusy(false);
    if (!answer.ok) return setResult(answer);
    if (answer.message) announce(answer.message);
    if (outlookConnected) void postJson("/api/outlook/send", {}).then(() => live.refresh());
    onClose();
  };

  // A new start keeps the length.
  const changeStart = (min: number) => {
    setStart(min);
    setEnd(Math.min(LAST_MINUTE, min + Math.max(duration, MIN_DURATION)));
  };

  return (
    <form
      onSubmit={onSubmit}
      onKeyDown={(e) => {
        // Esc first folds the wheel; the next Esc closes the card.
        if (wheel && e.key === "Escape" && !e.defaultPrevented) {
          e.preventDefault();
          setWheel(null);
        }
      }}
      className="flex flex-col gap-3 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>New event</Eyebrow>
        <span className="text-xs tabular text-ink-3">{fmtDateShort(date)}</span>
      </div>

      <input
        autoFocus
        aria-label="Title"
        placeholder="What are you working on?"
        maxLength={100}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className={inputClass}
      />

      <GoalChips goals={goals} value={goalId} onChange={setGoalId} />

      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Eyebrow>Start</Eyebrow>
          <TimeField label="Start" value={start} onChange={changeStart} open={wheel === "start"} onOpen={() => setWheel("start")} />
        </div>
        <span aria-hidden className="mt-7 text-sm text-ink-3">
          –
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Eyebrow>
            End
            {duration > 0 && <span className="normal-case tracking-normal tabular"> · {fmtMinutes(duration)}</span>}
          </Eyebrow>
          <TimeField label="End" value={end} onChange={setEnd} open={wheel === "end"} onOpen={() => setWheel("end")} />
        </div>
      </div>

      {wheel && (
        <TimeWheel
          label={wheel === "start" ? "Start" : "End"}
          value={wheel === "start" ? start : end}
          onChange={wheel === "start" ? changeStart : setEnd}
        />
      )}

      {timeProblem && (
        <p role="alert" className="text-xs text-danger">
          {timeProblem}
        </p>
      )}

      <div role="group" aria-label="Duration" className="flex flex-wrap gap-1.5">
        {DURATIONS.map((d) => (
          <ToggleChip key={d.min} pressed={duration === d.min} onClick={() => setEnd(Math.min(LAST_MINUTE, start + d.min))} className="tabular">
            {d.label}
          </ToggleChip>
        ))}
      </div>

      {result && <FormMessage tone="error" text={result.message} />}

      <div className="flex gap-2">
        <Button type="submit" disabled={!canSubmit} className="flex-1">
          {busy ? "Adding…" : "Add"}
        </Button>
        <Button variant="secondary" disabled={!canSubmit} onClick={() => onOpenEditor(draft())} className="flex-1">
          Add details
        </Button>
      </div>
    </form>
  );
}
