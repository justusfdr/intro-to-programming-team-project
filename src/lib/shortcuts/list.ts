// The keyboard shortcuts that exist in the app (spec 26), as the help dialog ("?") lists them.
// Only keys the code really handles belong here: each entry names the file that handles it, and
// list.test.ts checks every key against that file (and the calendar keys against `shortcutFor`).
// A later feature that adds a shortcut adds its line here.
import { isTypingTarget } from "@/lib/events/views";

export type Shortcut = {
  /** The keys as `KeyboardEvent.key` names them ("d", "ArrowLeft", "Escape", "?"). */
  keys: string[];
  /** What the keys do, in a few words. */
  does: string;
  /** The file whose code handles the keys (checked by the test). */
  source: string;
};

export type ShortcutGroup = { where: string; shortcuts: Shortcut[] };

export const SHORTCUTS: ShortcutGroup[] = [
  {
    where: "Every page",
    shortcuts: [
      { keys: ["?"], does: "Show this list", source: "src/lib/shortcuts/list.ts" },
      { keys: ["Escape"], does: "Close a dialog or an open card", source: "src/components/calendar/FloatingPanel.tsx" },
    ],
  },
  {
    where: "Calendar",
    shortcuts: [
      { keys: ["d"], does: "Day view", source: "src/lib/events/views.ts" },
      { keys: ["w"], does: "Week view (not on phones)", source: "src/lib/events/views.ts" },
      { keys: ["m"], does: "Month view", source: "src/lib/events/views.ts" },
      { keys: ["t"], does: "Go to today", source: "src/lib/events/views.ts" },
      { keys: ["ArrowLeft", "ArrowRight"], does: "Previous or next day, week or month", source: "src/lib/events/views.ts" },
      { keys: ["Escape"], does: "Cancel a drag", source: "src/components/calendar/TimeGrid.tsx" },
    ],
  },
  {
    where: "Event editor",
    shortcuts: [
      { keys: ["Escape"], does: "In the title: put back the title it had", source: "src/components/calendar/editor/EditorHeader.tsx" },
      { keys: ["ArrowUp", "ArrowDown"], does: "On a to-do's handle: move the to-do", source: "src/components/calendar/editor/TodoList.tsx" },
    ],
  },
  {
    where: "Coach",
    shortcuts: [
      { keys: ["Enter"], does: "Send the message (Shift + Enter: new line)", source: "src/components/coach/Composer.tsx" },
      { keys: ["Escape"], does: "Cancel dragging a block of a draft", source: "src/components/coach/DraftCard.tsx" },
    ],
  },
];

/** How a key is shown on its keycap. */
export function keyLabel(key: string): string {
  const names: Record<string, string> = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", Escape: "Esc", Enter: "Enter" };
  return names[key] ?? key.toUpperCase();
}

type KeyInfo = { key: string; target: EventTarget | null; ctrlKey: boolean; metaKey: boolean; altKey: boolean };

/**
 * True if a key press may count as a shortcut at all: not while typing in a field (input, textarea,
 * select, contenteditable) and not with Ctrl, Cmd or Alt held. Shift is allowed, since "?" needs it.
 */
export function mayUseShortcut(e: Omit<KeyInfo, "key">): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  return !isTypingTarget(e.target);
}

/** True if the key press opens (or closes) the shortcut help. */
export function isHelpKey(e: KeyInfo): boolean {
  return e.key === "?" && mayUseShortcut(e);
}
