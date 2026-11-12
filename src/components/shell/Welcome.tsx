"use client";

// The welcome dialog of a new account (spec 13), taken over from the first prototype: three steps with
// progress dots, a bottom sheet on phones and a centred card on wider screens over a dimmed, blurred
// page. The last step's choice is sent to the server: "Explore the demo" (load_demo) or "Start fresh"
// (start_fresh); both mark the welcome as answered, so it is shown once per account. Escape closes it
// for this visit only. A native <dialog>: focus stays inside and returns afterwards.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FormMessage } from "@/components/account/FormMessage";
import { useAnnounce } from "@/components/calendar/Announcer";
import { APP_NAME } from "@/lib/app-name";
import { postJson, type PostResult } from "@/lib/client/post-json";
import type { TimeFormat } from "@/lib/time/display";
import { StepHow, StepStart, StepWelcome, type StartMode } from "./WelcomeSteps";

type Step = 1 | 2 | 3;
const STEPS: Step[] = [1, 2, 3];

/** The app's mark, as in the sidebar. */
function LogoMark() {
  return (
    <span className="relative flex size-7 items-center justify-center rounded-[9px] bg-ink">
      <span className="size-2.5 rounded-full bg-white" />
      <span className="absolute size-[18px] rounded-full border border-white/35" />
    </span>
  );
}

export function Welcome({
  timeFormat: savedFormat,
  defaultStep = 1,
}: {
  /** The saved time format, for the quick setup. */
  timeFormat: TimeFormat;
  /** The step to open on (previews only). */
  defaultStep?: Step;
}) {
  const router = useRouter();
  const announce = useAnnounce();
  const dialog = useRef<HTMLDialogElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState<Step>(defaultStep);
  // Only after moving on does the focus go to the step's heading; on opening it stays on the button.
  const [moved, setMoved] = useState(false);
  // The choice stays when going back and forth between the steps.
  const [mode, setMode] = useState<StartMode>("demo");
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(savedFormat);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<PostResult | null>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      primaryRef.current?.focus();
    }
    if (!open && element.open) element.close();
  }, [open]);

  const goTo = (next: Step) => {
    setStep(next);
    setMoved(true);
  };

  async function changeTimeFormat(format: TimeFormat) {
    setTimeFormat(format);
    const answer = await postJson("/api/settings", { timeFormat: format });
    if (!answer.ok) {
      setFailure(answer);
      setTimeFormat(savedFormat);
    }
  }

  async function finish() {
    setBusy(true);
    setFailure(null);
    const answer = await postJson(mode === "demo" ? "/api/demo/load" : "/api/welcome/start-fresh", {});
    setBusy(false);
    if (!answer.ok) {
      setFailure(answer);
      return;
    }
    announce(answer.message);
    setOpen(false);
    router.refresh();
  }

  if (!open) return null;

  return (
    <dialog
      ref={dialog}
      aria-label={`Welcome to ${APP_NAME}`}
      onClose={() => setOpen(false)}
      className="welcome m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-panel bg-surface px-6 pt-6 pb-[max(20px,env(safe-area-inset-bottom))] text-ink shadow-pop md:m-auto md:max-w-[560px] md:rounded-panel md:p-8"
    >
      <div className="flex items-center justify-between" aria-hidden="true">
        <LogoMark />
        <div className="flex items-center gap-1.5">
          {STEPS.map((n) => (
            <span key={n} className={`size-1.5 rounded-full transition-colors ${n === step ? "bg-ink" : "bg-muted"}`} />
          ))}
        </div>
      </div>
      <span className="sr-only">
        Step {step} of {STEPS.length}
      </span>

      <div className="mt-5">
        {step === 1 && <StepWelcome focusOnMount={moved} primaryRef={primaryRef} onNext={() => goTo(2)} onSkip={() => goTo(3)} />}
        {step === 2 && <StepHow focusOnMount={moved} onBack={() => goTo(1)} onNext={() => goTo(3)} />}
        {step === 3 && (
          <StepStart
            focusOnMount={moved}
            mode={mode}
            onMode={setMode}
            timeFormat={timeFormat}
            onTimeFormat={changeTimeFormat}
            busy={busy}
            onBack={() => goTo(2)}
            onFinish={finish}
          />
        )}
        {failure && <FormMessage tone="error" text={failure.message} />}
      </div>
    </dialog>
  );
}
