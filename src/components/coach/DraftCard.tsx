"use client";

// A draft of the coach (spec 19), drawn as its day or days in the calendar's style: per day a heading
// with a status pill, the all-day events as chips, and a small day column with hour lines, the
// proposals as blocks in their goal's colour and, for the open draft, the calendar's own events pale
// and outlined beneath them. The column is decoration; the same proposals are a list for screen
// readers. An open draft has "Add to calendar" (accept_draft) and "Discard" (reject_draft); the server
// decides both, and a refusal shows its sentence here. Geometry: src/lib/chat/day-sketch.ts.
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

const PILL: Record<DraftStatus, { label: string; className: string }> = {
  open: { label: "Draft", className: "bg-ink text-white" },
  accepted: { label: "Added", className: "bg-success-soft text-success" },
  rejected: { label: "Discarded", className: "bg-raised text-ink-3" },
  replaced: { label: "Replaced", className: "bg-raised text-ink-3" },
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
        {day.proposals.map((block, i) => {
          const { top, height: h } = sketchBox(block, day);
          const goal = goalOf(block.goalId);
          const Icon = goal ? GOAL_ICONS[goal.look.icon] : null;
          return (
            <div
              key={`p${i}`}
              className={`absolute left-1 right-6 z-[2] overflow-hidden rounded-lg border px-1.5 py-0.5 shadow-float ${goal ? goalColor(goal.look.color).block : NEUTRAL_BLOCK}`}
              style={{ top, height: h }}
            >
              <span className="flex items-center gap-1 text-[11px] font-medium leading-[14px]">
                {Icon && <Icon className="size-3 shrink-0" />}
                <span className="truncate">{block.title}</span>
              </span>
              {h >= 34 && <span className="block truncate text-[10px] leading-[13px] tabular opacity-80">{timeText(block, timeFormat)}</span>}
            </div>
          );
        })}
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
  const days = sketchDraft(draft.events, open ? calendar : [], timeZone);
  const pill = PILL[draft.status];
  const goalOf = (id: string | null) => (id ? goals.find((g) => g.id === id) : undefined);

  async function act(kind: "accept" | "reject") {
    setBusy(true);
    setRefusal("");
    const answer = await postJson(`/api/chat/drafts/${draft.id}/${kind}`, {});
    setBusy(false);
    if (!answer.ok) {
      setRefusal(answer.message);
      // Not open any more, or out of date: read the page again to show the draft as it is now.
      if (answer.status === 409) router.refresh();
      return;
    }
    onStatus(draft.id, kind === "accept" ? "accepted" : "rejected");
    announce(answer.message);
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
          <ul className="sr-only">
            {day.proposals.map((block, i) => {
              const goal = goalOf(block.goalId);
              return <li key={i}>{`${block.title}, ${spokenTime(block, timeFormat)}${goal ? `, goal ${goal.title}` : ""}`}</li>;
            })}
          </ul>
        </section>
      ))}
      {open && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line-subtle bg-raised/50 p-3">
          <Button size="sm" disabled={busy} onClick={() => void act("accept")}>
            Add to calendar
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
