"use client";

// "Before you start" on the Focus page (spec 48): three things to do before a session, each with
// one sentence from a study and the way to its article. The ticks live in the page only and are
// gone after a reload; the first step typed here stays in this browser tab (src/lib/client/first-step.ts).
// Nothing of this list is sent to the server.
import Link from "next/link";
import { Check } from "lucide-react";
import { FIRST_STEP_MAX, saveFirstStep, useFirstStep } from "@/lib/client/first-step";
import { START_STEPS } from "@/lib/library/before-you-start";
import { articleHref } from "@/lib/library/href";
import { STUDIES } from "@/lib/library/studies";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30";

/** "Stothart, Mitchum, Yehnert, 2015 · Lab experiment" under a step. */
function sourceLine(studyId: string): string {
  const study = STUDIES.find((each) => each.id === studyId);
  return study ? `${study.authors}, ${study.year} · ${study.kind}` : "";
}

export function BeforeYouStart() {
  const firstStep = useFirstStep();
  return (
    <section aria-labelledby="before-title" className="rounded-card border border-line-subtle bg-surface p-5">
      <h2 id="before-title" className="text-[15px] font-semibold text-ink">
        Before you start
      </h2>
      <p className="mt-1 text-sm text-ink-2">Three small things. Each has a study behind it.</p>
      <ol className="mt-4 flex flex-col">
        {START_STEPS.map((step) => {
          const id = `start-step-${step.id}`;
          return (
            <li key={step.id} className="start-step group flex gap-3 border-t border-line-subtle py-4 first:border-t-0 first:pt-0 last:pb-0">
              <input id={id} type="checkbox" className="peer sr-only" />
              {/* The round box; the step's title is the checkbox's name. */}
              <label
                htmlFor={id}
                aria-hidden="true"
                className="mt-px flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line bg-surface transition-colors peer-checked:border-ink peer-checked:bg-ink peer-focus-visible:ring-2 peer-focus-visible:ring-ink/30 peer-focus-visible:ring-offset-2 hover:border-ink-3"
              >
                <Check className="start-tick size-3.5 text-white opacity-0 group-has-[:checked]:opacity-100" strokeWidth={3} />
              </label>
              <div className="min-w-0 flex-1">
                <label htmlFor={id} className="cursor-pointer text-sm leading-6 font-semibold text-ink group-has-[:checked]:text-ink-2 group-has-[:checked]:line-through">
                  {step.title}
                </label>
                <p className="mt-0.5 text-sm leading-5 text-ink-2">{step.text}</p>
                {step.field && (
                  <input
                    type="text"
                    aria-label={step.field.label}
                    placeholder={step.field.placeholder}
                    maxLength={FIRST_STEP_MAX}
                    value={firstStep}
                    onChange={(event) => saveFirstStep(event.target.value)}
                    autoComplete="off"
                    className={`mt-2.5 h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 ${focusRing}`}
                  />
                )}
                <p className="mt-2 text-xs leading-4 text-ink-3">
                  {sourceLine(step.study)} ·{" "}
                  <Link href={articleHref(step.slug)} className={`rounded font-semibold text-ink-2 underline decoration-line underline-offset-2 hover:text-ink hover:decoration-ink ${focusRing}`}>
                    Read the article
                  </Link>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
