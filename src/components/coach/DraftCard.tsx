"use client";

// A draft of the coach (spec 19), drawn as its day or days in the calendar's style: per day a heading
// with a status pill, the all-day events as chips, and a small day column with hour lines, the
// proposals as blocks in their goal's colour and, for the open draft, the calendar's own events pale
// and outlined beneath them. The column is decoration; the same proposals are a list for screen
// readers. An open draft has "Add to calendar" (accept_draft) and "Discard" (reject_draft); the server
// decides both, and a refusal shows its sentence here. Geometry: src/lib/chat/day-sketch.ts.
// Spec 20: a moved event is drawn at its new time like a proposal, with "Moved from 14:00", its old
// place as a pale dashed outline; a deleted event pale and struck through, "Removed". A draft that
// changes anything is applied with "Apply changes". An accepted draft offers a quiet "Undo"
// (undo_draft), and an undone one says so.
// Spec 21: a proposal with to-dos shows their count on its block ("0/3", when the block is tall
// enough, as in the calendar) and their titles in a list under the day.
// Spec 22: in the open draft, the blocks it creates or moves can be dragged as in the calendar's day
// grid (same maths, src/lib/events/drag.ts): up and down, and the bottom edge for the end, snapped to
// 15 minutes, on their day; mouse and pen only. The column then shows the whole visible day. Each drop
// is edit_draft with the version the screen last saw (R4): the block moves at once and goes back with
// the server's sentence when the server refuses. The list for screen readers always says the current
// times. There is no keyboard form of dragging (the calendar has none either); telling the coach works.
// Spec 23: a draft may add to-dos to events already in the calendar. Such an event is drawn as the
// calendar's own, pale, with a small mark "+2 to-dos" (an all-day event among the all-day chips), its
// day shown also when the draft has nothing else on it; under the column the list says "To-dos for
// 'Lernblock'" with the new titles. It is never dragged. The draft is applied with "Apply changes".
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useAnnounce } from "@/components/calendar/Announcer";
import { GOAL_ICONS } from "@/components/goals/GoalTile";
import { useDisplay } from "@/components/shell/DisplayProvider";
import { Button, LinkButton } from "@/components/ui/Button";
import {
  addedTodosText,
  canDragBlock,
  keepInWindow,
  SKETCH_HOUR_PX,
  sketchBox,
  sketchDraft,
  sketchHeight,
  type SketchBlock,
  type SketchDay,
} from "@/lib/chat/day-sketch";
import { withBlockAt, type DraftItem } from "@/lib/chat/edit";
import type { ChatGoal, DraftDto, DraftStatus } from "@/lib/chat/types";
import { postJson } from "@/lib/client/post-json";
import { exceedsThreshold, localAt, minuteAtY, moveSpan, resizeSpan, type Span } from "@/lib/events/drag";
import { formatMinute } from "@/lib/events/grid";
import type { EventDto } from "@/lib/events/types";
import { goalColor } from "@/lib/goals/colors";
import { fmtDateLong, fmtDateShort, fmtHour, fmtTime, fmtRange, type TimeFormat } from "@/lib/time/display";
import { parseLocalDateTime, type LocalDate } from "@/lib/time/zoned";
import { todoCountText } from "@/lib/todos/types";

const PILL: Record<DraftStatus, { label: string; className: string }> = {
  open: { label: "Draft", className: "bg-ink text-white" },
  accepted: { label: "Added", className: "bg-success-soft text-success" },
  rejected: { label: "Discarded", className: "bg-raised text-ink-3" },
  replaced: { label: "Replaced", className: "bg-raised text-ink-3" },
  undone: { label: "Undone", className: "bg-raised text-ink-3" },
};

const NEUTRAL_BLOCK = "bg-raised border-line text-ink";

function timeText(block: SketchBlock, format: TimeFormat): string {
  if (block.endsNextDay) return `${fmtTime(block.startTime, format)} – ${fmtTime(block.endTime, format)} next day`;
  return fmtRange(block.startTime, block.endTime, format);
}

function spokenTime(block: SketchBlock, format: TimeFormat): string {
  const end = fmtTime(block.endTime, format);
  return `${fmtTime(block.startTime, format)} to ${block.endsNextDay ? `${end} the next day` : end}`;
}

/** "Moved from 14:00", or with the old day when it was another one ("Moved from Nov 17, 14:00"). */
function movedFrom(block: { fromTime: string; fromDate: LocalDate }, date: LocalDate, format: TimeFormat): string {
  const time = fmtTime(block.fromTime, format);
  return block.fromDate === date ? `Moved from ${time}` : `Moved from ${fmtDateShort(block.fromDate)}, ${time}`;
}

/** Spec 23: ", 2 to-dos added" for an existing event the draft adds to-dos to; empty otherwise. */
function spokenAdded(todos: string[] | undefined): string {
  if (!todos || todos.length === 0) return "";
  return `, ${todos.length} ${todos.length === 1 ? "to-do" : "to-dos"} added`;
}

/** Spec 23: the lists of new to-dos for existing events on a day, in the order they are drawn. */
function addedLists(day: SketchDay): { title: string; todos: string[] }[] {
  return [
    ...day.allDayTodos.map((chip) => ({ title: chip.title, todos: chip.addedTodos })),
    ...[...day.withTodos, ...day.moved]
      .filter((block) => block.addedTodos && block.addedTodos.length > 0)
      .sort((a, b) => a.startMin - b.startMin)
      .map((block) => ({ title: block.title, todos: block.addedTodos! })),
  ];
}

type Gesture = { kind: "move" | "resize"; pointerId: number; block: SketchBlock; y: number; x: number; grabMin: number; active: boolean };

/** Holds on to the pointer; if the browser refuses (the pointer is gone already), the gesture goes on without. */
function capturePointer(el: Element, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // for example NotFoundError when the pointer is no longer active
  }
}

/** The page's cursor while a block is dragged (as in the calendar). */
function setCursor(value: string): void {
  document.body.style.cursor = value;
}

/** A block drawn at a dragged span: the same block with the new minutes and times. */
function atSpan(block: SketchBlock, span: Span): SketchBlock {
  return { ...block, startMin: span.startMin, endMin: span.endMin, startTime: formatMinute(span.startMin), endTime: formatMinute(span.endMin), endsNextDay: span.endMin >= 24 * 60 };
}

type DayColumnProps = {
  day: SketchDay;
  goals: ChatGoal[];
  open: boolean;
  /** Spec 22: the open draft's blocks can be dragged (not while a change of it is being saved). */
  canDrag: boolean;
  onDrop: (key: string, date: LocalDate, span: Span) => void;
};

function DayColumn({ day, goals, open, canDrag, onDrop }: DayColumnProps) {
  const { timeFormat } = useDisplay();
  const goalOf = (id: string | null) => (id ? goals.find((g) => g.id === id) : undefined);
  const height = sketchHeight(day);
  const columnRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const [preview, setPreview] = useState<{ key: string; span: Span } | null>(null);
  const range = { startMin: day.startMin, endMin: day.endMin };

  // Escape cancels a running drag (only while one is shown).
  const dragging = preview !== null;
  useEffect(() => {
    if (!dragging) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      gestureRef.current = null;
      setCursor("");
      setPreview(null);
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dragging]);

  const begin = (e: ReactPointerEvent<HTMLElement>, block: SketchBlock, kind: Gesture["kind"]) => {
    // Mouse and pen only, as in the calendar: touch scrolls the page.
    if (!canDrag || e.button !== 0 || e.pointerType === "touch" || !columnRef.current) return;
    e.stopPropagation();
    const top = columnRef.current.getBoundingClientRect().top;
    gestureRef.current = {
      kind,
      pointerId: e.pointerId,
      block,
      x: e.clientX,
      y: e.clientY,
      grabMin: minuteAtY(e.clientY - top, range, SKETCH_HOUR_PX) - block.startMin,
      active: false,
    };
    capturePointer(e.currentTarget, e.pointerId);
  };

  /** The span for the pointer's height: the calendar's drag maths, kept inside this column. */
  const spanAt = (g: Gesture, clientY: number): Span | null => {
    if (!columnRef.current) return null;
    const current = minuteAtY(clientY - columnRef.current.getBoundingClientRect().top, range, SKETCH_HOUR_PX);
    const span = { startMin: g.block.startMin, endMin: g.block.endMin };
    const next = g.kind === "move" ? moveSpan(span, current - g.grabMin - g.block.startMin) : resizeSpan(span, current);
    return keepInWindow(next, day);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId) return;
    if (!g.active) {
      if (!exceedsThreshold(e.clientX - g.x, e.clientY - g.y)) return;
      setCursor(g.kind === "move" ? "grabbing" : "ns-resize");
      gestureRef.current = { ...g, active: true };
    }
    const span = spanAt(g, e.clientY);
    if (span && g.block.key) setPreview({ key: g.block.key, span });
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gestureRef.current = null;
    setCursor("");
    setPreview(null);
    if (!g.active || !g.block.key) return;
    const span = spanAt(g, e.clientY);
    if (span && (span.startMin !== g.block.startMin || span.endMin !== g.block.endMin)) onDrop(g.block.key, day.date, span);
  };

  const onPointerCancel = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (gestureRef.current?.pointerId !== e.pointerId) return;
    gestureRef.current = null;
    setCursor("");
    setPreview(null);
  };

  const shown = (block: SketchBlock) => (preview && block.key === preview.key ? atSpan(block, preview.span) : block);

  return (
    <div aria-hidden className="flex">
      <div className="relative w-11 shrink-0" style={{ height }}>
        {day.hours.slice(0, -1).map((m) => (
          <span key={m} className="absolute right-2 text-[10px] tabular text-ink-3" style={{ top: sketchBox({ startMin: m, endMin: m }, day).top + 1 }}>
            {fmtHour(m / 60, timeFormat)}
          </span>
        ))}
      </div>
      <div
        ref={columnRef}
        className={`relative min-w-0 flex-1 border-l border-line-subtle ${canDrag ? "select-none" : ""}`}
        style={{ height }}
        onPointerMove={canDrag ? onPointerMove : undefined}
        onPointerUp={canDrag ? onPointerUp : undefined}
        onPointerCancel={canDrag ? onPointerCancel : undefined}
      >
        {day.hours.map((m) => (
          <div key={m} className="absolute inset-x-0 border-t border-line-subtle" style={{ top: sketchBox({ startMin: m, endMin: m }, day).top }} />
        ))}
        {open &&
          day.existing.map((block, i) => {
            const { top, height: h } = sketchBox(block, day);
            return (
              <div
                key={`e${i}`}
                className="absolute left-1 right-1 z-[1] overflow-hidden rounded-lg border border-dashed border-line bg-canvas/80 px-1.5 py-0.5 text-ink-3"
                style={{ top, height: h }}
              >
                <span className="block truncate text-[10px] font-medium leading-[13px]">{block.title}</span>
                {h >= 34 && <span className="block truncate text-[10px] leading-[13px] tabular">{timeText(block, timeFormat)}</span>}
              </div>
            );
          })}
        {day.withTodos.map((block, i) => {
          const { top, height: h } = sketchBox(block, day);
          return (
            <div
              key={`w${i}`}
              data-sketch="todos"
              className="absolute left-1 right-6 z-[2] overflow-hidden rounded-lg border border-dashed border-line bg-canvas px-1.5 py-0.5 text-ink-2"
              style={{ top, height: h }}
            >
              <span className="block truncate text-[11px] font-medium leading-[14px]">{block.title}</span>
              {h >= 48 && <span className="block truncate text-[10px] leading-[13px] tabular text-ink-3">{timeText(block, timeFormat)}</span>}
              <span data-sketch="todo-mark" className="absolute bottom-0.5 right-1 rounded bg-surface px-1 text-[10px] font-medium tabular text-ink-2">
                {addedTodosText(block.addedTodos?.length ?? 0)}
              </span>
            </div>
          );
        })}
        {day.oldPlaces.map((block, i) => {
          const { top, height: h } = sketchBox(block, day);
          return (
            <div
              key={`o${i}`}
              data-sketch="old-place"
              className="absolute left-1 right-6 z-[1] overflow-hidden rounded-lg border border-dashed border-line px-1.5 py-0.5 text-ink-3 opacity-70"
              style={{ top, height: h }}
            >
              <span className="block truncate text-[10px] leading-[13px]">{block.title}</span>
            </div>
          );
        })}
        {day.removed.map((block, i) => {
          const { top, height: h } = sketchBox(block, day);
          return (
            <div
              key={`r${i}`}
              data-sketch="removed"
              className="absolute left-1 right-6 z-[2] overflow-hidden rounded-lg border border-line bg-raised px-1.5 py-0.5 text-ink-3 opacity-60"
              style={{ top, height: h }}
            >
              <span className="block truncate text-[11px] font-medium leading-[14px] line-through">{block.title}</span>
              {h >= 34 && <span className="block truncate text-[10px] leading-[13px]">Removed</span>}
            </div>
          );
        })}
        {[...day.proposals.map((block) => ({ block, from: null as string | null })), ...day.moved.map((block) => ({ block, from: movedFrom(block, day.date, timeFormat) }))].map(
          ({ block: drawn, from }, i) => {
            const block = shown(drawn);
            const { top, height: h } = sketchBox(block, day);
            const goal = goalOf(block.goalId);
            const Icon = goal ? GOAL_ICONS[goal.look.icon] : null;
            const draggable = canDrag && canDragBlock(drawn);
            const moving = preview !== null && drawn.key === preview.key;
            return (
              <div
                key={`p${i}`}
                data-sketch={from ? "moved" : "proposal"}
                data-draggable={draggable || undefined}
                onPointerDown={draggable ? (e) => begin(e, drawn, "move") : undefined}
                className={`absolute left-1 right-6 overflow-hidden rounded-lg border px-1.5 py-0.5 shadow-float ${moving ? "z-[4]" : "z-[3]"} ${draggable ? "cursor-grab" : ""} ${goal ? goalColor(goal.look.color).block : NEUTRAL_BLOCK}`}
                style={{ top, height: h }}
              >
                <span className="flex items-center gap-1 text-[11px] font-medium leading-[14px]">
                  {Icon && <Icon className="size-3 shrink-0" />}
                  <span className="truncate">{block.title}</span>
                </span>
                {from && <span className="block truncate text-[10px] leading-[13px] opacity-80">{from}</span>}
                {(moving || h >= (from ? 48 : 34)) && <span className="block truncate text-[10px] leading-[13px] tabular opacity-80">{timeText(block, timeFormat)}</span>}
                {block.todos && h >= 52 && (
                  <span className="absolute bottom-1 right-1 text-[10px] tabular opacity-80">{todoCountText(0, block.todos.length)}</span>
                )}
                {block.addedTodos && (
                  <span data-sketch="todo-mark" className="absolute bottom-0.5 right-1 rounded bg-surface/80 px-1 text-[10px] font-medium tabular text-ink-2">
                    {addedTodosText(block.addedTodos.length)}
                  </span>
                )}
                {draggable && <span onPointerDown={(e) => begin(e, drawn, "resize")} className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize" />}
              </div>
            );
          },
        )}
      </div>
    </div>
  );
}

type Props = {
  draft: DraftDto;
  goals: ChatGoal[];
  timeZone: string;
  /** The calendar's events on the draft's days; only for the open draft the page was loaded with. */
  calendar: EventDto[];
  /** The draft's status changed on the server (added or discarded). */
  onStatus: (draftId: string, status: DraftStatus) => void;
  /** Spec 22: the server saved a change of the open draft; this is the draft as it is now. */
  onEdited?: (draft: DraftDto) => void;
};

/** The block a key names ("new:0", "move:<event id>"). */
function itemOf(key: string): DraftItem | null {
  if (key.startsWith("new:")) return { kind: "new", index: Number(key.slice(4)) };
  if (key.startsWith("move:")) return { kind: "move", eventId: key.slice(5) };
  return null;
}

export function DraftCard({ draft: saved, goals, timeZone, calendar, onStatus, onEdited }: Props) {
  const router = useRouter();
  const announce = useAnnounce();
  const { timeFormat, dayStartHour, dayEndHour } = useDisplay();
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState("");
  // Spec 22: a dropped block is shown at its new place at once, while the server decides.
  const [moving, setMoving] = useState<{ item: DraftItem; startAt: string; endAt: string } | null>(null);
  const draft = moving ? withBlockAt(saved, moving.item, moving.startAt, moving.endAt) : saved;
  const open = draft.status === "open";
  const added = draft.addedTodos ?? [];
  const days = sketchDraft(
    draft.events,
    open ? calendar : [],
    timeZone,
    draft.changes,
    open ? { startHour: dayStartHour, endHour: dayEndHour } : undefined,
    added,
  );
  const pill = PILL[draft.status];
  const goalOf = (id: string | null) => (id ? goals.find((g) => g.id === id) : undefined);
  const changes = draft.changes.length > 0 || added.length > 0;
  // Spec 23: a draft of only to-dos for existing events has no block to drag.
  const hasBlocks = draft.events.length > 0 || draft.changes.some((c) => c.kind === "move");
  const working = busy || moving !== null;

  async function drop(key: string, date: LocalDate, span: Span) {
    const item = itemOf(key);
    const start = localAt(date, span.startMin);
    const end = localAt(date, span.endMin);
    const startAt = parseLocalDateTime(start, timeZone);
    const endAt = parseLocalDateTime(end, timeZone);
    if (!item || !startAt || !endAt || working) return;
    setRefusal("");
    setMoving({ item, startAt: startAt.toISOString(), endAt: endAt.toISOString() });
    const answer = await postJson(`/api/chat/drafts/${saved.id}/edit`, { version: saved.version ?? 0, item, start, end });
    setMoving(null);
    if (!answer.ok) {
      // Nothing was saved (R1): the block goes back, the server's sentence shows in the card.
      setRefusal(answer.message);
      const code = (answer.data as { error?: unknown } | undefined)?.error;
      // Changed on another device, not open any more, or out of date: read the page again.
      if (code === "changed_elsewhere" || code === "draft_not_open" || code === "draft_out_of_date") router.refresh();
      return;
    }
    const edited = (answer.data as { draft?: DraftDto | null } | undefined)?.draft;
    if (edited) onEdited?.(edited);
    announce(answer.message);
  }

  async function act(kind: "accept" | "reject" | "undo") {
    setBusy(true);
    setRefusal("");
    const answer = await postJson(`/api/chat/drafts/${draft.id}/${kind}`, {});
    setBusy(false);
    if (!answer.ok) {
      setRefusal(answer.message);
      // Not open any more, out of date, or no longer undoable: read the page again to show the draft as it is now.
      if (answer.status === 409) router.refresh();
      return;
    }
    onStatus(draft.id, kind === "accept" ? "accepted" : kind === "undo" ? "undone" : "rejected");
    announce(answer.message);
    // Outlook gets the change at once, as after a change in the calendar (nothing happens when not connected).
    if (kind !== "reject") void postJson("/api/outlook/send", {});
    router.refresh();
  }

  return (
    <div
      className={`mt-3 overflow-hidden rounded-card border border-line-subtle bg-surface ${open ? "shadow-float" : ""}`}
      data-draft-status={draft.status}
    >
      {days.map((day) => (
        <section key={day.date} aria-label={`Draft for ${fmtDateLong(day.date)}`} className="border-b border-line-subtle p-3 last:border-b-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold tracking-snug text-ink">Draft for {fmtDateShort(day.date)}</h3>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${pill.className}`}>{pill.label}</span>
          </div>
          {((open && day.allDay.length > 0) || day.allDayTodos.length > 0) && (
            <ul aria-label="All day" className="mb-2 ml-11 flex flex-wrap gap-1">
              {day.allDayTodos.map((chip, i) => (
                <li
                  key={`t${i}`}
                  data-sketch="todos"
                  className="flex max-w-full items-center gap-1 rounded-md border border-dashed border-line bg-canvas px-1.5 py-0.5 text-[10px] font-medium text-ink-2"
                >
                  <span className="truncate">{chip.title}</span>
                  <span data-sketch="todo-mark" className="shrink-0 tabular">
                    {addedTodosText(chip.addedTodos.length)}
                  </span>
                </li>
              ))}
              {open &&
                day.allDay.map((title, i) => (
                  <li key={i} className="max-w-full truncate rounded-md border border-line bg-raised px-1.5 py-0.5 text-[10px] font-medium text-ink-3">
                    {title}
                  </li>
                ))}
            </ul>
          )}
          {day.endMin > day.startMin && (
            <div className={open ? "" : "opacity-60"}>
              <DayColumn day={day} goals={goals} open={open} canDrag={open && !working} onDrop={(key, date, span) => void drop(key, date, span)} />
            </div>
          )}
          {day.proposals.some((block) => block.todos) && (
            <ul aria-label="To-dos" className="ml-11 mt-2 flex flex-col gap-2">
              {day.proposals
                .filter((block) => block.todos)
                .map((block, i) => (
                  <li key={`t${i}`} className="min-w-0">
                    <p className="flex items-center justify-between gap-2 text-[11px] font-medium text-ink-2">
                      <span className="truncate">{block.title}</span>
                      <span className="shrink-0 tabular text-ink-3" aria-label={`${block.todos!.length} to-dos`}>
                        {todoCountText(0, block.todos!.length)}
                      </span>
                    </p>
                    <ul className="mt-1 flex flex-col gap-1">
                      {block.todos!.map((todo, j) => (
                        <li key={j} className="flex items-start gap-1.5 text-xs text-ink">
                          <span aria-hidden className="mt-0.5 size-3 shrink-0 rounded border border-line" />
                          <span className="min-w-0 break-words">{todo}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
            </ul>
          )}
          {addedLists(day).length > 0 && (
            <ul aria-label="To-dos for events in the calendar" className="ml-11 mt-2 flex flex-col gap-2">
              {addedLists(day).map((list, i) => (
                <li key={`a${i}`} className="min-w-0">
                  <p className="flex items-center justify-between gap-2 text-[11px] font-medium text-ink-2">
                    <span className="truncate">{`To-dos for '${list.title}'`}</span>
                    <span className="shrink-0 tabular text-ink-3">{addedTodosText(list.todos.length)}</span>
                  </p>
                  <ul className="mt-1 flex flex-col gap-1">
                    {list.todos.map((todo, j) => (
                      <li key={j} className="flex items-start gap-1.5 text-xs text-ink">
                        <span aria-hidden className="mt-0.5 size-3 shrink-0 rounded border border-line" />
                        <span className="min-w-0 break-words">{todo}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
          <ul className="sr-only">
            {day.proposals.map((block, i) => {
              const goal = goalOf(block.goalId);
              const todos = block.todos ? `, ${block.todos.length} to-dos` : "";
              return <li key={`p${i}`}>{`${block.title}, ${spokenTime(block, timeFormat)}${goal ? `, goal ${goal.title}` : ""}${todos}`}</li>;
            })}
            {day.moved.map((block, i) => (
              <li key={`m${i}`}>
                {`${block.title}, moved to ${spokenTime(block, timeFormat)}, ${movedFrom(block, day.date, timeFormat).replace("Moved", "moved")}${spokenAdded(block.addedTodos)}`}
              </li>
            ))}
            {day.withTodos.map((block, i) => (
              <li key={`w${i}`}>{`${block.title}, ${spokenTime(block, timeFormat)}, already in the calendar${spokenAdded(block.addedTodos)}`}</li>
            ))}
            {day.allDayTodos.map((chip, i) => (
              <li key={`d${i}`}>{`${chip.title}, all day, already in the calendar${spokenAdded(chip.addedTodos)}`}</li>
            ))}
            {day.oldPlaces
              .filter((block) => block.toDate !== day.date)
              .map((block, i) => (
                <li key={`o${i}`}>{`${block.title}, ${spokenTime(block, timeFormat)}, moved to ${fmtDateShort(block.toDate)}`}</li>
              ))}
            {day.removed.map((block, i) => (
              <li key={`r${i}`}>{`${block.title}, ${spokenTime(block, timeFormat)}, removed`}</li>
            ))}
          </ul>
        </section>
      ))}
      {open && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line-subtle bg-raised/50 p-3">
          <Button size="sm" disabled={working} onClick={() => void act("accept")}>
            {changes ? "Apply changes" : "Add to calendar"}
          </Button>
          <Button size="sm" variant="ghost" disabled={working} onClick={() => void act("reject")}>
            Discard
          </Button>
          <span className="text-xs text-ink-3">
            {hasBlocks ? "Drag a block to change its time. Or tell me what to change." : "Tell me what to change."}
          </span>
        </div>
      )}
      {draft.status === "accepted" && days.length > 0 && (
        <div className="flex items-center gap-2 border-t border-line-subtle p-3">
          <LinkButton size="sm" variant="secondary" href={`/?view=day&date=${days[0].date}`}>
            Open calendar
          </LinkButton>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act("undo")}>
            Undo
          </Button>
        </div>
      )}
      {refusal && (
        <p role="alert" className="border-t border-line-subtle bg-danger-soft px-3 py-2 text-sm text-danger">
          {refusal}
        </p>
      )}
    </div>
  );
}
