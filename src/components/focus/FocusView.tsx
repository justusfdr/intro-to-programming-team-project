"use client";

// The Focus page in the prototype's look: start a session (a suggested length or any custom length
// from 1 minute to 23 h 59 min on a wheel, R12, optionally for an event), the running session with its ring and time
// left, the rating after it ended, and recent
// sessions. It only sends the user's choices and shows the server's answers; the server decides
// every state change (spec 04), including the end of a session at its planned length (R13).
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { FormMessage } from "@/components/account/FormMessage";
import { useAnnounce } from "@/components/calendar/Announcer";
import { Button } from "@/components/ui/Button";
import { Pause, Play } from "lucide-react";
import { postJson, type PostResult } from "@/lib/client/post-json";
import {
  clockText,
  isSessionLength,
  minutesText,
  secondsLeft,
  SUGGESTED_LENGTHS,
  type SessionTimes,
} from "@/lib/focus/session-time";
import { MESSAGES } from "@/lib/messages";
import type { FocusData, SessionDto } from "@/lib/focus/types";
import type { BlockerData } from "@/lib/blocker/types";
import { useDisplay } from "@/components/shell/DisplayProvider";
import { fmtDateShort } from "@/lib/time/display";
import { localDateOf } from "@/lib/time/zoned";
import { GOAL_ICONS, GoalTile } from "@/components/goals/GoalTile";
import { goalColor } from "@/lib/goals/colors";
import { BlockerChip } from "./BlockerChip";
import { FocusRing } from "./FocusRing";
import { ROW, SIDE, WheelColumn } from "@/components/calendar/TimeWheel";
import { HOURS, MINUTES, withHour, withMinute } from "@/lib/time/wheel";

const eyebrow = "text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3";
const card = "rounded-card border border-line-subtle bg-surface p-5";

function timesOf(session: SessionDto): SessionTimes {
  return {
    status: session.status,
    plannedMinutes: session.plannedMinutes,
    startedAt: new Date(session.startedAt),
    pausedAt: session.pausedAt ? new Date(session.pausedAt) : null,
    pausedSeconds: session.pausedSeconds,
    endedAt: session.endedAt ? new Date(session.endedAt) : null,
  };
}

/**
 * What the page does after a session action was rejected. Most rejections leave the page as it is
 * and show the message under the buttons. When the session is already over, gone or in another state
 * (it finished by itself, or another tab or device started, paused or ended it), the page reloads to show the real state; the card with the
 * message disappears then, so the message is announced through the page's status region instead.
 */
export function afterRejection(answer: PostResult): { reload: boolean } {
  const error = (answer.data as { error?: unknown } | undefined)?.error;
  // "session_running" and "not_possible" mean another tab or device already changed the session.
  return { reload: RELOAD_ERRORS.includes(error as string) };
}

const RELOAD_ERRORS = ["session_ended", "not_found", "session_running", "not_possible"];

/** True while a session shows as running with nothing left, so the page must keep asking the server. */
export function waitingForEnd(left: number, paused: boolean): boolean {
  return left === 0 && !paused;
}

/** Sends one session action; announces the message and reloads the page's data on success. */
function useSessionAction() {
  const router = useRouter();
  const announce = useAnnounce();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<PostResult | null>(null);

  async function run(path: string, body: unknown = {}) {
    setBusy(true);
    const answer = await postJson(path, body);
    setBusy(false);
    if (answer.ok) {
      setFailure(null);
      if (answer.message) announce(answer.message);
      router.refresh();
    } else if (afterRejection(answer).reload) {
      setFailure(null);
      announce(answer.message);
      router.refresh();
    } else {
      setFailure(answer);
    }
    return answer;
  }
  return { run, busy, failure };
}

type FocusGoal = FocusData["goals"][number];

/** The goal line above a session's title, as in the prototype: the goal's tile and name, or "No goal". */
function GoalLine({ goal }: { goal: FocusGoal | null }) {
  return (
    <div className="flex max-w-full items-center gap-2 text-xs text-ink-2">
      <GoalTile look={goal?.look ?? null} size="xs" />
      <span className="truncate">{goal?.title ?? "No goal"}</span>
    </div>
  );
}

const isSuggested = (minutes: number) => (SUGGESTED_LENGTHS as readonly number[]).includes(minutes);

/**
 * The custom length as in the Clock app's timer: a column of hours (0 to 23) and a column of minutes
 * (0 to 59), slid with a finger, the trackpad or the arrow keys. 0 hours 0 min is not a length (R12).
 */
function LengthWheel({
  value,
  onChange,
  describedBy,
}: {
  value: number;
  /** Takes a change of the length so far, so hours and minutes slid at the same time both count. */
  onChange: (change: (minutes: number) => number) => void;
  describedBy: string;
}) {
  return (
    <div
      role="group"
      aria-label="Custom length"
      aria-describedby={describedBy}
      className="relative mx-auto flex w-fit items-center justify-center gap-6 select-none"
    >
      {/* The band behind the chosen row, as on the calendar's time wheel. */}
      <div aria-hidden className="pointer-events-none absolute -inset-x-4 rounded-lg bg-raised" style={{ top: SIDE, height: ROW }} />
      <div className="relative flex items-center gap-1.5">
        <WheelColumn label="Hours" items={HOURS} selected={Math.floor(value / 60)} onPick={(h) => onChange((now) => withHour(now, h))} format={String} />
        <span aria-hidden className="w-12 text-sm font-medium text-ink">
          hours
        </span>
      </div>
      <div className="relative flex items-center gap-1.5">
        <WheelColumn label="Minutes" items={MINUTES} selected={value % 60} onPick={(m) => onChange((now) => withMinute(now, m))} format={String} />
        <span aria-hidden className="w-12 text-sm font-medium text-ink">
          min
        </span>
      </div>
    </div>
  );
}

function StartCard({ forEvent, goal }: { forEvent: FocusData["forEvent"]; goal: FocusGoal | null }) {
  const initial = forEvent?.suggestedMinutes ?? 60;
  // A suggested length is one of the chips; any other length starts on the custom wheel (R12).
  const [chosen, setChosen] = useState<number | "custom">(isSuggested(initial) ? initial : "custom");
  const [customMinutes, setCustomMinutes] = useState(initial);
  const hintId = useId();
  const { run, busy, failure } = useSessionAction();

  const minutes = chosen === "custom" ? customMinutes : chosen;
  const valid = isSessionLength(minutes);

  return (
    <section aria-labelledby="start-title" className={card}>
      {forEvent && (
        <div className="mb-1.5">
          <GoalLine goal={goal} />
        </div>
      )}
      <h2 id="start-title" className="text-[15px] font-semibold text-ink">
        {forEvent ? forEvent.title : "Quick session"}
      </h2>
      <p className="mt-1 text-sm text-ink-2">
        {forEvent ? "Focus on this event." : "Focus without an event, or open an event in the calendar and choose Start focus."}
      </p>
      <fieldset className="mt-5">
        <legend className={`${eyebrow} mb-2`}>Length</legend>
        <div className="inline-flex w-fit max-w-full flex-wrap rounded-full bg-raised p-1">
          {[...SUGGESTED_LENGTHS, "custom" as const].map((length) => (
            <label
              key={length}
              className={`flex h-8 cursor-pointer items-center rounded-full px-3.5 text-sm tabular transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink/30 ${
                chosen === length ? "bg-surface font-semibold text-ink shadow-sm" : "text-ink-2 hover:text-ink"
              }`}
            >
              <input
                type="radio"
                name="length"
                value={length}
                checked={chosen === length}
                onChange={() => {
                  // Custom opens on the length chosen so far, so the wheel starts somewhere sensible.
                  if (length === "custom" && chosen !== "custom") setCustomMinutes(chosen);
                  setChosen(length);
                }}
                className="sr-only"
              />
              {length === "custom" ? "Custom" : minutesText(length)}
            </label>
          ))}
        </div>
        {chosen === "custom" && (
          <div className="mt-5 flex flex-col items-center gap-3">
            <LengthWheel value={customMinutes} onChange={setCustomMinutes} describedBy={hintId} />
            {/* Only 0 hours 0 min can be wrong on the wheel; then the rule shows and Start stays off. */}
            <p id={hintId} role={valid ? undefined : "alert"} className={`text-sm ${valid ? "sr-only" : "text-danger"}`}>
              {valid ? minutesText(customMinutes) : MESSAGES.chooseLength}
            </p>
          </div>
        )}
      </fieldset>
      {failure && <FormMessage tone="error" text={failure.message} />}
      <Button
        size="lg"
        className="mt-6 w-full"
        disabled={busy || !valid}
        onClick={() => run("/api/sessions", { minutes, eventId: forEvent?.id ?? null })}
      >
        <Play className="size-4" />
        {busy ? "Starting…" : "Start focus"}
      </Button>
    </section>
  );
}

function GoalSymbol({ goal }: { goal: FocusGoal }) {
  const Icon = GOAL_ICONS[goal.look.icon];
  return <Icon className={`mb-2 size-6 ${goalColor(goal.look.color).text}`} strokeWidth={1.8} aria-hidden="true" />;
}

function RunningCard({ session, serverNow, goal }: { session: SessionDto; serverNow: string; goal: FocusGoal | null }) {
  const router = useRouter();
  const times = timesOf(session);
  const [now, setNow] = useState(() => new Date(serverNow));
  // A fresh server time (after Resume, say) replaces the running count at once, not a second later.
  const [seenServerNow, setSeenServerNow] = useState(serverNow);
  if (seenServerNow !== serverNow) {
    setSeenServerNow(serverNow);
    setNow(new Date(serverNow));
  }
  const [confirmCancel, setConfirmCancel] = useState(false);
  const { run, busy, failure } = useSessionAction();
  const paused = session.status === "paused";

  // Count on from the server's time at load, so a wrong clock on this computer does not matter.
  useEffect(() => {
    if (paused) return;
    const loadedAt = Date.now();
    const base = new Date(serverNow).getTime();
    const id = window.setInterval(() => setNow(new Date(base + Date.now() - loadedAt)), 1000);
    return () => window.clearInterval(id);
  }, [paused, serverNow]);

  const left = secondsLeft(times, now);
  // At the planned length the server finishes the session (R13); reload to show the end. If that
  // failed (the network was down after the laptop slept), try again every 5 seconds and when the
  // page becomes visible or the network returns, for as long as the session still shows as running.
  const stuck = waitingForEnd(left, paused);
  useEffect(() => {
    if (!stuck) return;
    const refresh = () => router.refresh();
    refresh();
    const id = window.setInterval(refresh, 5000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refresh);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refresh);
    };
  }, [stuck, router]);

  const base = `/api/sessions/${session.id}`;
  return (
    <section aria-labelledby="running-title" className={`${card} flex flex-col items-center`}>
      {session.eventId && (
        <div className="mb-1.5 self-start">
          <GoalLine goal={goal} />
        </div>
      )}
      <h2 id="running-title" className="self-start text-[15px] font-semibold text-ink">
        {session.eventTitle ?? "Focus session"}
      </h2>
      <p className="self-start text-sm text-ink-2">{minutesText(session.plannedMinutes)} planned</p>
      <FocusRing
        progress={1 - left / (session.plannedMinutes * 60)}
        className="mt-4 size-56"
        strokeClass={goal ? goalColor(goal.look.color).stroke : undefined}
      >
        <div className="flex flex-col items-center text-center">
          {/* The goal's icon in its colour above the time, as in the prototype. */}
          {goal && <GoalSymbol goal={goal} />}
          <p className="text-4xl font-semibold tracking-display tabular text-ink" role="timer" aria-label={`${clockText(left)} left`}>
            {clockText(left)}
          </p>
          <p className="mt-1 text-xs font-medium text-ink-2">{paused ? "Paused" : "left"}</p>
        </div>
      </FocusRing>
      {failure && <FormMessage tone="error" text={failure.message} />}
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {confirmCancel ? (
          <>
            <p className="w-full text-center text-sm font-medium">Cancel this session? Nothing will be saved.</p>
            <Button variant="danger" size="sm" disabled={busy} onClick={() => run(`${base}/cancel`)} autoFocus>
              Yes, cancel
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmCancel(false)}>
              Keep going
            </Button>
          </>
        ) : (
          <>
            {paused ? (
              <Button disabled={busy} onClick={() => run(`${base}/resume`)}>
                <Play className="size-4" />
                Resume
              </Button>
            ) : (
              <Button variant="secondary" disabled={busy} onClick={() => run(`${base}/pause`)}>
                <Pause className="size-4" />
                Pause
              </Button>
            )}
            <Button variant={paused ? "secondary" : "primary"} disabled={busy} onClick={() => run(`${base}/end`)}>
              End session
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirmCancel(true)}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

/** "How did it go?" for the last finished session (R14: optional; 0 is a real rating). */
function RatingCard({ session }: { session: SessionDto & { focusedMinutes: number } }) {
  const { run, busy, failure } = useSessionAction();
  return (
    <section aria-labelledby="rating-title" className={card}>
      <h2 id="rating-title" className="text-[15px] font-semibold text-ink">
        How did it go?
      </h2>
      <p className="mt-1 text-sm text-ink-2">
        {session.eventTitle ?? "Focus session"} · {minutesText(session.focusedMinutes)} focused. Rating is optional.
      </p>
      <div role="group" aria-label="Rating from 0 to 5" className="mt-4 flex gap-2">
        {[0, 1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            disabled={busy}
            aria-pressed={session.rating === value}
            onClick={() => run(`/api/sessions/${session.id}/rate`, { rating: value })}
            className={`flex size-9 items-center justify-center rounded-full border text-sm font-semibold tabular transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 ${
              session.rating === value ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink hover:bg-raised"
            }`}
          >
            {value}
          </button>
        ))}
      </div>
      {failure && <FormMessage tone="error" text={failure.message} />}
    </section>
  );
}

function RecentSessions({ sessions, timeZone }: { sessions: FocusData["recent"]; timeZone: string }) {
  const date = (iso: string) => fmtDateShort(localDateOf(new Date(iso), timeZone));
  return (
    <section aria-labelledby="recent-title" className="mt-10">
      <h2 id="recent-title" className={eyebrow}>
        Recent sessions
      </h2>
      {sessions.length === 0 ? (
        <p className="mt-3 text-sm text-ink-2">No finished sessions yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line-subtle overflow-hidden rounded-card border border-line-subtle bg-surface">
          {sessions.map((s) => (
            // Phones: the date on its own line, so the title keeps its room.
            <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-0.5 px-4 py-3 text-sm">
              <span className="w-full text-xs text-ink-3 sm:w-24 sm:shrink-0">{date(s.startedAt)}</span>
              <span className="min-w-0 flex-1 truncate text-ink">{s.eventTitle ?? "Focus session"}</span>
              <span className="shrink-0 tabular text-ink-2">{minutesText(s.focusedMinutes)}</span>
              <span className="shrink-0 text-xs text-ink-2 sm:w-20 sm:text-right">{s.rating === null ? "Not rated" : `Rated ${s.rating} of 5`}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function FocusView({ data, blocker }: { data: FocusData; blocker: BlockerData }) {
  const { timeFormat } = useDisplay();
  const goalById = (id: string | null) => (id ? (data.goals.find((goal) => goal.id === id) ?? null) : null);
  // The rating card appears for the newest finished session if it ended in the last 12 hours.
  const latest = data.recent[0];
  const rateLatest =
    !data.active && latest && latest.endedAt && new Date(data.now).getTime() - new Date(latest.endedAt).getTime() < 12 * 3_600_000;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-6 md:px-8 md:py-10">
      <h1 className="text-[28px] leading-[34px] font-semibold tracking-display text-ink md:text-[32px] md:leading-[38px]">Focus</h1>
      <p className="mt-1 text-sm text-ink-2">Start a session from your plan, or just start.</p>
      {/* The blocker's status; the block list and the extension are in Settings. */}
      <div className="mt-4">
        <BlockerChip data={blocker} format={timeFormat} />
      </div>
      <div className="mt-6 flex max-w-xl flex-col gap-6">
        {data.active ? (
          <RunningCard session={data.active} serverNow={data.now} goal={goalById(data.active.eventGoalId)} />
        ) : (
          <StartCard forEvent={data.forEvent} goal={goalById(data.forEventGoalId)} />
        )}
        {rateLatest && <RatingCard session={latest} />}
      </div>
      <RecentSessions sessions={data.recent} timeZone={blocker.timeZone} />
    </div>
  );
}
