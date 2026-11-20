// Spec 43 (R45): the fixed instructions on planning with a goal's routine.
import { describe, expect, it } from "vitest";
import { DAY_PART_HOURS } from "@/lib/goals/routine";
import { ANSWER_JSON_SCHEMA, SYSTEM_PROMPT } from "./prompt";

const section = () => {
  const start = SYSTEM_PROMPT.indexOf("Planning for the person's goals");
  const end = SYSTEM_PROMPT.indexOf("Questions about the past");
  return SYSTEM_PROMPT.slice(start, end);
};

describe("the system prompt on goal routines", () => {
  it("has the section, between the to-dos and the questions about the past", () => {
    expect(SYSTEM_PROMPT.indexOf("Planning for the person's goals")).toBeGreaterThan(SYSTEM_PROMPT.indexOf("Adding to-dos to events already"));
    expect(section().length).toBeGreaterThan(100);
  });

  it("explains every new key and the hours of the parts of the day as the app keeps them", () => {
    for (const key of ["\"category\"", "\"categoryOther\"", "\"sessionMinutes\"", "\"dayPart\"", "\"never\"", "\"neverDates\"", "\"away\": true", "\"weeks\"", "\"left\""]) {
      expect(section(), key).toContain(key);
    }
    const hour = (h: number) => `${String(h).padStart(2, "0")}:00`;
    expect(section()).toContain(`"morning" (starts before ${hour(DAY_PART_HOURS.morning.until)})`);
    expect(section()).toContain(`"afternoon" (from ${hour(DAY_PART_HOURS.afternoon.from)} to before ${hour(DAY_PART_HOURS.afternoon.until)})`);
    expect(section()).toContain(`"evening" (from ${hour(DAY_PART_HOURS.evening.from)})`);
  });

  it("says how to plan: what is left, the length, at most one a day, the never days, the way there, what did not fit", () => {
    for (const phrase of [
      "60 when there is none",
      "the goal's title as its title and the goal's id as \"goalId\"",
      "Never plan more sessions of a goal in a week than its \"left\"",
      "at most one session of a goal per day",
      "Never plan a session of a goal on one of its \"neverDates\"",
      "they can change this in the goal",
      "at least its \"travelMinutes\" (30 minutes when it has none) free before and after",
      "never plan anything between its \"leaveBy\" and its start",
      "what did not fit and why",
      "Do not move the person's other events to make room unless they ask",
      "only asks a question or only asks for one specific thing",
      "A goal without \"weeks\" has no routine",
    ]) {
      expect(section(), phrase).toContain(phrase);
    }
  });

  it("names the new keys in the paragraph on the data", () => {
    expect(SYSTEM_PROMPT.slice(SYSTEM_PROMPT.indexOf("The data"))).toContain("for a goal with a routine");
  });

  it("is still fixed text with no user data: no placeholders and no date-time but the one example", () => {
    expect(section()).not.toMatch(/\$\{|\{\{|\d{4}-\d{2}-\d{2}/);
    expect(SYSTEM_PROMPT.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/g)).toEqual(["2026-11-14T09:00"]);
  });

  it("does not change the answer format", () => {
    expect(ANSWER_JSON_SCHEMA.required).toEqual(["kind", "text", "events", "changes", "addTodos"]);
    expect(ANSWER_JSON_SCHEMA.properties.events.items.required).toEqual(["title", "start", "end", "goalId", "todos"]);
  });
});
