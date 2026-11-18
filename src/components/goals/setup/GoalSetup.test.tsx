// The guided setup of a new goal (spec 42), rendered on the server as the browser first receives it,
// opened on a given question with given answers: each question's controls and state, the blocking
// sentence of Q5, the review's sentence and the celebration. The rules themselves are tested in
// src/lib/goals/setup.test.ts.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DisplayProvider } from "@/components/shell/DisplayProvider";
import { chooseCategory, emptyAnswers, type SetupAnswers } from "@/lib/goals/setup";
import type { GoalView } from "@/lib/goals/types";
import type { SavedPlace } from "@/lib/places/saved";
import type { Display } from "@/lib/time/display";
import { GoalSetup, type SetupScreen } from "./GoalSetup";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const TODAY = "2026-11-16";
const GYM_PLACE: SavedPlace = { id: "p1", name: "Gym", address: "FitnessHut Lisboa" };

const GYM: Partial<SetupAnswers> = {
  ...chooseCategory(emptyAnswers("teal"), "sport"),
  title: "Gym",
  place: { kind: "saved", ...GYM_PLACE },
  dayPart: "evening",
  avoidDays: [5],
  hasDate: true,
  deadline: "2026-12-12",
};

function render(screen: SetupScreen, answers: Partial<SetupAnswers> = {}, options: { display?: Display; goals?: GoalView[]; open?: boolean } = {}) {
  const dialog = (
    <GoalSetup
      open={options.open ?? true}
      onClose={() => {}}
      onUseForm={() => {}}
      goals={options.goals ?? []}
      places={[GYM_PLACE]}
      today={TODAY}
      initialScreen={screen}
      initialAnswers={answers}
    />
  );
  return renderToStaticMarkup(options.display ? <DisplayProvider value={options.display}>{dialog}</DisplayProvider> : dialog);
}

const radios = (html: string) => html.match(/<button[^>]*role="radio"[^>]*>/g) ?? [];
const checked = (html: string) => radios(html).filter((r) => r.includes('aria-checked="true"'));
const continueButton = (html: string) => html.match(/<button[^>]*aria-describedby="goal-setup-why-not"[^>]*>(Continue|Review)<\/button>/)?.[0] ?? "";

describe("the frame", () => {
  it("is a dialog with a name, Close, the progress in words and the placeholder goal", () => {
    const html = render("category");
    expect(html).toMatch(/^<dialog aria-labelledby="goal-setup-name"[^>]*class="goal-setup /);
    expect(html).toContain('<span id="goal-setup-name" class="sr-only">New goal</span>');
    expect(html).toContain('aria-label="Close"');
    expect(html).toContain("Question 1 of 6");
    expect(html).toContain("Your new goal");
    expect(html).not.toContain(">Back<");
    // Six segments, none tinted yet, the first one filled in ink.
    expect(html.match(/class="setup-segment /g)).toHaveLength(6);
    expect(html.match(/setup-segment [^"]*bg-ink[^"]*" style="transform:scaleX\(1\)/g)).toHaveLength(1);
  });

  it("renders nothing inside while closed", () => {
    const html = render("category", {}, { open: false });
    expect(html).not.toContain("What is this goal about?");
  });

  it("from the second question on has Back, and the goal's tile, name and tags", () => {
    const html = render("often", GYM);
    expect(html).toContain(">Back</button>");
    expect(html).toContain("Question 2 of 6");
    expect(html).toContain('aria-label="Your goal so far"');
    expect(html).toContain('aria-label="3 times a week. Change"');
    expect(html).toContain(">3× a week</span>");
    expect(html).toContain(">60 min</span>");
    // The tile in the goal's colour and the bar filled up to this question in it.
    expect(html).toContain("bg-teal-50 text-teal-700");
    expect(html.match(/setup-segment [^"]*bg-teal-500[^"]*" style="transform:scaleX\(1\)/g)).toHaveLength(2);
    expect(html).toContain("from-teal-50");
  });
});

describe("Q1: what it is about", () => {
  it("offers five cards as one radio group, none chosen, and 'Use the form instead'; Continue waits", () => {
    const html = render("category");
    expect(html).toContain("What is this goal about?");
    expect(html).toMatch(/<div role="radiogroup" aria-labelledby="setup-category-title"/);
    expect(radios(html)).toHaveLength(5);
    expect(checked(html)).toHaveLength(0);
    for (const line of ["Training, running, the gym", "Studying, exams, a thesis", "A job, a project, a side business", "Reading, music, people, rest", "Anything else"]) {
      expect(html).toContain(line);
    }
    expect(html).toContain(">Use the form instead</button>");
    expect(continueButton(html)).toMatch(/disabled=""/);
    expect(html).not.toContain("Give it a name");
  });

  it("with Sport chosen: the name field, the name ideas, the dumbbell, and Continue once named", () => {
    const html = render("category", GYM);
    expect(checked(html)[0]).toContain('id="setup-category-category-sport"');
    expect(html).toMatch(/<label for="setup-category-name"[^>]*>Give it a name<\/label>/);
    expect(html).toMatch(/<input id="setup-category-name"[^>]*maxLength="80"[^>]*value="Gym"/);
    for (const idea of [">Gym<", ">Running<", ">Half marathon<"]) expect(html).toContain(idea);
    expect(html).toContain("lucide-dumbbell");
    expect(continueButton(html)).not.toMatch(/disabled=""/);
    expect(html).not.toContain("What kind? (optional)");
  });

  it("with Other: the optional own word, and no name ideas", () => {
    const html = render("category", { ...chooseCategory(emptyAnswers("rose"), "other"), title: "Band" });
    expect(html).toContain("What kind? (optional)");
    expect(html).toMatch(/<input id="setup-category-other"[^>]*maxLength="30"/);
    expect(html).not.toContain('aria-label="Name ideas"');
  });
});

describe("Q2: how often and how long", () => {
  it("has the stepper with seven dots, the minute chips, and the sum", () => {
    const html = render("often", GYM);
    expect(html).toContain("How often, and for how long?");
    expect(html).toMatch(/role="spinbutton" tabindex="0" aria-label="Times a week" aria-valuemin="1" aria-valuemax="6" aria-valuenow="3"/);
    expect(html.match(/setup-dot-on/g)).toHaveLength(3);
    expect(html.match(/setup-dot-(on|off)/g)).toHaveLength(7);
    expect(checked(html).join("")).toContain('id="setup-often-minutes-60"');
    expect(radios(html)).toHaveLength(5);
    for (const chip of [">30 min<", ">45 min<", ">1 h<", ">2 h<", ">Custom<"]) expect(html).toContain(chip);
    expect(html).toContain("3 × 60 min = <strong");
    expect(html).toContain("3 times 60 minutes is 3 h a week");
    expect(html).not.toContain("Make sure it fits");
  });

  it("says how many days are left when days are ruled out, and the plus stops there", () => {
    const html = render("often", { ...GYM, avoidDays: [5, 6], timesPerWeek: 5 });
    expect(html).toContain("5 days are left after the days you ruled out.");
    expect(html).toMatch(/<button type="button" aria-label="One more a week" disabled=""/);
  });

  it("after going back from the days with too many sessions: says so and waits", () => {
    const html = render("often", { ...GYM, avoidDays: [1, 2, 3, 4], timesPerWeek: 5 });
    expect(html).toContain("You planned 5 sessions a week, but only 3 days are left. Free a day, or go back and plan fewer.");
    expect(continueButton(html)).toMatch(/disabled=""/);
  });

  it("opens 'Custom' with the wheel for a length that is not a chip, and hints above 20 hours", () => {
    const html = render("often", { ...GYM, avoidDays: [], timesPerWeek: 7, sessionMinutes: 195 });
    expect(checked(html).join("")).toContain('id="setup-often-minutes-other"');
    expect(html).toContain('aria-label="Length of each session"');
    expect(html).toContain("That is 22 h 45 min a week for one goal. Make sure it fits.");
    expect(html).not.toContain("Choose at least 1 minute.");
  });

  it("a custom 6 hours is fine; at 0:00 Continue stays pressable and the red sentence waits for it", () => {
    expect(continueButton(render("often", { ...GYM, sessionMinutes: 360 }))).not.toMatch(/disabled=""/);
    const zero = render("often", { ...GYM, sessionMinutes: 0 });
    expect(zero).not.toMatch(/text-danger">Choose at least 1 minute\./);
    expect(continueButton(zero)).not.toMatch(/disabled=""/);
  });
});

describe("Q3: where", () => {
  it("offers home, each saved place and another address, with the travel-time line", () => {
    const html = render("place", { ...GYM, place: { kind: "home" } });
    expect(html).toContain("Where does it happen?");
    expect(html).toContain("The app uses this for travel time. It is not sent to the AI.");
    expect(radios(html)).toHaveLength(3);
    expect(checked(html)[0]).toContain('id="setup-place-place-home"');
    expect(html).toContain("FitnessHut Lisboa");
    expect(html).not.toContain('role="combobox"');
    expect(continueButton(html)).not.toMatch(/disabled=""/);
  });

  it("shows the address field with suggestions for another address", () => {
    const html = render("place", { ...GYM, place: { kind: "address" }, address: "Rua Augusta 10" });
    expect(html).toMatch(/<input aria-label="Address" id="setup-place-address"[^>]*role="combobox"[^>]*value="Rua Augusta 10"/);
  });
});

describe("Q4: when", () => {
  it("offers Any time, Morning, Afternoon, Evening and Custom in that order, none chosen at first", () => {
    const html = render("when", { ...GYM, dayPart: null });
    expect(html).toContain("When does it suit you best?");
    expect(radios(html)).toHaveLength(5);
    expect(checked(html)).toHaveLength(0);
    const order = ["-any\"", "-morning\"", "-afternoon\"", "-evening\"", "-custom\""].map((id) => html.indexOf(id));
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    for (const text of ["Before 12pm", "12 – 5pm", "After 5pm", "Whenever it fits", "Choose your own time"]) expect(html).toContain(text);
  });

  it("Custom shows From and Until with the visible hours only; a bad window waits for Continue", () => {
    const html = render("when", { ...GYM, dayPart: "custom", customFrom: 390, customUntil: 480 }, { display: { timeFormat: "24h", dayStartHour: 6, dayEndHour: 22 } });
    expect(html).toContain('aria-label="From time"');
    expect(html).toContain('aria-label="Until time"');
    const hours = /aria-label="From hour"(.*?)<\/div><\/div>/s.exec(html)![1];
    expect(hours.match(/role="option"/g)).toHaveLength(17);
    expect(html).toContain("6:30 – 8:00");
    const bad = render("when", { ...GYM, dayPart: "custom", customFrom: 480, customUntil: 420 });
    expect(bad).not.toMatch(/text-danger">The end has to be after the start\./);
    expect(continueButton(bad)).not.toMatch(/disabled=""/);
  });

  it("writes the times in 24 hours, and hints when an evening session runs past the visible day", () => {
    const html = render("when", { ...GYM, sessionMinutes: 240 }, { display: { timeFormat: "24h", dayStartHour: 7, dayEndHour: 20 } });
    for (const text of ["Before 12:00", "12:00 – 17:00", "After 17:00"]) expect(html).toContain(text);
    expect(checked(html)[0]).toContain('id="setup-when-when-evening"');
    expect(html).toContain("A 4 h session from 17:00 runs past 20:00, the end of your visible day.");
  });
});

describe("Q5: the days", () => {
  it("has seven day buttons with their state in words, a strike through the ruled-out ones", () => {
    const html = render("days", GYM);
    expect(html).toContain("Which days work for you?");
    expect(html).toContain('aria-label="Friday: never"');
    expect(html).toContain('aria-label="Monday: possible"');
    expect(html.match(/aria-label="[A-Za-z]+day: (never|possible)"/g)).toHaveLength(7);
    expect(html.match(/setup-strike/g)).toHaveLength(1);
    expect(html).toContain("6 days left · 3 sessions planned");
    expect(continueButton(html)).not.toMatch(/disabled=""/);
  });

  it("has a row of days for sure above; a sure day is greyed out below and a day off greyed out above", () => {
    const html = render("days", { ...GYM, mustDays: [1] });
    expect(html.indexOf("Days for sure")).toBeLessThan(html.indexOf("Never on these days"));
    expect(html).toContain("Up to 3 days");
    expect(html).toMatch(/aria-label="Monday: for sure" aria-pressed="true"/);
    expect(html).toMatch(/aria-label="Monday: a day for sure" aria-pressed="false" disabled=""/);
    expect(html).toMatch(/aria-label="Friday: off limits" aria-pressed="false" disabled=""/);
    expect(continueButton(html)).not.toMatch(/disabled=""/);
  });

  it("blocks Continue with a sentence that says why and what to do", () => {
    const html = render("days", { ...GYM, timesPerWeek: 5, avoidDays: [1, 2, 3, 4] });
    expect(html).toContain("You planned 5 sessions a week, but only 3 days are left. Free a day, or go back and plan fewer.");
    expect(continueButton(html)).toMatch(/disabled=""/);
    expect(html).toContain('<span id="goal-setup-why-not" class="sr-only">You planned 5 sessions');
  });
});

describe("Q6: a date", () => {
  it("offers the two cards; nothing chosen, Review waits", () => {
    const html = render("date", { ...GYM, hasDate: null, deadline: "" });
    expect(html).toContain("Are you working towards a date?");
    expect(radios(html)).toHaveLength(2);
    expect(continueButton(html)).toMatch(/disabled=""[^>]*>Review<\/button>/);
  });

  it("with a date: the app's date field from today and the three quick chips", () => {
    const html = render("date", GYM);
    expect(checked(html)[0]).toContain('id="setup-date-date-choice-yes"');
    expect(html).toMatch(/<button id="setup-date-date" type="button"[^>]*aria-label="The date: Sat, Dec 12"/);
    for (const chip of ["In 4 weeks", "In 8 weeks", "In 12 weeks"]) expect(html).toContain(chip);
    expect(html).toContain('aria-label="Until Dec 12, 2026. Change"');
    expect(continueButton(html)).toMatch(/>Review<\/button>/);
    expect(continueButton(html)).not.toMatch(/disabled=""/);
  });
});

describe("the review", () => {
  it("shows the tile, the name, the routine in one sentence, each answer with Change, and Create goal", () => {
    const html = render("review", GYM);
    expect(html).toContain(">Gym</h2>");
    expect(html).toContain("3 times a week, 60 minutes each, in the evening, never on Fridays, at FitnessHut Lisboa, until Dec 12, 2026.");
    for (const label of ["name", "how often", "where", "when", "days", "until"]) expect(html).toContain(`aria-label="Change ${label}"`);
    expect(html).toContain(">Create goal</button>");
    expect(html).not.toContain("Question ");
  });

  it("offers the ten colours and icons, auto-block (off) with its line, and Why it matters", () => {
    const html = render("review", GYM);
    expect(html).toContain('aria-label="Teal" aria-pressed="true"');
    expect(html).toContain('aria-label="Dumbbell" aria-pressed="true"');
    expect(html.match(/aria-pressed="(true|false)"/g)).toHaveLength(20);
    expect(html).toMatch(/<label for="setup-review-auto-block"[^>]*>Block distracting websites during these sessions<\/label>/);
    expect(html).not.toMatch(/id="setup-review-auto-block"[^>]*checked=""/);
    expect(html).toMatch(/<input id="setup-review-why"[^>]*maxLength="200"/);
  });

  it("hints when all goals together come to more than 40 hours, without blocking", () => {
    const busy = { rules: [{ id: "r", kind: "hours", target: 38, minMinutes: null }], look: { color: "rose", icon: "rocket" } } as unknown as GoalView;
    const html = render("review", GYM, { goals: [busy] });
    expect(html).toContain("All your goals together come to 41 hours a week.");
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Create goal/);
  });
});

describe("the celebration", () => {
  it("lands the tile with a ring and 16 pieces, says the goal is set and offers Done", () => {
    const html = render("done", GYM);
    expect(html).toContain(">Gym is set</h2>");
    expect(html.match(/class="setup-piece /g)).toHaveLength(16);
    expect(html).toContain("setup-ring");
    expect(html).toContain("setup-land");
    expect(html).toMatch(/<button type="button"[^>]*>Done<\/button>/);
    expect(html).not.toContain("Create goal");
    // The pieces fly on fixed paths: the same markup every time.
    expect(render("done", GYM)).toBe(html);
  });
});

describe("Q6 with the days ruled out", () => {
  it("refuses a date before which every day is ruled out, and hints when a near date leaves too few days", () => {
    const blocked = render("date", { ...GYM, deadline: "2026-11-17", avoidDays: [1, 2] });
    expect(blocked).toContain("Every day until Nov 17 is ruled out. Choose a later date, or free a day.");
    expect(continueButton(blocked)).toMatch(/disabled=""/);
    const tight = render("date", { ...GYM, deadline: "2026-11-17", avoidDays: [] });
    expect(tight).toContain("Until Nov 17 there are 2 free days for 3 sessions.");
    expect(continueButton(tight)).not.toMatch(/disabled=""/);
  });
});
