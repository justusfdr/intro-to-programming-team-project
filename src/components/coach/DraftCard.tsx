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
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAnnounce } from "@/components/calendar/Announcer";
import { GOAL_ICONS } from "@/components/goals/GoalTile";
import { useDisplay } from "@/components/shell/DisplayProvider";
import { Button, LinkButton } from "@/components/ui/Button";
import { sketchBox, sketchDraft, sketchHeight, type SketchBlock, type SketchDay } from "@/lib/chat/day-sketch";
import type { ChatGoal, DraftDto, DraftStatus } from "@/lib/chat/types";
import { postJson } from "@/lib/client/post-json";
import type { EventDto } from "@/lib/events/types";
import { goalColor } from "@/lib/goals/colors";
import { fmtDateLong, fmtDateShort, fmtHour, fmtTime, fmtRange, type TimeFormat } from "@/lib/time/display";
import type { LocalDate } from "@/lib/time/zoned";
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

function DayColumn({ day, goals, open }: { day: SketchDay; goals: ChatGoal[]; open: boolean }) {
  const { timeFormat } = useDisplay();
  const goalOf = (id: string | null) => (id ? goals.find((g) => g.id === id) : undefined);
  const height = sketchHeight(day);
  return (
    <div aria-hidden className="flex">
      <div className="relative w-11 shrink-0" style={{ height }}>
        {day.hours.slice(0, -1).map((m) => (
          <span key={m} className="absolute right-2 text-[10px] tabular text-ink-3" style={{ top: sketchBox({ startMin: m, endMin: m }, day).top + 1 }}>
            {fmtHour(m / 60, timeFormat)}
          </span>
        ))}
      </div>
      <div className="relative min-w-0 flex-1 border-l border-line-subtle" style={{ height }}>
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
          ({ block, from }, i) => {
            const { top, height: h } = sketchBox(block, day);
            const goal = goalOf(block.goalId);
            const Icon = goal ? GOAL_ICONS[goal.look.icon] : null;
            return (
              <div
                key={`p${i}`}
                data-sketch={from ? "moved" : "proposal"}
                className={`absolute left-1 right-6 z-[3] overflow-hidden rounded-lg border px-1.5 py-0.5 shadow-float ${goal ? goalColor(goal.look.color).block : NEUTRAL_BLOCK}`}
                style={{ top, height: h }}
              >
                <span className="flex items-center gap-1 text-[11px] font-medium leading-[14px]">
                  {Icon && <Icon className="size-3 shrink-0" />}
                  <span className="truncate">{block.title}</span>
                </span>
                {from && <span className="block truncate text-[10px] leading-[13px] opacity-80">{from}</span>}
                {h >= (from ? 48 : 34) && <span className="block truncate text-[10px] leading-[13px] tabular opacity-80">{timeText(block, timeFormat)}</span>}
                {block.todos && h >= 52 && (
                  <span className="absolute bottom-1 right-1 text-[10px] tabular opacity-80">{todoCountText(0, block.todos.length)}</span>
                )}
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
};

export function DraftCard({ draft, goals, timeZone, calendar, onStatus }: Props) {
  const router = useRouter();
  const announce = useAnnounce();
  const { timeFormat } = useDisplay();
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState("");
  const open = draft.status === "open";
  const days = sketchDraft(draft.events, open ? calendar : [], timeZone, draft.changes);
  const pill = PILL[draft.status];
  const goalOf = (id: string | null) => (id ? goals.find((g) => g.id === id) : undefined);
  const changes = draft.changes.length > 0;

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
          {open && day.allDay.length > 0 && (
            <ul aria-label="All day" className="mb-2 ml-11 flex flex-wrap gap-1">
              {day.allDay.map((title, i) => (
                <li key={i} className="max-w-full truncate rounded-md border border-line bg-raised px-1.5 py-0.5 text-[10px] font-medium text-ink-3">
                  {title}
                </li>
              ))}
            </ul>
          )}
          <div className={open ? "" : "opacity-60"}>
            <DayColumn day={day} goals={goals} open={open} />
          </div>
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
          <ul className="sr-only">
            {day.proposals.map((block, i) => {
              const goal = goalOf(block.goalId);
              const todos = block.todos ? `, ${block.todos.length} to-dos` : "";
              return <li key={`p${i}`}>{`${block.title}, ${spokenTime(block, timeFormat)}${goal ? `, goal ${goal.title}` : ""}${todos}`}</li>;
            })}
            {day.moved.map((block, i) => (
              <li key={`m${i}`}>{`${block.title}, moved to ${spokenTime(block, timeFormat)}, ${movedFrom(block, day.date, timeFormat).replace("Moved", "moved")}`}</li>
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
          <Button size="sm" disabled={busy} onClick={() => void act("accept")}>
            {changes ? "Apply changes" : "Add to calendar"}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act("reject")}>
            Discard
          </Button>
          <span className="text-xs text-ink-3">Or tell me what to change.</span>
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
