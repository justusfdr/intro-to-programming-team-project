"use client";

// The goals panel (spec 03, look from spec 10): the user's goals as open sections with their
// progress, each collapsible, and "New goal".
// Wide screens: a column beside the calendar that collapses (toolbar button "Goals").
// Smaller screens: the same content as a sheet from the bottom, opened by the same button.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePanels } from "@/components/shell/PanelState";
import { Button } from "@/components/ui/Button";
import { Close, Plus } from "@/components/ui/icons";
import { COLLAPSED_KEY, readCollapsed, toggleCollapsed } from "@/lib/goals/collapsed";
import type { GoalView } from "@/lib/goals/types";
import { GoalCard } from "./GoalCard";
import { GoalEditor, type GoalEditorState } from "./GoalEditor";

type Props = { goals: GoalView[]; today: string };

type ContentProps = {
  titleId: string;
  goals: GoalView[];
  collapsed: string[];
  onToggle: (goalId: string) => void;
  onNew: () => void;
  onOpen: (goal: GoalView) => void;
  onClose: () => void;
  closeLabel: string;
};

function PanelContent({ titleId, goals, collapsed, onToggle, onNew, onOpen, onClose, closeLabel }: ContentProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 px-4 pt-5 pb-2">
        <h2 id={titleId} className="min-w-0 flex-1 text-[15px] font-semibold tracking-snug text-ink">
          Goals
        </h2>
        <Button variant="ghost" size="icon" className="size-8 text-ink-3" aria-label="New goal" title="New goal" onClick={onNew}>
          <Plus />
        </Button>
        <Button variant="ghost" size="icon" className="size-8 text-ink-3" aria-label={closeLabel} title={closeLabel} onClick={onClose}>
          <Close />
        </Button>
      </div>
      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-1 pb-6">
        {goals.length === 0 && <p className="text-sm text-ink-2">No goals yet. Add one, link events to it, and see each week here.</p>}
        {goals.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            onOpen={() => onOpen(goal)}
            collapsed={collapsed.includes(goal.id)}
            onToggle={() => onToggle(goal.id)}
          />
        ))}
        <button
          type="button"
          onClick={onNew}
          className="-mx-1 flex h-8 items-center gap-2.5 rounded-md px-1 text-left text-[14px] text-ink-3 transition-colors hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
        >
          <Plus className="size-4" />
          New goal
        </button>
      </div>
    </div>
  );
}

// Collapsed goal sections, remembered in this browser (spec 10). The server and the browser's first
// render see nothing stored, so both start with every section open.
const COLLAPSED_CHANGED = "goals-collapsed-changed";
/** Used when the browser blocks storage: the choice then lasts until the page reloads. */
let inMemory: string | null = null;

function readStored(): string | null {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) ?? inMemory;
  } catch {
    return inMemory;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(COLLAPSED_CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(COLLAPSED_CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function useCollapsed(goalIds: string[]): [string[], (goalId: string) => void] {
  const stored = useSyncExternalStore(subscribe, readStored, () => null);
  const collapsed = readCollapsed(stored, goalIds);
  const toggle = (goalId: string) => {
    const next = JSON.stringify(toggleCollapsed(collapsed, goalId));
    inMemory = next;
    try {
      window.localStorage.setItem(COLLAPSED_KEY, next);
    } catch {
      // Storage blocked or full: the choice is kept in memory only.
    }
    window.dispatchEvent(new Event(COLLAPSED_CHANGED));
  };
  return [collapsed, toggle];
}

export function GoalsPanel({ goals, today }: Props) {
  const panels = usePanels();
  const [editor, setEditor] = useState<GoalEditorState>(null);
  const sheet = useRef<HTMLDialogElement>(null);
  const sheetOpen = panels.sheet === "goals";
  const [collapsed, toggle] = useCollapsed(goals.map((goal) => goal.id));

  useEffect(() => {
    const element = sheet.current;
    if (!element) return;
    if (sheetOpen && !element.open) element.showModal();
    if (!sheetOpen && element.open) element.close();
  }, [sheetOpen]);

  const newGoal = () => {
    panels.openSheet(null);
    setEditor({ mode: "create", today });
  };

  const openGoal = (goal: GoalView) => {
    panels.openSheet(null);
    setEditor({ mode: "edit", goal, today });
  };

  return (
    <>
      {panels.isOpen("goals") && (
        <aside aria-labelledby="goals-panel-title" className="sticky top-0 hidden h-dvh w-[280px] shrink-0 border-r border-line-subtle bg-canvas xl:block">
          <PanelContent
            titleId="goals-panel-title"
            goals={goals}
            collapsed={collapsed}
            onToggle={toggle}
            onNew={newGoal}
            onOpen={openGoal}
            onClose={() => panels.toggle("goals")}
            closeLabel="Collapse goals"
          />
        </aside>
      )}
      <dialog
        ref={sheet}
        aria-labelledby="goals-sheet-title"
        onClose={() => panels.openSheet(null)}
        onClick={(event) => event.target === sheet.current && panels.openSheet(null)}
        className="event-editor m-0 mt-auto h-[80dvh] max-h-none w-full max-w-none overflow-hidden rounded-t-panel border border-line-subtle bg-canvas p-0 shadow-pop xl:hidden"
      >
        {sheetOpen && (
          <PanelContent
            titleId="goals-sheet-title"
            goals={goals}
            collapsed={collapsed}
            onToggle={toggle}
            onNew={newGoal}
            onOpen={openGoal}
            onClose={() => panels.openSheet(null)}
            closeLabel="Close goals"
          />
        )}
      </dialog>
      <GoalEditor state={editor} onClose={() => setEditor(null)} />
    </>
  );
}

/** The toolbar button: collapses or opens the panel on wide screens, opens the sheet on smaller ones. */
export function GoalsToggle() {
  const panels = usePanels();
  const open = panels.isOpen("goals");
  // The wrappers decide which button shows (a class on the button itself would fight its own display).
  return (
    <>
      <div className="hidden xl:block">
        <Button variant="secondary" className={open ? "border-ink" : ""} aria-expanded={open} onClick={() => panels.toggle("goals")}>
          Goals
        </Button>
      </div>
      <div className="xl:hidden">
        <Button variant="secondary" aria-haspopup="dialog" onClick={() => panels.openSheet("goals")}>
          Goals
        </Button>
      </div>
    </>
  );
}
