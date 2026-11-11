"use client";

// The goals panel (spec 03): the user's goals with their progress, and "New goal".
// Wide screens: a column beside the calendar that collapses (toolbar button "Goals").
// Smaller screens: the same content as a sheet from the bottom, opened by the same button.
import { useEffect, useRef, useState } from "react";
import { usePanels } from "@/components/shell/PanelState";
import { Button } from "@/components/ui/Button";
import { Close, Plus } from "@/components/ui/icons";
import type { GoalView } from "@/lib/goals/types";
import { GoalCard } from "./GoalCard";
import { GoalEditor, type GoalEditorState } from "./GoalEditor";

type Props = { goals: GoalView[]; today: string };

type ContentProps = {
  titleId: string;
  goals: GoalView[];
  onNew: () => void;
  onOpen: (goal: GoalView) => void;
  onClose: () => void;
  closeLabel: string;
};

function PanelContent({ titleId, goals, onNew, onOpen, onClose, closeLabel }: ContentProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 px-4 pt-5 pb-3">
        <h2 id={titleId} className="min-w-0 flex-1 text-[15px] font-semibold text-ink">
          Goals
        </h2>
        <Button variant="ghost" size="icon" className="size-8" aria-label="New goal" title="New goal" onClick={onNew}>
          <Plus />
        </Button>
        <Button variant="ghost" size="icon" className="size-8" aria-label={closeLabel} title={closeLabel} onClick={onClose}>
          <Close />
        </Button>
      </div>
      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-4">
        {goals.length === 0 ? (
          <div className="rounded-card border border-dashed border-line p-4 text-sm text-ink-2">
            <p>No goals yet. Add one, link events to it, and see each week here.</p>
            <Button size="sm" className="mt-3" onClick={onNew}>
              <Plus className="size-3.5" />
              New goal
            </Button>
          </div>
        ) : (
          goals.map((goal) => <GoalCard key={goal.id} goal={goal} onOpen={() => onOpen(goal)} />)
        )}
      </div>
    </div>
  );
}

export function GoalsPanel({ goals, today }: Props) {
  const panels = usePanels();
  const [editor, setEditor] = useState<GoalEditorState>(null);
  const sheet = useRef<HTMLDialogElement>(null);
  const sheetOpen = panels.sheet === "goals";

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
        <aside aria-labelledby="goals-panel-title" className="sticky top-0 hidden h-dvh w-[300px] shrink-0 border-l border-line-subtle bg-canvas xl:block">
          <PanelContent
            titleId="goals-panel-title"
            goals={goals}
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
