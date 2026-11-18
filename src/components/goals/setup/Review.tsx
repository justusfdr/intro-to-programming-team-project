"use client";

// The goal setup's review and the moment the goal is created (spec 42). The review shows the finished
// goal (the tile large, the name, the routine in one sentence), one line per answer with "Change", and
// what can still be tuned without going back: colour, icon, auto-block and "Why it matters".
// The celebration runs once: the tile lands, a ring expands and fades, small pieces fly out on fixed
// paths, then the heading and "Done" rise in. Every path is a fixed number per piece (never random),
// so the server and the browser draw the same thing.
import type { CSSProperties } from "react";
import { Button, LinkButton } from "@/components/ui/Button";
import { useDisplay } from "@/components/shell/DisplayProvider";
import { planGoalHref } from "@/lib/chat/plan-goal";
import { goalColor } from "@/lib/goals/colors";
import { answersSentence, categoryName, MAX_WHY, summaryLines, type SetupAnswers, type SetupStep } from "@/lib/goals/setup";
import { GOAL_COLOR_LABELS, GOAL_COLORS, GOAL_ICON_LABELS, GOAL_ICON_NAMES, type GoalColorName } from "@/lib/goals/style";
import { GOAL_ICONS, GoalTile } from "../GoalTile";
import { Hint, type QuestionProps } from "./Questions";
import { focusRing, stagger } from "./parts";
import { SetupTile } from "./Preview";

const labelClass = "text-xs font-medium text-ink-2";

export function Review({ answers, update, uid, onChange, hint }: QuestionProps & { onChange: (step: SetupStep) => void; hint: string | null }) {
  const { timeFormat } = useDisplay();
  const category = categoryName({ category: answers.category, categoryOther: answers.categoryOther.trim() || null });
  const look = { color: answers.color, icon: answers.icon };
  const lines = [{ step: "category" as const, label: "Name", text: category ? `${answers.title.trim()} · ${category}` : answers.title.trim() }, ...summaryLines(answers, timeFormat)];
  return (
    <div>
      <div className="flex flex-col items-center text-center">
        <SetupTile look={look} size="xl" />
        <div className="mt-3">
          <h2 id={`${uid}-title`} data-setup-heading tabIndex={-1} className="text-[22px] leading-tight font-semibold tracking-heading break-words text-ink outline-none md:text-[24px]">
            {answers.title.trim()}
          </h2>
        </div>
        <p className="mt-1.5 max-w-sm text-sm text-ink-2">{`${answersSentence(answers, timeFormat)}.`}</p>
      </div>

      <ul aria-label="Your answers" className="mt-5 divide-y divide-line-subtle rounded-card border border-line-subtle">
        {lines.map((line, i) => (
          <li key={line.label} className="setup-rise flex min-h-12 items-center gap-3 py-1 pr-1.5 pl-3.5" style={stagger(i)}>
            <span className="w-[4.5rem] shrink-0 text-xs text-ink-3">{line.label}</span>
            <span className="min-w-0 flex-1 text-sm break-words text-ink">{line.text}</span>
            <button
              type="button"
              aria-label={`Change ${line.label.toLowerCase()}`}
              onClick={() => onChange(line.step)}
              className={`min-h-11 shrink-0 rounded-full px-3 text-xs font-semibold text-ink-2 transition-colors hover:bg-raised hover:text-ink ${focusRing}`}
            >
              Change
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-col gap-5">
        <div role="group" aria-label="Color" className="flex flex-col gap-1.5">
          <span className={labelClass} aria-hidden>
            Color
          </span>
          <div className="grid w-fit grid-cols-5 gap-2.5 sm:flex sm:flex-wrap">
            {GOAL_COLORS.map((c) => {
              const on = answers.color === c;
              return (
                <button
                  key={c}
                  type="button"
                  aria-label={GOAL_COLOR_LABELS[c]}
                  aria-pressed={on}
                  onClick={() => update((a) => ({ ...a, color: c }))}
                  className={`size-9 rounded-full ${goalColor(c).dot} transition-transform active:scale-95 ${focusRing} ${on ? "ring-2 ring-ink ring-offset-2 ring-offset-surface" : ""}`}
                />
              );
            })}
          </div>
        </div>

        <div role="group" aria-label="Icon" className="flex flex-col gap-1.5">
          <span className={labelClass} aria-hidden>
            Icon
          </span>
          <div className="grid grid-cols-5 gap-2">
            {GOAL_ICON_NAMES.map((name) => {
              const Icon = GOAL_ICONS[name];
              const on = answers.icon === name;
              return (
                <button
                  key={name}
                  type="button"
                  aria-label={GOAL_ICON_LABELS[name]}
                  aria-pressed={on}
                  onClick={() => update((a) => ({ ...a, icon: name, iconTouched: true }))}
                  className={`flex h-11 items-center justify-center rounded-lg border transition-colors ${focusRing} ${
                    on ? "border-ink bg-raised text-ink" : "border-line-subtle text-ink-2 hover:bg-raised"
                  }`}
                >
                  <Icon className="size-4" strokeWidth={1.8} aria-hidden />
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-start justify-between gap-3 text-sm text-ink">
          <span>
            <label htmlFor={`${uid}-auto-block`} className="cursor-pointer">
              Block distracting websites during these sessions
            </label>
            <span id={`${uid}-auto-block-hint`} className="block text-xs text-ink-3">
              During this goal&apos;s events the Chrome extension blocks the sites on your list.
            </span>
          </span>
          <input
            id={`${uid}-auto-block`}
            type="checkbox"
            role="switch"
            aria-describedby={`${uid}-auto-block-hint`}
            checked={answers.autoBlock}
            onChange={(e) => update((a) => ({ ...a, autoBlock: e.target.checked }))}
            className="relative mt-0.5 h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full bg-line transition-colors checked:bg-ink before:absolute before:top-0.5 before:left-0.5 before:size-4 before:rounded-full before:bg-white before:shadow-sm before:transition-transform checked:before:translate-x-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-1"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-why`} className={labelClass}>
            Why it matters (optional)
          </label>
          <input
            id={`${uid}-why`}
            value={answers.why}
            maxLength={MAX_WHY}
            autoComplete="off"
            placeholder="One short sentence that keeps you going"
            onChange={(e) => update((a) => ({ ...a, why: e.target.value }))}
            className="block h-11 w-full min-w-0 rounded-lg border border-line bg-surface px-3 text-[15px] text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10"
          />
        </div>
      </div>
      {hint && <Hint>{hint}</Hint>}
    </div>
  );
}

// ---------- The celebration ----------

/** 16 pieces on fixed paths: evenly round the tile, at four distances, turning by fixed angles. */
const PIECES = Array.from({ length: 16 }, (_, i) => {
  const angle = ((i * 22.5 + (i % 2 ? 9 : 0)) * Math.PI) / 180;
  const distance = [66, 86, 74, 92][i % 4];
  return {
    x: Math.round(Math.cos(angle) * distance),
    y: Math.round(Math.sin(angle) * distance),
    turn: [140, -110, 220, -180][i % 4],
    shape: i % 3 === 0 ? "h-1.5 w-3 rounded-full" : i % 3 === 1 ? "size-2 rounded-[2px]" : "size-2 rounded-full",
  };
});

/** The goal's colour and three others from the ten, spread over the list. */
function burstColors(color: GoalColorName): string[] {
  const start = GOAL_COLORS.indexOf(color);
  return [0, 3, 5, 7].map((offset) => goalColor(GOAL_COLORS[(start + offset) % GOAL_COLORS.length]).dot);
}

/**
 * `goalId` (spec 43): the new goal's id, for "Let the coach plan it into my week"; without it (an
 * answer without an id) only "Done" shows.
 */
export function Celebration({ answers, onDone, goalId = null }: { answers: SetupAnswers; onDone: () => void; goalId?: string | null }) {
  const look = { color: answers.color, icon: answers.icon };
  const colors = burstColors(answers.color);
  return (
    <div className="flex flex-col items-center pt-2 pb-1 text-center">
      <div aria-hidden className="relative flex size-44 items-center justify-center">
        <span className={`setup-ring absolute size-16 rounded-full border-2 ${goalColor(answers.color).ring}`} />
        {PIECES.map((piece, i) => (
          <span
            key={i}
            className={`setup-piece absolute top-1/2 left-1/2 -mt-1 -ml-1 ${piece.shape} ${colors[i % colors.length]}`}
            style={{ "--x": `${piece.x}px`, "--y": `${piece.y}px`, "--r": `${piece.turn}deg` } as CSSProperties}
          />
        ))}
        <span className="setup-land inline-flex">
          <GoalTile look={look} size="xl" />
        </span>
      </div>
      <h2 data-setup-heading tabIndex={-1} className="setup-rise-late mt-1 text-[24px] leading-tight font-semibold tracking-heading break-words text-ink outline-none">
        {`${answers.title.trim()} is set`}
      </h2>
      <p className="setup-rise-late mt-2 max-w-sm text-sm text-ink-2">{`${answersSentence(answers)}.`}</p>
      <div className="setup-rise-late mt-7 flex w-full flex-col-reverse items-stretch gap-2 sm:w-auto sm:flex-row sm:justify-center">
        {/*
          Spec 43: the coach opens with "Plan "<title>" into my week." in the field; nothing is sent yet.
          Planning the new goal is the natural next step, so it is the main button (on the right, and on
          top on a phone); "Done" is the main one only when there is no id to plan with.
        */}
        <Button variant={goalId ? "secondary" : "primary"} size="lg" onClick={onDone}>
          Done
        </Button>
        {goalId && (
          <LinkButton href={planGoalHref(goalId)} size="lg">
            Let the coach plan it into my week
          </LinkButton>
        )}
      </div>
    </div>
  );
}
