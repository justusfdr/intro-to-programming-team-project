// When the hover card of a PersonChip (spec 33) is open, as a small state function without React or
// timers, so the rules can be tested:
// - a mouse resting on the chip opens it after a short delay (OPEN_DELAY_MS);
// - keyboard focus on the chip opens it at once;
// - it stays open while the pointer is over the chip or the card, or the focus is in either;
// - it closes shortly after the pointer has left both (CLOSE_DELAY_MS, so the pointer can cross the gap
//   between chip and card), at once on Escape, and at once when the focus leaves both;
// - touch has no hover: the component never sends pointer events of a touch, so a tap just follows the
//   chip's link to the profile.
// The component runs the timer the answer asks for and sends "open-delay-passed" or "close-delay-passed".

export const OPEN_DELAY_MS = 300;
export const CLOSE_DELAY_MS = 150;

export type HoverState = { open: boolean; overChip: boolean; overCard: boolean; focused: boolean };
export const CLOSED: HoverState = { open: false, overChip: false, overCard: false, focused: false };

export type HoverEvent =
  | "chip-enter"
  | "chip-leave"
  | "card-enter"
  | "card-leave"
  | "focus-in"
  | "focus-out"
  | "escape"
  | "open-delay-passed"
  | "close-delay-passed";

/** What to do with the timer: start the open or the close delay, stop any running one, or leave it. */
export type HoverTimer = "open" | "close" | "stop" | null;

export function nextHover(state: HoverState, event: HoverEvent): { state: HoverState; timer: HoverTimer } {
  const engaged = (s: HoverState) => s.overChip || s.overCard || s.focused;
  switch (event) {
    case "chip-enter": {
      const next = { ...state, overChip: true };
      return { state: next, timer: state.open ? "stop" : "open" };
    }
    case "card-enter":
      return { state: { ...state, overCard: true }, timer: "stop" };
    case "chip-leave":
    case "card-leave": {
      const next = event === "chip-leave" ? { ...state, overChip: false } : { ...state, overCard: false };
      if (engaged(next)) return { state: next, timer: null };
      // Not open yet: the open delay stops and nothing opens.
      return next.open ? { state: next, timer: "close" } : { state: next, timer: "stop" };
    }
    case "focus-in":
      return { state: { ...state, focused: true, open: true }, timer: "stop" };
    case "focus-out": {
      const next = { ...state, focused: false };
      return next.overChip || next.overCard ? { state: next, timer: null } : { state: { ...next, open: false }, timer: "stop" };
    }
    case "escape":
      return { state: { ...state, open: false }, timer: "stop" };
    case "open-delay-passed":
      return { state: state.overChip || state.overCard ? { ...state, open: true } : state, timer: null };
    case "close-delay-passed":
      return { state: engaged(state) ? state : { ...state, open: false }, timer: null };
  }
}
