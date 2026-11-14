// Folding the sidebar removes its collapse button while it has the keyboard focus, which would drop the
// focus onto the page. After a keyboard click the focus goes to the logo link, which stays.

/**
 * Moves the focus to `target` after a click on the collapse button that came from the keyboard.
 * A click from the keyboard has `detail` 0; a mouse click has 1 or more and is left alone.
 */
export function keepFocusAfterCollapse(clickDetail: number, target: { focus: () => void } | null): void {
  if (clickDetail === 0) target?.focus();
}
