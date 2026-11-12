"use client";

// The Focus page in the prototype's look: start a session (length 15 to 120 minutes, optionally for
// an event), the running session with its ring and time left, the rating after it ended, and recent
// sessions. It only sends the user's choices and shows the server's answers; the server decides
// every state change (spec 04), including the end of a session at its planned length (R13).
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FormMessage } from "@/components/account/FormMessage";
import { useAnnounce } from "@/components/calendar/Announcer";
import { Button } from "@/components/ui/Button";
import { Pause, Play } from "@/components/ui/icons";
import { postJson, type PostResult } from "@/lib/client/post-json";
import { clockText, minutesText, secondsLeft, SESSION_LENGTHS, type SessionTimes } from "@/lib/focus/session-time";
import type { FocusData, SessionDto } from "@/lib/focus/types";
import { FocusRing } from "./FocusRing";

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
 * and show the message under the buttons. When the session is already over or gone (it finished by
 * itself, or another device ended it), the page reloads to show the real state; the card with the
 * message disappears then, so the message is announced through the page's status region instead.
 */
export function afterRejection(answer: PostResult): { reload: boolean } {
  const error = (answer.data as { error?: unknown } | undefined)?.error;
  return { reload: error === "session_ended" || error === "not_found" };
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

function StartCard({ forEvent }: { forEvent: FocusData["forEvent"] }) {
  const [minutes, setMinutes] = useState<number>(forEvent?.suggestedMinutes ?? 60);
  const { run, busy, failure } = useSessionAction();

  return (
    <section aria-labelledby="start-title" className={card}>
      <h2 id="start-title" className="text-[15px] font-semibold text-ink">
        {forEvent ? forEvent.title : "Quick session"}
      </h2>
      <p className="mt-1 text-sm text-ink-2">
        {forEvent ? "Focus on this event." : "Focus without an event, or open an event in the calendar and choose Start focus."}
      </p>
      <fieldset className="mt-5">
        <legend className={`${eyebrow} mb-2`}>Length</legend>
        <div className="inline-flex w-fit max-w-full flex-wrap rounded-full bg-raised p-1">
          {SESSION_LENGTHS.map((length) => (
            <label
              key={length}
              className={`flex h-8 cursor-pointer items-center rounded-full px-3.5 text-sm tabular transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink/30 ${
                minutes === length ? "bg-surface font-semibold text-ink shadow-sm" : "text-ink-2 hover:text-ink"
              }`}
            >
              <input
                type="radio"
                name="length"
                value={length}
                checked={minutes === length}
                onChange={() => setMinutes(length)}
                className="sr-only"
              />
              {minutesText(length)}
            </label>
          ))}
        </div>
      </fieldset>
      {failure && <FormMessage tone="error" text={failure.message} />}
      <Button size="lg" className="mt-6 w-full" disabled={busy} onClick={() => run("/api/sessions", { minutes, eventId: forEvent?.id ?? null })}>
        <Play className="size-4" />
        {busy ? "Starting…" : "Start focus"}
      </Button>
    </section>
  );
}

function RunningCard({ session, serverNow }: { session: SessionDto; serverNow: string }) {
  const router = useRouter();
  const times = timesOf(session);
  const [now, setNow] = useState(() => new Date(serverNow));
  const [confirmCancel, setConfirmCancel] = useState(false);
  const refreshed = useRef(false);
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
  // At the planned length the server finishes the session (R13); reload once to show the end.
  useEffect(() => {
    if (left === 0 && !paused && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [left, paused, router]);

  const base = `/api/sessions/${session.id}`;
  return (
    <section aria-labelledby="running-title" className={`${card} flex flex-col items-center`}>
      <h2 id="running-title" className="self-start text-[15px] font-semibold text-ink">
        {session.eventTitle ?? "Focus session"}
      </h2>
      <p className="self-start text-sm text-ink-2">{minutesText(session.plannedMinutes)} planned</p>
      <FocusRing progress={1 - left / (session.plannedMinutes * 60)} className="mt-4 size-56">
        <div className="text-center">
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

function RecentSessions({ sessions }: { sessions: FocusData["recent"] }) {
  const date = (iso: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
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

export function FocusView({ data }: { data: FocusData }) {
  // The rating card appears for the newest finished session if it ended in the last 12 hours.
  const latest = data.recent[0];
  const rateLatest =
    !data.active && latest && latest.endedAt && new Date(data.now).getTime() - new Date(latest.endedAt).getTime() < 12 * 3_600_000;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-10 md:py-10">
      <h1 className="text-[28px] leading-[34px] font-semibold tracking-display text-ink md:text-[32px] md:leading-[38px]">Focus</h1>
      <p className="mt-1 text-sm text-ink-2">Start a session from your plan, or just start.</p>
      <div className="mt-8 grid items-start gap-6 md:grid-cols-2">
        {data.active ? <RunningCard session={data.active} serverNow={data.now} /> : <StartCard forEvent={data.forEvent} />}
        {rateLatest && <RatingCard session={latest} />}
      </div>
      <RecentSessions sessions={data.recent} />
    </div>
  );
}
