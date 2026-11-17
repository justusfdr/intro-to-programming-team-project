// The guided questions for a new goal (spec 42): the starting values, whether "Continue" is possible
// on each question (accepted and refused at the limits), the hints that never block, the exact body of
// create_goal, the tags and the review's sentence in both time formats, and "Change".
import { describe, expect, it } from "vitest";
import { MESSAGES } from "@/lib/messages";
import { EMPTY_ROUTINE, routineProblem, type Weekday } from "./routine";
import {
  allGoalsHint,
  answersSentence,
  canRuleOut,
  chooseCategory,
  createGoalBody,
  dateHint,
  dateIn,
  dayPartTimes,
  daysProblem,
  emptyAnswers,
  eveningHint,
  firstProblemStep,
  fmtWeekly,
  freeDaysUntil,
  goalWeeklyMinutes,
  hasAnswers,
  LAST_DAY_MESSAGE,
  locationOf,
  maxTimesPerWeek,
  oneGoalHint,
  previewTags,
  questionNumber,
  routineSentence,
  routineTags,
  setSessionMinutes,
  setTimesPerWeek,
  SETUP_STEPS,
  STEP_OF_TAG,
  stepProblem,
  summaryLines,
  toggleAvoidDay,
  toggleMustDay,
  MUST_IS_OFF_MESSAGE,
  weeklySum,
  type SetupAnswers,
} from "./setup";

const TODAY = "2026-11-16";

/** A finished set of answers: the gym three times a week, evenings, never on Fridays, at a saved place, until 12 Dec. */
function gym(change: Partial<SetupAnswers> = {}): SetupAnswers {
  return {
    ...chooseCategory(emptyAnswers("teal"), "sport"),
    title: "Gym",
    place: { kind: "saved", id: "p1", name: "Gym", address: "FitnessHut Lisboa" },
    dayPart: "evening",
    avoidDays: [5],
    hasDate: true,
    deadline: "2026-12-12",
    ...change,
  };
}

const ruleOut = (answers: SetupAnswers, ...days: Weekday[]) => days.reduce((a, d) => toggleAvoidDay(a, d).answers, answers);

describe("the questions and their starting values", () => {
  it("has six questions in order, numbered 1 to 6", () => {
    expect(SETUP_STEPS).toEqual(["category", "often", "place", "when", "days", "date"]);
    expect(questionNumber("category")).toBe(1);
    expect(questionNumber("date")).toBe(6);
  });

  it("starts with nothing chosen, at home, the given colour and the rocket", () => {
    const a = emptyAnswers("amber");
    expect(a).toMatchObject({ category: null, title: "", place: { kind: "home" }, dayPart: null, avoidDays: [], hasDate: null, color: "amber", icon: "rocket", autoBlock: false });
    expect(hasAnswers(a)).toBe(false);
  });

  it("gives each category its times a week, session length and icon", () => {
    const start = (c: Parameters<typeof chooseCategory>[1]) => {
      const a = chooseCategory(emptyAnswers("rose"), c);
      return [a.timesPerWeek, a.sessionMinutes, a.icon];
    };
    expect(start("sport")).toEqual([3, 60, "dumbbell"]);
    expect(start("uni")).toEqual([4, 90, "graduation"]);
    expect(start("work")).toEqual([3, 90, "briefcase"]);
    expect(start("personal")).toEqual([3, 60, "heart"]);
    expect(start("other")).toEqual([2, 60, "rocket"]);
    expect(hasAnswers(chooseCategory(emptyAnswers("rose"), "other"))).toBe(true);
  });

  it("keeps how often and how long once changed, and an icon the person chose", () => {
    let a = setTimesPerWeek(chooseCategory(emptyAnswers("rose"), "sport"), 5);
    a = { ...a, icon: "code", iconTouched: true };
    a = chooseCategory(a, "uni");
    expect([a.timesPerWeek, a.sessionMinutes, a.icon]).toEqual([5, 60, "code"]);
  });

  it("never starts with more times than the days left", () => {
    const a = chooseCategory(ruleOut(emptyAnswers("rose"), 1, 2, 3, 4), "uni");
    expect(a.timesPerWeek).toBe(3);
  });
});

describe("Q1: what it is about and its name", () => {
  const q1 = (a: SetupAnswers) => stepProblem("category", a, TODAY);

  it("needs a category and a name of 1 to 80 characters", () => {
    expect(q1(emptyAnswers("rose"))).toBe("Choose what this goal is about.");
    expect(q1(chooseCategory(emptyAnswers("rose"), "sport"))).toBe("Give your goal a name.");
    expect(q1({ ...chooseCategory(emptyAnswers("rose"), "sport"), title: "   " })).toBe("Give your goal a name.");
    expect(q1(gym({ title: "a".repeat(80) }))).toBeNull();
    expect(q1(gym({ title: "a".repeat(81) }))).toBe(MESSAGES.goalTitleLength);
  });

  it("takes an own word of up to 30 characters with Other, and ignores it with another category", () => {
    const other = { ...chooseCategory(emptyAnswers("rose"), "other"), title: "Band" };
    expect(q1({ ...other, categoryOther: "x".repeat(30) })).toBeNull();
    expect(q1({ ...other, categoryOther: "x".repeat(31) })).toBe(MESSAGES.categoryOtherLength);
    expect(q1({ ...other, categoryOther: "Mu\nsic" })).toBe(MESSAGES.categoryOtherForm);
    expect(q1(gym({ categoryOther: "x".repeat(31) }))).toBeNull();
  });
});

describe("Q2: how often and how long", () => {
  it("keeps the times between 1 and 7 and the minutes to the minute, as the wheel shows them (0:00 to 12:00)", () => {
    const a = gym();
    expect(setTimesPerWeek(a, 0).timesPerWeek).toBe(1);
    expect(setTimesPerWeek(a, 9).timesPerWeek).toBe(6); // Friday is ruled out
    expect(setTimesPerWeek({ ...a, avoidDays: [] }, 9).timesPerWeek).toBe(7);
    expect(setSessionMinutes(a, 0).sessionMinutes).toBe(0);
    expect(setSessionMinutes(a, 360).sessionMinutes).toBe(360);
    expect(setSessionMinutes(a, 50).sessionMinutes).toBe(50);
    expect(setSessionMinutes(a, 2000).sessionMinutes).toBe(720);
    expect(setSessionMinutes(a, 750).sessionMinutes).toBe(720);
    expect(setSessionMinutes(a, 75).oftenTouched).toBe(true);
  });

  it("accepts 1 and 7 times, 1 minute to 12 hours; refuses 0 and 8 times, 0 minutes and more than 12 hours", () => {
    const q2 = (change: Partial<SetupAnswers>) => stepProblem("often", gym({ avoidDays: [], ...change }), TODAY);
    expect(q2({ timesPerWeek: 1, sessionMinutes: 1 })).toBeNull();
    expect(q2({ timesPerWeek: 7, sessionMinutes: 720 })).toBeNull();
    expect(q2({ sessionMinutes: 360 })).toBeNull();
    expect(q2({ timesPerWeek: 0 })).toBe("Choose 1 to 7 times a week.");
    expect(q2({ timesPerWeek: 8 })).toBe("Choose 1 to 7 times a week.");
    expect(q2({ sessionMinutes: 0 })).toBe("Choose at least 1 minute.");
    expect(q2({ sessionMinutes: 721 })).toBe("A session can be at most 12 hours.");
  });

  it("refuses more times than the days left after going back from the days", () => {
    expect(stepProblem("often", gym({ timesPerWeek: 7, avoidDays: [5] }), TODAY)).toMatch(/^You planned 7 sessions a week, but only 6 days are left/);
    expect(maxTimesPerWeek(gym({ avoidDays: [5, 6] }))).toBe(5);
  });

  it("does the sum, and hints above 20 hours a week without blocking", () => {
    expect(weeklySum({ timesPerWeek: 3, sessionMinutes: 60 })).toBe("3 × 60 min = 3 h a week");
    expect(weeklySum({ timesPerWeek: 3, sessionMinutes: 45 })).toBe("3 × 45 min = 2 h 15 min a week");
    expect(fmtWeekly(45)).toBe("45 min");
    expect(oneGoalHint({ timesPerWeek: 5, sessionMinutes: 240 })).toBeNull(); // exactly 20 h
    expect(oneGoalHint({ timesPerWeek: 7, sessionMinutes: 180 })).toBe("That is 21 hours a week for one goal. Make sure it fits.");
    expect(oneGoalHint({ timesPerWeek: 3, sessionMinutes: 405 })).toBe("That is 20 h 15 min a week for one goal. Make sure it fits.");
    expect(stepProblem("often", gym({ avoidDays: [], timesPerWeek: 7, sessionMinutes: 180 }), TODAY)).toBeNull();
  });
});

describe("Q3: where", () => {
  it("is always possible; saves a saved place's address, a typed address, or nothing", () => {
    expect(stepProblem("place", gym({ place: { kind: "home" } }), TODAY)).toBeNull();
    expect(locationOf({ place: { kind: "home" }, address: "Rua X" })).toBeNull();
    expect(locationOf({ place: { kind: "saved", id: "p", name: "Uni", address: " Campus 1 " }, address: "" })).toBe("Campus 1");
    expect(locationOf({ place: { kind: "address" }, address: "  Rua Augusta 10 " })).toBe("Rua Augusta 10");
    expect(locationOf({ place: { kind: "address" }, address: "   " })).toBeNull();
  });

  it("refuses an address over 200 characters (a saved place may hold 300)", () => {
    expect(stepProblem("place", gym({ place: { kind: "address" }, address: "a".repeat(200) }), TODAY)).toBeNull();
    expect(stepProblem("place", gym({ place: { kind: "address" }, address: "a".repeat(201) }), TODAY)).toBe(MESSAGES.locationLength);
  });
});

describe("Q4: when", () => {
  it("needs a choice, Any time included", () => {
    expect(stepProblem("when", gym({ dayPart: null }), TODAY)).toBe("Choose a time of day, or Any time.");
    expect(stepProblem("when", gym({ dayPart: "any" }), TODAY)).toBeNull();
  });

  it("writes the parts of the day in the person's time format", () => {
    expect(dayPartTimes("morning", "12h")).toBe("Before 12pm");
    expect(dayPartTimes("afternoon", "12h")).toBe("12 – 5pm");
    expect(dayPartTimes("evening", "12h")).toBe("After 5pm");
    expect(dayPartTimes("morning", "24h")).toBe("Before 12:00");
    expect(dayPartTimes("afternoon", "24h")).toBe("12:00 – 17:00");
    expect(dayPartTimes("evening", "24h")).toBe("After 17:00");
  });

  it("hints when an evening session runs past the visible day, without blocking", () => {
    const display = { timeFormat: "12h" as const, dayEndHour: 21 };
    expect(eveningHint({ dayPart: "evening", sessionMinutes: 240 }, display)).toBeNull(); // ends at 21:00 exactly
    expect(eveningHint({ dayPart: "evening", sessionMinutes: 225 }, { timeFormat: "24h", dayEndHour: 20 })).toBe(
      "A 3 h 45 min session from 17:00 runs past 20:00, the end of your visible day.",
    );
    expect(eveningHint({ dayPart: "evening", sessionMinutes: 240 }, { timeFormat: "12h", dayEndHour: 20 })).toBe(
      "A 4 h session from 5pm runs past 8pm, the end of your visible day.",
    );
    expect(eveningHint({ dayPart: "morning", sessionMinutes: 240 }, { timeFormat: "12h", dayEndHour: 18 })).toBeNull();
  });
});

describe("Q5: the days it is never done on (one session a day at most)", () => {
  it("accepts 6 sessions with one day ruled out, refuses 7", () => {
    expect(stepProblem("days", gym({ timesPerWeek: 6, avoidDays: [5] }), TODAY)).toBeNull();
    expect(stepProblem("days", gym({ timesPerWeek: 7, avoidDays: [5] }), TODAY)).toBe(
      "You planned 7 sessions a week, but only 6 days are left. Free a day, or go back and plan fewer.",
    );
    expect(daysProblem({ timesPerWeek: 5, avoidDays: [1, 2, 3, 4] })).toBe(
      "You planned 5 sessions a week, but only 3 days are left. Free a day, or go back and plan fewer.",
    );
    expect(daysProblem({ timesPerWeek: 2, avoidDays: [1, 2, 3, 4, 5, 6] })).toBe(
      "You planned 2 sessions a week, but only 1 day is left. Free a day, or go back and plan fewer.",
    );
  });

  it("never allows a combination the server would refuse", () => {
    for (let times = 1; times <= 7; times++) {
      for (let off = 0; off <= 6; off++) {
        const days = ([1, 2, 3, 4, 5, 6, 7] as Weekday[]).slice(0, off);
        const ok = stepProblem("days", gym({ timesPerWeek: times, avoidDays: days }), TODAY) === null;
        if (ok) expect(routineProblem({ ...EMPTY_ROUTINE, avoidDays: days }, [{ kind: "count", target: times }])).toBeNull();
      }
    }
  });

  it("rules days out and frees them, but never the last free day", () => {
    let a = ruleOut(emptyAnswers("rose"), 7, 1, 2, 3, 4, 5);
    expect(a.avoidDays).toEqual([1, 2, 3, 4, 5, 7]);
    expect(canRuleOut(a, 6)).toBe(false);
    const refused = toggleAvoidDay(a, 6);
    expect(refused.refused).toBe(LAST_DAY_MESSAGE);
    expect(refused.answers).toBe(a);
    expect(LAST_DAY_MESSAGE).toBe("At least one day has to stay");
    a = toggleAvoidDay(a, 1).answers;
    expect(a.avoidDays).toEqual([2, 3, 4, 5, 7]);
    expect(canRuleOut(a, 6)).toBe(true);
  });
});

describe("Q6: a date or none", () => {
  const q6 = (change: Partial<SetupAnswers>) => stepProblem("date", gym(change), TODAY);

  it("needs one of the two, and with a date a date from today on", () => {
    expect(q6({ hasDate: null })).toBe("Choose whether you are working towards a date.");
    expect(q6({ hasDate: true, deadline: "" })).toBe("Choose the date.");
    expect(q6({ hasDate: true, deadline: "2026-11-15" })).toBe(MESSAGES.deadlinePast);
    expect(q6({ hasDate: true, deadline: TODAY })).toBeNull();
    expect(q6({ hasDate: false, deadline: "" })).toBeNull();
  });

  it("offers the quick dates in 4, 8 and 12 weeks", () => {
    expect([4, 8, 12].map((w) => dateIn(TODAY, w))).toEqual(["2026-12-14", "2027-01-11", "2027-02-08"]);
  });

  it("finds the first question that does not pass yet", () => {
    expect(firstProblemStep(gym(), TODAY)).toBeNull();
    expect(firstProblemStep(gym({ dayPart: null, hasDate: null }), TODAY)).toBe("when");
    expect(firstProblemStep(emptyAnswers("rose"), TODAY)).toBe("category");
  });
});

describe("the hint for all goals together", () => {
  const saved = (kind: "count" | "hours", target: number, sessionMinutes: number | null = null) => ({
    rules: [{ kind, target }],
    routine: sessionMinutes === null ? undefined : { ...EMPTY_ROUTINE, sessionMinutes },
  });

  it("counts a count rule times its session (60 minutes without one) and an hours rule as it is", () => {
    expect(goalWeeklyMinutes(saved("count", 3))).toBe(180);
    expect(goalWeeklyMinutes(saved("count", 3, 90))).toBe(270);
    expect(goalWeeklyMinutes(saved("hours", 6.5, 90))).toBe(390);
  });

  it("is quiet at 40 hours and speaks above", () => {
    const these = { timesPerWeek: 3, sessionMinutes: 60 }; // 3 h
    expect(allGoalsHint(these, [saved("hours", 37)])).toBeNull();
    expect(allGoalsHint(these, [saved("hours", 37.5)])).toBe("All your goals together come to 40 h 30 min a week.");
    expect(allGoalsHint(these, [saved("hours", 30), saved("count", 4, 120)])).toBe("All your goals together come to 41 hours a week.");
  });
});

describe("the body of create_goal", () => {
  it("sends one count rule and the routine, with the date and a saved place's address", () => {
    expect(createGoalBody(gym({ why: "  Feel strong  " }))).toEqual({
      title: "Gym",
      deadline: "2026-12-12",
      autoBlock: false,
      color: "teal",
      icon: "dumbbell",
      why: "Feel strong",
      rules: [{ kind: "count", target: 3, minMinutes: null }],
      category: "sport",
      categoryOther: null,
      sessionMinutes: 60,
      dayPart: "evening",
      avoidDays: [5],
      mustDays: [],
      location: "FitnessHut Lisboa",
    });
  });

  it("sends deadline null without a date, no location at home, no part of the day for Any time, the own word only with Other", () => {
    const body = createGoalBody({
      ...gym({ hasDate: false, deadline: "2026-12-12", place: { kind: "home" }, dayPart: "any", autoBlock: true }),
      category: "other",
      categoryOther: " Music ",
    });
    expect(body).toMatchObject({ deadline: null, location: null, dayPart: null, autoBlock: true, category: "other", categoryOther: "Music" });
    expect(createGoalBody(gym({ categoryOther: "Music" })).categoryOther).toBeNull();
  });
});

describe("the tags and the sentence", () => {
  it("builds the tags of the goal taking shape: how often, how long, when, the days, the place, the date", () => {
    const tags = previewTags(gym({ avoidDays: [5, 6] }), "date", "12h");
    expect(tags.map((t) => t.text)).toEqual(["3× a week", "60 min", "Evenings", "Not Fri, Sat", "FitnessHut Lisboa", "Until Dec 12"]);
    expect(tags.map((t) => t.label)).toEqual([
      "3 times a week",
      "60 minutes each",
      "Evenings, after 5pm",
      "Never on Friday and Saturday",
      "At FitnessHut Lisboa",
      "Until Dec 12, 2026",
    ]);
    expect(previewTags(gym({ hasDate: false }), "date", "12h").at(-1)?.text).toBe("No end date");
  });

  it("shows only the questions reached", () => {
    expect(previewTags(gym(), "category", "12h")).toEqual([]);
    expect(previewTags(gym(), "often", "12h").map((t) => t.text)).toEqual(["3× a week", "60 min"]);
    expect(previewTags(gym({ hasDate: null }), "date", "12h").map((t) => t.key)).not.toContain("date");
  });

  it("writes the part of the day in both time formats", () => {
    const routine = { ...EMPTY_ROUTINE, dayPart: "afternoon" as const };
    expect(routineTags({ routine }, "12h")[0]).toMatchObject({ text: "Afternoons", label: "Afternoons, 12 – 5pm" });
    expect(routineTags({ routine }, "24h")[0]).toMatchObject({ text: "Afternoons", label: "Afternoons, 12:00 – 17:00" });
    expect(routineTags({ routine: { ...EMPTY_ROUTINE, dayPart: "morning" } }, "24h")[0].label).toBe("Mornings, before 12:00");
  });

  it("gives the goal card only what is set, with the category's name", () => {
    expect(routineTags({ routine: EMPTY_ROUTINE, withCategory: true }, "12h")).toEqual([]);
    const card = routineTags({ routine: { ...EMPTY_ROUTINE, category: "other", categoryOther: "Music", location: "Home studio" }, withCategory: true }, "12h");
    expect(card.map((t) => t.text)).toEqual(["Music", "Home studio"]);
    expect(routineTags({ routine: { ...EMPTY_ROUTINE, category: "uni" }, withCategory: true }, "12h")[0].text).toBe("Uni");
  });

  it("says the routine in one sentence", () => {
    expect(answersSentence(gym())).toBe("3 times a week, 60 minutes each, in the evening, never on Fridays, at FitnessHut Lisboa, until Dec 12, 2026");
    expect(answersSentence(gym({ timesPerWeek: 1, sessionMinutes: 150, avoidDays: [6, 7], dayPart: "any", place: { kind: "home" }, hasDate: false }))).toBe(
      "Once a week, 2 h 30 min each, never on Saturdays or Sundays, with no end date",
    );
    expect(routineSentence({ routine: { ...EMPTY_ROUTINE, sessionMinutes: 45 } })).toBe("45 minutes a session");
  });

  it("lists the review's lines, each with the question it belongs to", () => {
    expect(summaryLines(gym({ timesPerWeek: 2 }))).toEqual([
      { step: "often", label: "How often", text: "Twice a week, 60 minutes each" },
      { step: "place", label: "Where", text: "FitnessHut Lisboa" },
      { step: "when", label: "When", text: "In the evening" },
      { step: "days", label: "Days", text: "Never on Fridays" },
      { step: "date", label: "Until", text: "Dec 12, 2026" },
    ]);
    expect(summaryLines(gym({ place: { kind: "home" }, dayPart: "any", avoidDays: [], hasDate: false })).map((l) => l.text).slice(1)).toEqual([
      "At home or anywhere",
      "Any time of day",
      "Every day works",
      "No end date",
    ]);
  });

  it("maps every tag to its question, for Change", () => {
    expect(STEP_OF_TAG).toEqual({ category: "category", often: "often", minutes: "often", dayPart: "when", sure: "days", days: "days", place: "place", date: "date" });
  });
});

describe("Q6: the date and the days ruled out", () => {
  // Monday 16 Nov 2026: Wednesday 18 Nov is two days later.
  it("counts the free days from today to the date, at most a week", () => {
    expect(freeDaysUntil({ deadline: "2026-11-18", avoidDays: [] }, TODAY)).toBe(3);
    expect(freeDaysUntil({ deadline: "2026-11-18", avoidDays: [1, 3] }, TODAY)).toBe(1);
    expect(freeDaysUntil({ deadline: "2027-06-01", avoidDays: [6, 7] }, TODAY)).toBe(5);
    expect(freeDaysUntil({ deadline: "", avoidDays: [] }, TODAY)).toBe(0);
  });

  it("refuses a date before which every day is ruled out; accepts one free day", () => {
    expect(stepProblem("date", gym({ deadline: "2026-11-17", avoidDays: [1, 2] }), TODAY)).toBe(
      "Every day until Nov 17 is ruled out. Choose a later date, or free a day.",
    );
    expect(stepProblem("date", gym({ deadline: "2026-11-18", avoidDays: [1, 2] }), TODAY)).toBeNull();
  });

  it("hints when a date less than a week away leaves fewer free days than sessions, without blocking", () => {
    expect(dateHint(gym({ deadline: "2026-11-17", avoidDays: [], timesPerWeek: 3 }), TODAY)).toBe("Until Nov 17 there are 2 free days for 3 sessions.");
    expect(dateHint(gym({ deadline: "2026-11-18", avoidDays: [], timesPerWeek: 3 }), TODAY)).toBeNull();
    expect(dateHint(gym({ deadline: "2026-11-22", avoidDays: [5], timesPerWeek: 6 }), TODAY)).toBeNull(); // a whole week
    expect(dateHint(gym({ hasDate: false }), TODAY)).toBeNull();
  });
});

describe("the sure days", () => {
  it("are chosen up to the sessions a week; one more is refused with a sentence", () => {
    let a = gym({ timesPerWeek: 2, avoidDays: [] });
    a = toggleMustDay(a, 3).answers;
    a = toggleMustDay(a, 1).answers;
    expect(a.mustDays).toEqual([1, 3]);
    const more = toggleMustDay(a, 5);
    expect(more.answers).toBe(a);
    expect(more.refused).toBe("You plan 2 sessions a week, so you can choose up to 2 sure days.");
    expect(toggleMustDay(gym({ timesPerWeek: 1, avoidDays: [], mustDays: [2] }), 4).refused).toBe("You plan 1 session a week, so you can choose 1 sure day.");
    expect(toggleMustDay(a, 1).answers.mustDays).toEqual([3]);
  });

  it("a sure day cannot be a day off, and a day off cannot be a sure day", () => {
    const a = gym({ avoidDays: [5], mustDays: [1] });
    expect(toggleAvoidDay(a, 1)).toEqual({ answers: a, refused: MUST_IS_OFF_MESSAGE });
    expect(toggleMustDay(a, 5).answers).toBe(a);
  });

  it("block the days question and How often when there are more than the sessions", () => {
    const a = gym({ timesPerWeek: 1, avoidDays: [], mustDays: [1, 3] });
    expect(stepProblem("days", a, TODAY)).toBe("You chose 2 sure days but plan 1 session a week. Unpick a day, or go back and plan more.");
    expect(stepProblem("often", a, TODAY)).toBe(stepProblem("days", a, TODAY));
  });

  it("are sent, shown as a tag, in the review's line and in the sentence", () => {
    const a = gym({ timesPerWeek: 3, avoidDays: [5], mustDays: [1, 3], dayPart: "any", place: { kind: "home" }, hasDate: false });
    expect(createGoalBody(a).mustDays).toEqual([1, 3]);
    expect(previewTags(a, "date", "12h").find((t) => t.key === "sure")).toEqual({ key: "sure", text: "On Mon, Wed", label: "Always on Monday and Wednesday", step: "days" });
    expect(summaryLines(a).find((l) => l.step === "days")?.text).toBe("Always on Mondays and Wednesdays, never on Fridays");
    expect(answersSentence(a)).toContain("always on Mondays and Wednesdays, never on Fridays");
    expect(hasAnswers({ ...emptyAnswers("amber"), mustDays: [2] })).toBe(true);
  });
});

describe("long sessions", () => {
  it("show as hours in the tag above two hours", () => {
    const tag = (m: number) => previewTags(gym({ sessionMinutes: m }), "often", "12h").find((t) => t.key === "minutes")?.text;
    expect(tag(90)).toBe("90 min");
    expect(tag(360)).toBe("6 h");
    expect(tag(395)).toBe("6 h 35 min");
  });
});
