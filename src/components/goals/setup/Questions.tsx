"use client";

// The six questions of the goal setup (spec 42). Each shows the question as its heading, one helper
// line and the answer controls; the frame (GoalSetup.tsx) adds Back, Close, the progress, the goal taking
// shape and "Continue". The rules (what may be chosen, the sentences, the hints) are in
// src/lib/goals/setup.ts; the controls only offer what passes.
import { useEffect, useRef, useState } from "react";
import {
  Briefcase,
  CalendarCheck,
  Clock3,
  Dumbbell,
  GraduationCap,
  Heart,
  House,
  MapPin,
  MapPinned,
  Moon,
  Repeat,
  Shapes,
  SlidersHorizontal,
  Sun,
  Sunrise,
} from "lucide-react";
import { DateField, inputClass } from "@/components/calendar/fields";
import { AddressField } from "@/components/places/AddressField";
import { goalColor } from "@/lib/goals/colors";
import { GOAL_CATEGORIES, GOAL_CATEGORY_LABELS, MAX_CATEGORY_OTHER, WEEKDAYS, type DayPart, type GoalCategory, type Weekday } from "@/lib/goals/routine";
import {
  CATEGORY_LINES,
  chooseCategory,
  DATE_CHIPS,
  dateHint,
  dateIn,
  dayPartTimes,
  daysLeft,
  daysProblem,
  eveningHint,
  fmtWeekly,
  MAX_TIMES,
  MAX_TITLE,
  maxTimesPerWeek,
  NAME_IDEAS,
  oneGoalHint,
  SESSION_CHIPS,
  chipLength,
  sessionLengthProblem,
  customWindowProblem,
  startCustom,
  setSessionMinutes,
  setTimesPerWeek,
  stepProblem,
  type DisplayLike,
  type SetupAnswers,
} from "@/lib/goals/setup";
import { fmtRange } from "@/lib/time/display";
import { ROW, SIDE, WheelColumn } from "@/components/calendar/TimeWheel";
import { MINUTES, withHour, withMinute } from "@/lib/time/wheel";
import type { SavedPlace } from "@/lib/places/saved";
import type { LocalDate } from "@/lib/time/zoned";
import { ChoiceGroup, chipClass, focusRing, prefersReducedMotion, QuestionTitle, Stepper, stagger, useCountUp, type Choice } from "./parts";

export type QuestionProps = {
  answers: SetupAnswers;
  update: (change: (answers: SetupAnswers) => SetupAnswers) => void;
  /** A prefix for every id of this question (the leaving copy gets another one). */
  uid: string;
};

const labelClass = "text-xs font-medium text-ink-2";
const fieldClass = `${inputClass.replace("h-9", "h-11")} text-[15px]`;
const icon = "size-[18px]";

/** A quiet line that helps but never blocks. */
export function Hint({ children }: { children: string }) {
  return <p className="setup-rise mt-3 rounded-xl bg-warning-soft px-3 py-2 text-[13px] text-warning">{children}</p>;
}

// ---------- Q1: what is it about, and its name ----------

const CATEGORY_ICONS: Record<GoalCategory, typeof Dumbbell> = {
  sport: Dumbbell,
  uni: GraduationCap,
  work: Briefcase,
  personal: Heart,
  other: Shapes,
};

export function QuestionCategory({ answers, update, uid }: QuestionProps) {
  const choices: Choice<GoalCategory>[] = GOAL_CATEGORIES.map((category) => {
    const Icon = CATEGORY_ICONS[category];
    return { value: category, title: GOAL_CATEGORY_LABELS[category], line: CATEGORY_LINES[category], icon: <Icon className={icon} strokeWidth={1.8} /> };
  });
  const ideas = answers.category ? NAME_IDEAS[answers.category] : [];
  // The name field appears under the cards, on a phone below what is visible: once a category is
  // chosen it scrolls into view. Not when the question opens with a category already chosen.
  const nameRef = useRef<HTMLDivElement>(null);
  const category = answers.category;
  const before = useRef(category);
  useEffect(() => {
    if (before.current === category) return;
    before.current = category;
    nameRef.current?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [category]);
  return (
    <div>
      <QuestionTitle id={`${uid}-title`} sub="Pick the closest fit. The name is yours.">
        What is this goal about?
      </QuestionTitle>
      <div className="mt-5">
        <ChoiceGroup
          labelledBy={`${uid}-title`}
          idPrefix={`${uid}-category`}
          choices={choices}
          value={answers.category}
          onChoose={(category) => update((a) => chooseCategory(a, category))}
        />
      </div>
      {answers.category !== null && (
        <div ref={nameRef} className="setup-rise mt-5 flex scroll-mb-4 flex-col gap-1.5" style={stagger(2)}>
          <label htmlFor={`${uid}-name`} className={labelClass}>
            Give it a name
          </label>
          <input
            id={`${uid}-name`}
            value={answers.title}
            maxLength={MAX_TITLE}
            autoComplete="off"
            enterKeyHint="next"
            placeholder={ideas[0] ? `e.g. ${ideas[0]}` : "e.g. Learn to cook"}
            onChange={(e) => update((a) => ({ ...a, title: e.target.value }))}
            className={fieldClass}
          />
          {ideas.length > 0 && (
            <div role="group" aria-label="Name ideas" className="mt-1 flex flex-wrap gap-1.5">
              {ideas.map((idea, i) => (
                <span key={idea} className="setup-rise flex" style={stagger(i + 3)}>
                  <button type="button" onClick={() => update((a) => ({ ...a, title: idea }))} className={chipClass(answers.title.trim() === idea)}>
                    {idea}
                  </button>
                </span>
              ))}
            </div>
          )}
          {answers.category === "other" && (
            <div className="setup-rise mt-3 flex flex-col gap-1.5" style={stagger(3)}>
              <label htmlFor={`${uid}-other`} className={labelClass}>
                What kind? (optional)
              </label>
              <input
                id={`${uid}-other`}
                value={answers.categoryOther}
                maxLength={MAX_CATEGORY_OTHER}
                autoComplete="off"
                placeholder="e.g. Music"
                onChange={(e) => update((a) => ({ ...a, categoryOther: e.target.value }))}
                className={fieldClass}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Q2: how often, and for how long ----------

/** The hours of the custom length: 0 to 12. */
const LENGTH_HOURS = Array.from({ length: 13 }, (_, h) => h);
/** The longest custom length: 12 hours. */
const MAX_LENGTH = 12 * 60;

/** The custom length as two scrolling columns, hours (0 to 12) and minutes (0 to 59), like the calendar's time wheel. At 12 hours the minutes stay at 0. */
function LengthWheel({ value, onChange }: { value: number; onChange: (minutes: number) => void }) {
  // A minute picked at 12 hours is refused; a new key puts the minutes column back on 0.
  const [reset, setReset] = useState(0);
  return (
    <div role="group" aria-label="Length of each session" className="relative mx-auto flex w-fit items-center justify-center gap-6 select-none">
      <div aria-hidden className="pointer-events-none absolute -inset-x-4 rounded-lg bg-raised" style={{ top: SIDE, height: ROW }} />
      <div className="relative flex items-center gap-1.5">
        <WheelColumn label="Hours" items={LENGTH_HOURS} selected={Math.floor(value / 60)} onPick={(h) => onChange(Math.min(MAX_LENGTH, withHour(value, h)))} format={String} />
        <span aria-hidden className="w-10 text-sm font-medium text-ink">
          h
        </span>
      </div>
      <div className="relative flex items-center gap-1.5">
        <WheelColumn
          key={reset}
          label="Minutes"
          items={MINUTES}
          selected={value % 60}
          onPick={(m) => (value >= MAX_LENGTH && m !== 0 ? setReset((r) => r + 1) : onChange(withMinute(value, m)))}
          format={String}
        />
        <span aria-hidden className="w-10 text-sm font-medium text-ink">
          min
        </span>
      </div>
    </div>
  );
}

export function QuestionOften({ answers, update, uid, showZero = false }: QuestionProps & { /** Continue was pressed at 0:00: show why it did not go on. */ showZero?: boolean }) {
  // "Other" stays open while the length is one of the chips too, once chosen.
  const [custom, setCustom] = useState(!(SESSION_CHIPS as readonly number[]).includes(answers.sessionMinutes));
  const max = maxTimesPerWeek(answers);
  const color = answers.category ? goalColor(answers.color).dot : "bg-ink";
  const minuteChoices: Choice<string>[] = [...SESSION_CHIPS.map((m) => ({ value: String(m), title: chipLength(m) })), { value: "other", title: "Custom" }];
  const hint = oneGoalHint(answers);
  return (
    <div>
      <QuestionTitle id={`${uid}-title`} sub="Plan what you can keep up, at most one session a day.">
        How often, and for how long?
      </QuestionTitle>

      <section aria-labelledby={`${uid}-times`} className="setup-rise mt-6" style={stagger(0)}>
        <h3 id={`${uid}-times`} className={labelClass}>
          Times a week
        </h3>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <Stepper
            label="Times a week"
            value={answers.timesPerWeek}
            min={1}
            max={max}
            onChange={(n) => update((a) => setTimesPerWeek(a, n))}
            fewer="One fewer a week"
            more="One more a week"
          />
          {/* Seven dots that fill up to the number; days ruled out are drawn as rings. */}
          <div aria-hidden className="flex items-center gap-1.5">
            {Array.from({ length: MAX_TIMES }, (_, i) => {
              const filled = i < answers.timesPerWeek;
              const free = i < max;
              return (
                <span
                  key={`${i}-${filled}`}
                  className={`block size-3 rounded-full ${filled ? `setup-dot-on ${color}` : `setup-dot-off ${free ? "bg-muted" : "border border-dashed border-line"}`}`}
                />
              );
            })}
          </div>
        </div>
        {max < MAX_TIMES && (
          <p className="mt-2 text-[13px] text-ink-3">{`${max === 1 ? "1 day is" : `${max} days are`} left after the days you ruled out.`}</p>
        )}
        {/* Only after going back from the days: more sessions than days left. */}
        {answers.timesPerWeek > max && <p className="setup-rise mt-2 rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger">{daysProblem(answers)}</p>}
      </section>

      <section aria-labelledby={`${uid}-each`} className="setup-rise mt-6" style={stagger(1)}>
        <h3 id={`${uid}-each`} className={labelClass}>
          Each time
        </h3>
        <div className="mt-2">
          <ChoiceGroup
            labelledBy={`${uid}-each`}
            idPrefix={`${uid}-minutes`}
            size="chip"
            layout="flex flex-wrap gap-1.5"
            choices={minuteChoices}
            value={custom ? "other" : String(answers.sessionMinutes)}
            onChoose={(value) => {
              if (value === "other") return setCustom(true);
              setCustom(false);
              update((a) => setSessionMinutes(a, Number(value)));
            }}
          />
        </div>
        {custom && (
          <div className="setup-rise mt-3">
            <LengthWheel value={answers.sessionMinutes} onChange={(m) => update((a) => setSessionMinutes(a, m))} />
            {sessionLengthProblem(answers.sessionMinutes) && (answers.sessionMinutes !== 0 || showZero) && (
              <p role="status" className="setup-rise mt-3 rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger">
                {sessionLengthProblem(answers.sessionMinutes)}
              </p>
            )}
          </div>
        )}
      </section>

      <WeeklySum times={answers.timesPerWeek} minutes={answers.sessionMinutes} />
      {hint && <Hint>{hint}</Hint>}
    </div>
  );
}

/** "3 × 60 min = 3 h a week", the total counting to its new value. Screen readers get the final sentence. */
function WeeklySum({ times, minutes }: { times: number; minutes: number }) {
  const total = times * minutes;
  const shown = useCountUp(total);
  return (
    <p className="setup-rise mt-6 rounded-xl bg-raised px-3 py-2.5 text-sm text-ink-2" style={stagger(2)}>
      <span aria-hidden className="tabular">
        {times} × {minutes} min = <strong className="font-semibold text-ink">{fmtWeekly(Math.round(shown / 5) * 5)}</strong> a week
      </span>
      <span className="sr-only">{`${times} times ${minutes} minutes is ${fmtWeekly(total)} a week`}</span>
    </p>
  );
}

// ---------- Q3: where ----------

/** The value of a place card: "home", "address" or "place:<id>". */
function placeValue(answers: SetupAnswers): string {
  return answers.place.kind === "saved" ? `place:${answers.place.id}` : answers.place.kind;
}

export function QuestionPlace({ answers, update, uid, places, today }: QuestionProps & { places: SavedPlace[]; today: LocalDate }) {
  const choices: Choice<string>[] = [
    { value: "home", title: "At home or anywhere", line: "No place is saved", icon: <House className={icon} strokeWidth={1.8} /> },
    ...places.map((p) => ({ value: `place:${p.id}`, title: p.name, line: p.address, icon: <MapPin className={icon} strokeWidth={1.8} /> })),
    { value: "address", title: "Another address", line: "Type it, with suggestions", icon: <MapPinned className={icon} strokeWidth={1.8} /> },
  ];
  const problem = stepProblem("place", answers, today);
  return (
    <div>
      <QuestionTitle id={`${uid}-title`} sub="The app uses this for travel time. It is not sent to the AI.">
        Where does it happen?
      </QuestionTitle>
      <div className="mt-5">
        <ChoiceGroup
          labelledBy={`${uid}-title`}
          idPrefix={`${uid}-place`}
          layout="grid gap-2"
          choices={choices}
          value={placeValue(answers)}
          onChoose={(value) => {
            const saved = places.find((p) => `place:${p.id}` === value);
            update((a) => ({ ...a, place: saved ? { kind: "saved", id: saved.id, name: saved.name, address: saved.address } : value === "address" ? { kind: "address" } : { kind: "home" } }));
          }}
        />
      </div>
      {answers.place.kind === "address" && (
        <div className="setup-rise mt-4 flex flex-col gap-1.5">
          <label htmlFor={`${uid}-address`} className={labelClass}>
            Address
          </label>
          <AddressField
            id={`${uid}-address`}
            label="Address"
            placeholder="Street, place or name"
            value={answers.address}
            savedPlaces={places}
            onType={(address) => update((a) => ({ ...a, address }))}
            onDone={() => {}}
            revealList
          />
        </div>
      )}
      {problem && <Hint>{problem}</Hint>}
    </div>
  );
}

// ---------- Q4: when ----------

const DAY_PART_ICONS: Record<DayPart, typeof Sun> = { morning: Sunrise, afternoon: Sun, evening: Moon };

export function QuestionWhen({
  answers,
  update,
  uid,
  display,
  onChosen,
  showWindowProblem = false,
}: QuestionProps & {
  display: DisplayLike & { dayStartHour: number };
  onChosen: () => void;
  /** Continue was pressed with a window that does not work: show why. */
  showWindowProblem?: boolean;
}) {
  const part = (p: DayPart): Choice<DayPart> => {
    const Icon = DAY_PART_ICONS[p];
    return { value: p, title: `${p[0].toUpperCase()}${p.slice(1)}`, line: dayPartTimes(p, display.timeFormat), icon: <Icon className={icon} strokeWidth={1.8} /> };
  };
  // Any time top left, Morning top right, Afternoon and Evening below, Custom across the whole width.
  const custom = answers.dayPart === "custom";
  const choices: Choice<DayPart | "any" | "custom">[] = [
    { value: "any", title: "Any time", line: "Whenever it fits", icon: <Clock3 className={icon} strokeWidth={1.8} /> },
    part("morning"),
    part("afternoon"),
    part("evening"),
    {
      value: "custom",
      title: "Custom",
      line: custom ? fmtRange(answers.customFrom, answers.customUntil, display.timeFormat) : "Choose your own time",
      icon: <SlidersHorizontal className={icon} strokeWidth={1.8} />,
    },
  ];
  const hint = eveningHint(answers, display);
  const problem = custom && showWindowProblem ? customWindowProblem(answers) : null;
  // The sentence sits under the wheels: bring it into view when it comes.
  const problemRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (problem) problemRef.current?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [problem]);
  return (
    <div>
      <QuestionTitle id={`${uid}-title`} sub="A preference for planning. You can still plan it at other times.">
        When does it suit you best?
      </QuestionTitle>
      <div className="mt-5">
        <ChoiceGroup
          labelledBy={`${uid}-title`}
          idPrefix={`${uid}-when`}
          layout="grid gap-2 sm:grid-cols-2 sm:[&>*:last-child]:col-span-2"
          choices={choices}
          value={answers.dayPart}
          onChoose={(dayPart) => {
            if (dayPart === "custom") {
              // Custom stays open to set the times; the question does not go on by itself.
              if (!custom) update((a) => startCustom(a, display));
              return;
            }
            update((a) => ({ ...a, dayPart }));
            onChosen();
          }}
        />
      </div>
      {custom && (
        <div className="setup-rise mt-4 grid grid-cols-2 gap-3">
          <WindowWheel label="From" value={answers.customFrom} display={display} onChange={(customFrom) => update((a) => ({ ...a, customFrom }))} />
          <WindowWheel label="Until" value={answers.customUntil} display={display} onChange={(customUntil) => update((a) => ({ ...a, customUntil }))} />
        </div>
      )}
      {problem && (
        <p ref={problemRef} className="setup-rise mt-3 rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger">
          {problem}
        </p>
      )}
      {hint && <Hint>{hint}</Hint>}
    </div>
  );
}

/**
 * One end of the own window: hours and minutes as scrolling columns, the hours only those of the visible
 * day (the settings' first to last hour; the last one only as :00).
 */
function WindowWheel({ label, value, display, onChange }: { label: string; value: number; display: { dayStartHour: number; dayEndHour: number }; onChange: (minutes: number) => void }) {
  const first = display.dayStartHour;
  const last = display.dayEndHour;
  const hours = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const clamp = (m: number) => Math.min(last * 60, Math.max(first * 60, m));
  const [reset, setReset] = useState(0);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className={labelClass}>{label}</span>
      <div role="group" aria-label={`${label} time`} className="relative flex items-center justify-center gap-1 select-none">
        <div aria-hidden className="pointer-events-none absolute -inset-x-2 rounded-lg bg-raised" style={{ top: SIDE, height: ROW }} />
        <WheelColumn label={`${label} hour`} items={hours} selected={Math.floor(value / 60)} onPick={(h) => onChange(clamp(withHour(value, h)))} />
        <span aria-hidden className="relative text-lg font-medium text-ink">
          :
        </span>
        <WheelColumn
          key={reset}
          label={`${label} minute`}
          items={MINUTES}
          selected={value % 60}
          // At the last hour only :00 (the day ends there); another minute puts the column back.
          onPick={(m) => (Math.floor(value / 60) >= last && m !== 0 ? setReset((r) => r + 1) : onChange(clamp(withMinute(value, m))))}
        />
      </div>
    </div>
  );
}

// ---------- Q5: the days it happens on for sure, and the days it is never done on ----------

/** Which row of days shook last (a tap that was refused), the day, and a counter that starts it again. */
export type DaysShake = { row: "sure" | "off"; day: Weekday | null; round: number };

export function QuestionDays({
  answers,
  uid,
  onToggle,
  onToggleSure,
  shake,
  note,
}: QuestionProps & {
  /** Taps a day of the lower row (never). */
  onToggle: (day: Weekday) => void;
  /** Taps a day of the upper row (for sure). */
  onToggleSure: (day: Weekday) => void;
  shake: DaysShake;
  /** Why the last tap on a sure day did nothing ("You plan 3 sessions a week, ..."), until the next tap that works. */
  note: string | null;
}) {
  const problem = daysProblem(answers);
  const left = daysLeft(answers);
  const sure = answers.mustDays;
  const full = sure.length >= answers.timesPerWeek;
  const fill = answers.category ? goalColor(answers.color).dot : "bg-ink";
  const shaking = (row: DaysShake["row"], day: Weekday) => shake.row === row && shake.day === day && shake.round > 0;
  return (
    <div>
      <QuestionTitle id={`${uid}-title`} sub="Pick the days it has to happen, and the days that are off limits. Leave both empty if any day works.">
        Which days work for you?
      </QuestionTitle>

      <section aria-labelledby={`${uid}-sure`} className="mt-6">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id={`${uid}-sure`} className="text-[13px] font-semibold text-ink">
            Days for sure
          </h3>
          <span className={`text-xs tabular-nums transition-colors ${full && sure.length > 0 ? "text-ink-2" : "text-ink-3"}`}>
            {answers.timesPerWeek === 1 ? "Up to 1 day" : `Up to ${answers.timesPerWeek} days`}
          </span>
        </div>
        <div role="group" aria-labelledby={`${uid}-sure`} className="mt-2 grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map(({ day, short, long }, i) => {
            const on = sure.includes(day);
            const off = answers.avoidDays.includes(day);
            const moving = shaking("sure", day);
            return (
              <span key={day} className="setup-rise flex" style={stagger(i)}>
                <button
                  type="button"
                  aria-label={`${long}: ${on ? "for sure" : off ? "off limits" : "not chosen"}`}
                  aria-pressed={on}
                  disabled={off}
                  onClick={() => onToggleSure(day)}
                  className={`relative flex h-12 w-full items-center justify-center rounded-xl border text-[13px] font-semibold transition-[background-color,border-color,color,opacity] ${focusRing} ${
                    on
                      ? `border-transparent ${fill} text-white shadow-sm`
                      : off
                        ? "cursor-not-allowed border-dashed border-line-subtle bg-transparent text-ink-3 opacity-50"
                        : `border-line bg-surface text-ink hover:bg-raised ${full ? "text-ink-2" : ""}`
                  }`}
                >
                  <span key={moving ? shake.round : "still"} className={`inline-flex px-1 ${moving ? "address-shake" : ""}`}>
                    {short}
                  </span>
                </button>
              </span>
            );
          })}
        </div>
        {note && (
          <p role="status" className="setup-rise mt-2.5 rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger">
            {note}
          </p>
        )}
      </section>

      <section aria-labelledby={`${uid}-off`} className="mt-6">
        <h3 id={`${uid}-off`} className="text-[13px] font-semibold text-ink">
          Never on these days
        </h3>
        <div role="group" aria-labelledby={`${uid}-off`} className="mt-2 grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map(({ day, short, long }, i) => {
            const off = answers.avoidDays.includes(day);
            const locked = sure.includes(day);
            const moving = shaking("off", day);
            return (
              <span key={day} className="setup-rise flex" style={stagger(i + 7)}>
                <button
                  type="button"
                  aria-label={`${long}: ${locked ? "a day for sure" : off ? "never" : "possible"}`}
                  aria-pressed={off}
                  disabled={locked}
                  onClick={() => onToggle(day)}
                  className={`group relative flex h-12 w-full items-center justify-center rounded-xl border text-[13px] font-semibold transition-colors ${focusRing} ${
                    locked
                      ? "cursor-not-allowed border-dashed border-line-subtle bg-transparent text-ink-3 opacity-50"
                      : off
                        ? "border-line-subtle bg-raised text-ink-3"
                        : "border-line bg-surface text-ink hover:bg-raised"
                  }`}
                >
                  {/* A new key restarts the shake when the last free day is tapped again. */}
                  <span key={moving ? shake.round : "still"} className={`relative inline-flex px-1 ${moving ? "address-shake" : ""}`}>
                    {short}
                    {off && <span aria-hidden className="setup-strike absolute top-1/2 -right-1 -left-1 h-[1.5px] rounded-full bg-ink-3" />}
                  </span>
                </button>
              </span>
            );
          })}
        </div>
      </section>

      <p className="mt-3 text-[13px] text-ink-3">
        {`${left === 1 ? "1 day" : `${left} days`} left · ${answers.timesPerWeek === 1 ? "1 session" : `${answers.timesPerWeek} sessions`} planned`}
      </p>
      {problem && (
        <p className="setup-rise mt-3 rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger" id={`${uid}-problem`}>
          {problem}
        </p>
      )}
    </div>
  );
}

// ---------- Q6: a date or none ----------

export function QuestionDate({ answers, update, uid, today }: QuestionProps & { today: LocalDate }) {
  // A chosen date that does not work (in the past, or every day before it ruled out) says why.
  const problem = answers.hasDate && answers.deadline !== "" ? stepProblem("date", answers, today) : null;
  const hint = dateHint(answers, today);
  const choices: Choice<"yes" | "no">[] = [
    { value: "yes", title: "Yes, there is a date", line: "An exam, a race, a launch", icon: <CalendarCheck className={icon} strokeWidth={1.8} /> },
    { value: "no", title: "No, it is ongoing", line: "No end date", icon: <Repeat className={icon} strokeWidth={1.8} /> },
  ];
  return (
    <div>
      <QuestionTitle id={`${uid}-title`} sub="With a date, the goal shows how many days are left.">
        Are you working towards a date?
      </QuestionTitle>
      <div className="mt-5">
        <ChoiceGroup
          labelledBy={`${uid}-title`}
          idPrefix={`${uid}-date-choice`}
          choices={choices}
          value={answers.hasDate === null ? null : answers.hasDate ? "yes" : "no"}
          onChoose={(value) => update((a) => ({ ...a, hasDate: value === "yes" }))}
        />
      </div>
      {answers.hasDate && (
        <div className="setup-rise mt-5 flex flex-col gap-1.5">
          <label htmlFor={`${uid}-date`} className={labelClass}>
            The date
          </label>
          <DateField
            id={`${uid}-date`}
            label="The date"
            value={answers.deadline}
            min={today}
            todayKey={today}
            onChange={(deadline) => update((a) => ({ ...a, deadline }))}
            placeholder="Choose a date"
            tall
          />
          <div role="group" aria-label="Quick dates" className="mt-1.5 flex flex-wrap gap-1.5">
            {DATE_CHIPS.map((weeks, i) => {
              const date = dateIn(today, weeks);
              return (
                <span key={weeks} className="setup-rise flex" style={stagger(i + 1)}>
                  <button type="button" aria-pressed={answers.deadline === date} onClick={() => update((a) => ({ ...a, deadline: date }))} className={chipClass(answers.deadline === date)}>
                    {`In ${weeks} weeks`}
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}
      {problem && <p className="setup-rise mt-3 rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger">{problem}</p>}
      {hint && <Hint>{hint}</Hint>}
    </div>
  );
}
