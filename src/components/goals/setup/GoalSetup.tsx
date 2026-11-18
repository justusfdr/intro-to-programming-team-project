"use client";

// The guided setup of a new goal (spec 42): six short questions, a review and a celebration, in a
// native <dialog> like the welcome (a sheet from the bottom on phones, a centred card of 560 px on wider
// screens, the page behind dimmed and slightly blurred; focus stays inside and returns to "New goal").
// The frame is the same on every question: Back and Close, the progress, the goal taking shape, the
// question, and "Continue". Closing with something answered asks once: "Discard this goal?".
// "Create goal" sends one create_goal (the body is built in src/lib/goals/setup.ts); the server checks
// everything again and its message shows on the review when it refuses.
// Moving between questions: the old question leaves (a copy of it, inert, for 200 ms) while the new one
// comes in. The frame keeps its size from question to question: on a phone the sheet has one height; on
// wider screens the question area follows its content (measured, then animated in CSS) above a shared floor.
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ArrowLeft, X } from "lucide-react";
import { FormMessage } from "@/components/account/FormMessage";
import { useAnnounce } from "@/components/calendar/Announcer";
import { useDisplay } from "@/components/shell/DisplayProvider";
import { Button } from "@/components/ui/Button";
import { postJson } from "@/lib/client/post-json";
import type { Weekday } from "@/lib/goals/routine";
import {
  allGoalsHint,
  createGoalBody,
  daysProblem,
  emptyAnswers,
  firstProblemStep,
  hasAnswers,
  previewTags,
  questionNumber,
  SETUP_STEPS,
  stepProblem,
  toggleAvoidDay,
  toggleMustDay,
  customWindowProblem,
  type SetupAnswers,
  type SetupStep,
} from "@/lib/goals/setup";
import { nextGoalColor } from "@/lib/goals/style";
import type { GoalView } from "@/lib/goals/types";
import type { SavedPlace } from "@/lib/places/saved";
import type { LocalDate } from "@/lib/time/zoned";
import { focusRing, prefersReducedMotion } from "./parts";
import { FrameTint, GoalTakingShape, ProgressBar, SEGMENTS } from "./Preview";
import { QuestionCategory, QuestionDate, QuestionDays, QuestionOften, QuestionPlace, QuestionWhen, type DaysShake } from "./Questions";
import { Celebration, Review } from "./Review";

export type SetupScreen = SetupStep | "review" | "done";

type Direction = "forward" | "back";

type Props = {
  open: boolean;
  onClose: () => void;
  /** The saved goals: the next unused colour and the hint for all goals together. */
  goals: GoalView[];
  places: SavedPlace[];
  today: LocalDate;
  /** Previews and tests only: open on this screen with these answers. */
  initialScreen?: SetupScreen;
  initialAnswers?: Partial<SetupAnswers>;
};

/** How long a chosen time of day stays on screen before the next question comes. */
const AUTO_NEXT_MS = 420;

export function GoalSetup({ open, onClose, goals, places, today, initialScreen, initialAnswers }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  // The flow's way to close: it asks "Discard this goal?" first when something is answered.
  const requestClose = useRef<() => void>(() => {});

  // A layout effect: the dialog closes in the same frame its content goes, so no empty sheet flashes.
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      // The question, not the Close button, takes the focus first.
      element.querySelector<HTMLElement>("[data-setup-heading]")?.focus({ preventScroll: true });
    }
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="goal-setup-name"
      onClose={onClose}
      onCancel={(event) => {
        // Escape: through "Discard this goal?" (when the browser lets the page decide).
        event.preventDefault();
        requestClose.current();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        event.preventDefault();
        requestClose.current();
      }}
      onClick={(event) => event.target === dialog.current && requestClose.current()}
      className="goal-setup m-0 mt-auto h-[92dvh] max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-panel bg-surface p-0 text-ink shadow-pop md:m-auto md:h-[min(720px,calc(100dvh-3rem))] md:max-h-[min(720px,calc(100dvh-3rem))] md:max-w-[560px] md:rounded-panel"
    >
      <span id="goal-setup-name" className="sr-only">
        New goal
      </span>
      {open && (
        <SetupFlow
          onRegisterClose={(close) => {
            requestClose.current = close;
          }}
          onClose={onClose}
          goals={goals}
          places={places}
          today={today}
          initialScreen={initialScreen}
          initialAnswers={initialAnswers}
        />
      )}
    </dialog>
  );
}

/** How many segments of the progress are filled on a screen: the questions so far, all six after them. */
function filledOn(screen: SetupScreen): number {
  return screen === "review" || screen === "done" ? SEGMENTS : questionNumber(screen);
}

function isQuestion(screen: SetupScreen): screen is SetupStep {
  return (SETUP_STEPS as readonly string[]).includes(screen);
}

function SetupFlow({
  onRegisterClose,
  onClose,
  goals,
  places,
  today,
  initialScreen = "category",
  initialAnswers,
}: Omit<Props, "open"> & {
  /** Hands the frame the flow's way to close (it knows whether something is answered). */
  onRegisterClose: (close: () => void) => void;
}) {
  const router = useRouter();
  const announce = useAnnounce();
  const display = useDisplay();
  const [answers, setAnswers] = useState<SetupAnswers>(() => ({ ...emptyAnswers(nextGoalColor(goals.map((g) => g.look.color))), ...initialAnswers }));
  const [screen, setScreen] = useState<SetupScreen>(initialScreen);
  const [direction, setDirection] = useState<Direction>("forward");
  // The furthest question reached: its answers (and those before it) show in the goal taking shape.
  const [reached, setReached] = useState<SetupStep>(isQuestion(initialScreen) ? initialScreen : "date");
  // The copy of the question that is leaving, for its short exit.
  const [leaving, setLeaving] = useState<{ screen: SetupScreen; direction: Direction; round: number } | null>(null);
  const [fillFrom, setFillFrom] = useState(filledOn(initialScreen));
  // After "Change" on the review, Continue goes back to the review.
  const [returnToReview, setReturnToReview] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState("");
  /** Spec 43: the created goal's id, for the coach button on the success screen. */
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [live, setLive] = useState("");
  const [shake, setShake] = useState<DaysShake>({ row: "off", day: null, round: 0 });
  const [daysNote, setDaysNote] = useState<string | null>(null);
  // The focus moves to the question's heading only after the person moved (opening focuses it once).
  const [moved, setMoved] = useState(false);

  const enterRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const keepGoingRef = useRef<HTMLButtonElement>(null);
  const autoNext = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextRef = useRef<() => void>(() => {});
  const [height, setHeight] = useState<number | null>(null);
  // While the height moves, the area does not scroll (no scrollbar flashes for a moment).
  const [settling, setSettling] = useState(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = (change: (a: SetupAnswers) => SetupAnswers) => {
    setAnswers(change);
    setFailure(null);
  };

  /** Says something to screen readers; the same sentence twice is still said (a no-break space alternates). */
  const say = (text: string) => setLive((before) => (before === text ? `${text} ` : text));

  function goTo(target: SetupScreen, dir: Direction) {
    if (target === screen) return;
    if (autoNext.current) clearTimeout(autoNext.current);
    setLeaving(prefersReducedMotion() ? null : { screen, direction: dir, round: (leaving?.round ?? 0) + 1 });
    setDirection(dir);
    setFillFrom(filledOn(screen));
    setScreen(target);
    setMoved(true);
    setConfirming(false);
    if (isQuestion(target)) {
      if (SETUP_STEPS.indexOf(target) > SETUP_STEPS.indexOf(reached)) setReached(target);
      say(`Question ${questionNumber(target)} of ${SETUP_STEPS.length}`);
    } else if (target === "review") {
      setReached("date");
      say("Review your goal");
    }
  }

  const problem = isQuestion(screen) ? stepProblem(screen, answers, today) : null;
  // A custom length of 0:00 and an own time window that does not work do not block the button: their
  // red sentence comes when Continue is pressed.
  const softProblem =
    (screen === "often" && answers.sessionMinutes === 0) || (screen === "when" && answers.dayPart === "custom" && customWindowProblem(answers) !== null);
  // The answers Continue was pressed with: any change after that hides the sentence again.
  const [triedWith, setTriedWith] = useState<SetupAnswers | null>(null);
  const tried = softProblem && triedWith === answers;

  function next() {
    if (!isQuestion(screen)) return;
    if (softProblem) setTriedWith(answers);
    if (problem) return say(problem);
    if (returnToReview) {
      const open = firstProblemStep(answers, today);
      if (open === null) setReturnToReview(false);
      return goTo(open ?? "review", "forward");
    }
    const index = SETUP_STEPS.indexOf(screen);
    goTo(index === SETUP_STEPS.length - 1 ? "review" : SETUP_STEPS[index + 1], "forward");
  }

  function back() {
    if (screen === "review") return goTo("date", "back");
    if (!isQuestion(screen)) return;
    const index = SETUP_STEPS.indexOf(screen);
    if (index > 0) goTo(SETUP_STEPS[index - 1], "back");
  }

  /** "Change" on the review, or a tag of the goal taking shape. */
  function change(step: SetupStep) {
    if (screen === "review") setReturnToReview(true);
    const dir = isQuestion(screen) && SETUP_STEPS.indexOf(step) > SETUP_STEPS.indexOf(screen) ? "forward" : "back";
    goTo(step, dir);
  }

  function toggleDay(day: Weekday) {
    const result = toggleAvoidDay(answers, day);
    if (result.refused) {
      setShake((s) => ({ row: "off", day, round: s.round + 1 }));
      return say(result.refused);
    }
    setDaysNote(null);
    const before = daysProblem(answers);
    const after = daysProblem(result.answers);
    update(() => result.answers);
    if (after && after !== before) say(after);
    else if (!after && before) say("The days fit now.");
  }

  function toggleSureDay(day: Weekday) {
    const result = toggleMustDay(answers, day);
    if (result.refused) {
      setShake((s) => ({ row: "sure", day, round: s.round + 1 }));
      setDaysNote(result.refused);
      return say(result.refused);
    }
    setDaysNote(null);
    const before = daysProblem(answers);
    const after = daysProblem(result.answers);
    update(() => result.answers);
    if (after && after !== before) say(after);
    else if (!after && before) say("The days fit now.");
  }

  async function create() {
    if (busy) return;
    const open = firstProblemStep(answers, today);
    if (open) return goTo(open, "back");
    setBusy(true);
    setFailure(null);
    const answer = await postJson("/api/goals", createGoalBody(answers));
    setBusy(false);
    if (!answer.ok) {
      // R1: nothing was saved. The message stays on the review; nothing moves by itself.
      setFailure(answer.message);
      say(answer.message);
      return;
    }
    setSavedMessage(answer.message);
    const created = (answer.data as { goal?: { id?: unknown } } | undefined)?.goal?.id;
    setCreatedId(typeof created === "string" ? created : null);
    goTo("done", "forward");
    router.refresh();
  }

  function finish() {
    if (savedMessage) announce(savedMessage);
    onClose();
  }

  // Closing: straight away when nothing is answered or the goal is created, else ask once.
  const closeRequested = () => {
    if (confirming) return setConfirming(false);
    if (screen === "done") return finish();
    if (!hasAnswers(answers)) return onClose();
    setConfirming(true);
  };
  useEffect(() => {
    onRegisterClose(closeRequested);
  });

  useEffect(() => {
    nextRef.current = next;
  });

  useEffect(() => {
    if (confirming) keepGoingRef.current?.focus();
  }, [confirming]);

  // A new question: its heading takes the focus and the area scrolls to its top.
  useEffect(() => {
    if (!moved) return;
    viewportRef.current?.scrollTo({ top: 0 });
    enterRef.current?.querySelector<HTMLElement>("[data-setup-heading]")?.focus({ preventScroll: true });
  }, [screen, moved]);

  // The leaving copy goes when its animation ends, at the latest after a moment.
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setLeaving(null), 360);
    return () => clearTimeout(timer);
  }, [leaving]);

  // The height of the question area follows its content.
  useEffect(() => {
    const element = innerRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const timers = { settle: settleTimer, next: autoNext };
    let last = -1;
    const observer = new ResizeObserver(() => {
      // Only a real change of height counts. Hiding the scroll bar while the height glides changes the
      // width, which calls this again: reacting to that made the question shake on every pick of a wheel.
      const height = element.offsetHeight;
      if (height === last) return;
      last = height;
      setHeight(height);
      if (prefersReducedMotion()) return;
      setSettling(true);
      if (timers.settle.current) clearTimeout(timers.settle.current);
      timers.settle.current = setTimeout(() => setSettling(false), 320);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (timers.settle.current) clearTimeout(timers.settle.current);
      if (timers.next.current) clearTimeout(timers.next.current);
    };
  }, []);

  /** Q4: choosing a time of day moves on by itself after a short moment. */
  const chosenWhen = () => {
    if (autoNext.current) clearTimeout(autoNext.current);
    autoNext.current = setTimeout(() => nextRef.current(), AUTO_NEXT_MS);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Enter in a text field continues when Continue is possible (the address field handles its own Enter).
    const target = event.target as HTMLElement;
    if (event.key !== "Enter" || event.defaultPrevented || event.nativeEvent.isComposing) return;
    if (target.tagName !== "INPUT" || (target as HTMLInputElement).type !== "text") return;
    if (!isQuestion(screen)) return;
    event.preventDefault();
    if (!problem) next();
  };

  const categoryKnown = answers.category !== null;
  const look = categoryKnown ? { color: answers.color, icon: answers.icon } : null;
  const otherGoals = goals.map((goal) => ({ rules: goal.rules, routine: goal.routine }));

  const panel = (which: SetupScreen, uid: string) => {
    const common = { answers, update, uid };
    switch (which) {
      case "category":
        return <QuestionCategory {...common} />;
      case "often":
        return <QuestionOften {...common} showZero={tried} />;
      case "place":
        return <QuestionPlace {...common} places={places} today={today} />;
      case "when":
        return <QuestionWhen {...common} display={display} onChosen={chosenWhen} showWindowProblem={tried} />;
      case "days":
        return <QuestionDays {...common} onToggle={toggleDay} onToggleSure={toggleSureDay} shake={shake} note={daysNote} />;
      case "date":
        return <QuestionDate {...common} today={today} />;
      case "review":
        return <Review {...common} onChange={change} hint={allGoalsHint(answers, otherGoals)} />;
      case "done":
        return <Celebration answers={answers} onDone={finish} goalId={createdId} />;
    }
  };

  const number = isQuestion(screen) ? questionNumber(screen) : null;
  const nextIsReview = screen === "date" || (returnToReview && isQuestion(screen));

  return (
    <div className="relative flex h-full max-h-[inherit] flex-col">
      <FrameTint color={categoryKnown ? answers.color : null} />

      {/* Back, Close, the progress and the goal taking shape. */}
      <div className="relative shrink-0 px-5 pt-3 pb-2 md:px-7 md:pt-5">
        <div className="flex h-11 items-center justify-between">
          {screen !== "category" && screen !== "done" ? (
            <Button variant="ghost" className="-ml-3 h-11 px-3" onClick={back}>
              <ArrowLeft className="size-4" strokeWidth={2} aria-hidden />
              Back
            </Button>
          ) : (
            <span />
          )}
          <button
            type="button"
            aria-label="Close"
            onClick={closeRequested}
            className={`-mr-2.5 flex size-11 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-raised hover:text-ink ${focusRing}`}
          >
            <X className="size-[18px]" strokeWidth={1.8} aria-hidden />
          </button>
        </div>
        <div className="mt-1">
          <ProgressBar filled={filledOn(screen)} from={fillFrom} color={categoryKnown ? answers.color : null} />
        </div>
        {number !== null && <span className="sr-only">{`Question ${number} of ${SETUP_STEPS.length}`}</span>}
        {isQuestion(screen) && (
          <div className="mt-4">
            <GoalTakingShape look={look} title={answers.title} tags={previewTags(answers, reached, display.timeFormat)} onTag={change} />
          </div>
        )}
      </div>

      {/*
        The question area; the leaving copy lies over it for a moment. On a phone the sheet has one
        height and the area fills it, so Back, the progress and Continue never move. On wider screens
        the area follows its content's height (--setup-h, see globals.css), but never below a floor the
        six questions share, so the card keeps its size from question to question.
      */}
      <div
        ref={viewportRef}
        className={`setup-viewport scroll-thin relative flex min-h-0 flex-col overflow-x-hidden overscroll-contain [scrollbar-gutter:stable] ${settling ? "overflow-y-hidden" : "overflow-y-auto"}`}
        style={height === null ? undefined : ({ "--setup-h": `${height}px` } as CSSProperties)}
      >
        {/* The celebration sits in the middle of the area; a question starts at its top. */}
        <div ref={innerRef} className={`relative shrink-0 px-5 pt-4 pb-6 md:px-7 ${screen === "done" ? "my-auto" : ""}`} onKeyDown={onKeyDown}>
          <div key={screen} ref={enterRef} className={moved ? `setup-enter-${direction}` : ""}>
            {panel(screen, `setup-${screen}`)}
          </div>
          {leaving && (
            <div
              key={`leaving-${leaving.round}`}
              aria-hidden
              inert
              className={`setup-leave-${leaving.direction} pointer-events-none absolute inset-x-5 top-4 max-h-full overflow-hidden md:inset-x-7`}
              onAnimationEnd={(event) => event.target === event.currentTarget && setLeaving(null)}
            >
              {panel(leaving.screen, `leaving-${leaving.screen}`)}
            </div>
          )}
        </div>
      </div>

      {/* Continue, Review or Create goal; or the question before discarding. */}
      {screen !== "done" && (
        <div className="relative shrink-0 border-t border-line-subtle px-5 pt-3 pb-[max(14px,env(safe-area-inset-bottom))] md:px-7 md:pb-5">
          {failure && screen === "review" && <FormMessage tone="error" text={failure} />}
          {confirming ? (
            <div role="group" aria-labelledby="goal-setup-discard" className="setup-rise flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-1">
              <p id="goal-setup-discard" className="text-sm font-semibold text-ink">
                Discard this goal?
              </p>
              <div className="ml-auto flex gap-2">
                <Button ref={keepGoingRef} variant="secondary" size="lg" onClick={() => setConfirming(false)}>
                  Keep going
                </Button>
                <Button variant="danger" size="lg" onClick={onClose}>
                  Discard
                </Button>
              </div>
            </div>
          ) : (
            <div className={`flex items-center justify-between gap-3 ${failure && screen === "review" ? "mt-3" : ""}`}>
              <span />
              {screen === "review" ? (
                <Button size="lg" onClick={create} disabled={busy} aria-busy={busy}>
                  {busy ? "Creating…" : "Create goal"}
                </Button>
              ) : (
                <>
                  <span id="goal-setup-why-not" className="sr-only">
                    {problem ?? ""}
                  </span>
                  <Button size="lg" onClick={next} disabled={problem !== null && !softProblem} aria-describedby="goal-setup-why-not">
                    {nextIsReview ? "Review" : "Continue"}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <p aria-live="polite" className="sr-only">
        {live}
      </p>
    </div>
  );
}
