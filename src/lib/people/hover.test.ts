// The hover card's open and close rules (spec 33), as a state function.
import { describe, expect, it } from "vitest";
import { CLOSED, nextHover, type HoverEvent, type HoverState } from "./hover";

/** Runs events from the closed state; returns the last state and every timer asked for. */
function run(events: HoverEvent[], from: HoverState = CLOSED) {
  let state = from;
  const timers: (string | null)[] = [];
  for (const event of events) {
    const step = nextHover(state, event);
    state = step.state;
    timers.push(step.timer);
  }
  return { state, timers };
}

describe("hover card", () => {
  it("a mouse on the chip opens it only after the delay", () => {
    const entered = run(["chip-enter"]);
    expect(entered.state.open).toBe(false);
    expect(entered.timers).toEqual(["open"]);
    expect(run(["chip-enter", "open-delay-passed"]).state.open).toBe(true);
  });

  it("leaving the chip before the delay opens nothing", () => {
    const { state, timers } = run(["chip-enter", "chip-leave", "open-delay-passed"]);
    expect(state.open).toBe(false);
    expect(timers).toEqual(["open", "stop", null]);
  });

  it("stays open while the pointer crosses from the chip to the card, and while it is on the card", () => {
    const { state, timers } = run(["chip-enter", "open-delay-passed", "chip-leave", "card-enter", "close-delay-passed"]);
    expect(state.open).toBe(true);
    expect(timers).toEqual(["open", null, "close", "stop", null]);
  });

  it("closes after the short delay once the pointer has left chip and card", () => {
    const { state } = run(["chip-enter", "open-delay-passed", "chip-leave", "card-enter", "card-leave", "close-delay-passed"]);
    expect(state.open).toBe(false);
  });

  it("coming back before the close delay keeps it open", () => {
    const { state } = run(["chip-enter", "open-delay-passed", "chip-leave", "chip-enter", "close-delay-passed"]);
    expect(state.open).toBe(true);
  });

  it("keyboard focus opens it at once; leaving with the focus closes it at once", () => {
    const focused = run(["focus-in"]);
    expect(focused.state.open).toBe(true);
    expect(focused.timers).toEqual(["stop"]);
    const left = run(["focus-in", "focus-out"]);
    expect(left.state.open).toBe(false);
  });

  it("the focus leaving does not close it while the pointer is still over chip or card", () => {
    expect(run(["chip-enter", "open-delay-passed", "focus-in", "focus-out"]).state.open).toBe(true);
  });

  it("the pointer leaving does not close it while the focus is inside", () => {
    expect(run(["focus-in", "chip-enter", "chip-leave", "close-delay-passed"]).state.open).toBe(true);
  });

  it("Escape closes it at once, also with the pointer still on the chip; entering again opens it again", () => {
    const escaped = run(["chip-enter", "open-delay-passed", "escape"]);
    expect(escaped.state.open).toBe(false);
    expect(escaped.timers[2]).toBe("stop");
    expect(run(["chip-leave", "chip-enter", "open-delay-passed"], escaped.state).state.open).toBe(true);
  });
});
