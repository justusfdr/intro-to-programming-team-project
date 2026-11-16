"use client";

// The six questions of the goal setup (spec 42). Each shows the question as its heading, one helper
// line and the answer controls; the frame (GoalSetup.tsx) adds Back, Close, the progress, the goal taking
// shape and "Continue". The rules (what may be chosen, the sentences, the hints) are in
// src/lib/goals/setup.ts; the controls only offer what passes.
import { useState } from "react";
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
  Sun,
  Sunrise,
} from "lucide-react";
import { DateField, inputClass } from "@/components/calendar/fields";
import { AddressField } from "@/components/places/AddressField";
import { goalColor } from "@/lib/goals/colors";
import { DAY_PARTS, GOAL_CATEGORIES, GOAL_CATEGORY_LABELS, MAX_CATEGORY_OTHER, WEEKDAYS, type DayPart, type GoalCategory, type Weekday } from "@/lib/goals/routine";
import {
  CATEGORY_LINES,
  chooseCategory,
  DATE_CHIPS,
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
  setSessionMinutes,
  setTimesPerWeek,
  stepProblem,
  type DisplayLike,
  type SetupAnswers,
} from "@/lib/goals/setup";
import { MAX_SESSION_MINUTES, MIN_SESSION_MINUTES, SESSION_STEP_MINUTES } from "@/lib/goals/routine";
import type { SavedPlace } from "@/lib/places/saved";
import type { LocalDate } from "@/lib/time/zoned";
import { ChoiceGroup, chipClass, focusRing, QuestionTitle, Stepper, stagger, useCountUp, type Choice } from "./parts";

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
        <div className="setup-rise mt-5 flex flex-col gap-1.5" style={stagger(2)}>
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

export function QuestionOften({ answers, update, uid }: QuestionProps) {
  // "Other" stays open while the length is one of the chips too, once chosen.
  const [custom, setCustom] = useState(!(SESSION_CHIPS as readonly number[]).includes(answers.sessionMinutes));
  const max = maxTimesPerWeek(answers);
  const color = answers.category ? goalColor(answers.color).dot : "bg-ink";
  const minuteChoices: Choice<string>[] = [...SESSION_CHIPS.map((m) => ({ value: String(m), title: `${m} min` })), { value: "other", title: "Other" }];
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
            <Stepper
              label="Minutes each time"
              value={answers.sessionMinutes}
              min={MIN_SESSION_MINUTES}
              max={MAX_SESSION_MINUTES}
              step={SESSION_STEP_MINUTES}
              format={fmtWeekly}
              onChange={(m) => update((a) => setSessionMinutes(a, m))}
              fewer="15 minutes less"
              more="15 minutes more"
            />
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
          />
        </div>
      )}
      {problem && <Hint>{problem}</Hint>}
    </div>
  );
}

// ---------- Q4: when ----------

const DAY_PART_ICONS: Record<DayPart, typeof Sun> = { morning: Sunrise, afternoon: Sun, evening: Moon };

export function QuestionWhen({ answers, update, uid, display, onChosen }: QuestionProps & { display: DisplayLike; onChosen: () => void }) {
  const choices: Choice<DayPart | "any">[] = [
    ...DAY_PARTS.map((part) => {
      const Icon = DAY_PART_ICONS[part];
      return { value: part, title: `${part[0].toUpperCase()}${part.slice(1)}`, line: dayPartTimes(part, display.timeFormat), icon: <Icon className={icon} strokeWidth={1.8} /> };
    }),
    { value: "any" as const, title: "Any time", line: "Whenever it fits", icon: <Clock3 className={icon} strokeWidth={1.8} /> },
  ];
  const hint = eveningHint(answers, display);
  return (
    <div>
      <QuestionTitle id={`${uid}-title`} sub="A preference for planning. You can still plan it at other times.">
        When does it suit you best?
      </QuestionTitle>
      <div className="mt-5">
        <ChoiceGroup
          labelledBy={`${uid}-title`}
          idPrefix={`${uid}-when`}
          choices={choices}
          value={answers.dayPart}
          onChoose={(dayPart) => {
            update((a) => ({ ...a, dayPart }));
            onChosen();
          }}
        />
      </div>
      {hint && <Hint>{hint}</Hint>}
    </div>
  );
}

// ---------- Q5: the days it is never done on ----------

export function QuestionDays({
  answers,
  uid,
  onToggle,
  shake,
}: QuestionProps & {
  onToggle: (day: Weekday) => void;
  /** The day that shook last (the last free day was tapped) and a counter that starts the shake again. */
  shake: { day: Weekday | null; round: number };
}) {
  const problem = daysProblem(answers);
  const left = daysLeft(answers);
  return (
    <div>
      <QuestionTitle id={`${uid}-title`} sub="Tap the days that are off limits. Leave them all if every day works.">
        Are there days you never want to do it?
      </QuestionTitle>
      <div role="group" aria-labelledby={`${uid}-title`} className="mt-6 grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map(({ day, short, long }, i) => {
          const off = answers.avoidDays.includes(day);
          const shaking = shake.day === day && shake.round > 0;
          return (
            <span key={day} className="setup-rise flex" style={stagger(i)}>
              <button
                type="button"
                aria-label={`${long}: ${off ? "never" : "possible"}`}
                onClick={() => onToggle(day)}
                className={`group relative flex h-12 w-full items-center justify-center rounded-xl border text-[13px] font-semibold transition-colors ${focusRing} ${
                  off ? "border-line-subtle bg-raised text-ink-3" : "border-line bg-surface text-ink hover:bg-raised"
                }`}
              >
                {/* A new key restarts the shake when the last free day is tapped again. */}
                <span key={shaking ? shake.round : "still"} className={`relative inline-flex px-1 ${shaking ? "address-shake" : ""}`}>
                  {short}
                  {off && <span aria-hidden className="setup-strike absolute top-1/2 -right-1 -left-1 h-[1.5px] rounded-full bg-ink-3" />}
                </span>
              </button>
            </span>
          );
        })}
      </div>
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
    </div>
  );
}
