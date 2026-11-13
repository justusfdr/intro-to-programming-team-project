// The fixed instructions and the answer format for moves and deletes (spec 20).
import { describe, expect, it } from "vitest";
import { AnswerShape } from "./checks";
import { ANSWER_JSON_SCHEMA, SYSTEM_PROMPT } from "./prompt";

describe("the answer format with changes", () => {
  it("asks for a list of changes with the same fields our own check expects", () => {
    expect(ANSWER_JSON_SCHEMA.required).toContain("changes");
    expect(ANSWER_JSON_SCHEMA.properties.changes.items.required).toEqual(Object.keys(AnswerShape.shape.changes.unwrap().element.shape));
    expect(ANSWER_JSON_SCHEMA.properties.changes.items.properties.action.enum).toEqual(["move", "delete"]);
  });
});

describe("the system prompt on changes", () => {
  it("allows moves and deletes only when asked, by reference, never of events flagged as not changeable, and says so in words", () => {
    for (const phrase of [
      "unless the person asks you to",
      "only by its \"ref\"",
      "Never change an event whose \"changeable\" is false",
      "say in \"text\" that you cannot change it",
      "no longer takes up its old time",
      "Change each event at most once",
      "put it back",
    ]) {
      expect(SYSTEM_PROMPT, phrase).toContain(phrase);
    }
  });
});
