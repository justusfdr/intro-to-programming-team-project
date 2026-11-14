"use client";

// The goals panel (spec 03, look from spec 10): the user's goals as open sections with their
// progress and their tasks (spec 11), each collapsible, "New goal", and at the bottom "Inbox" for
// tasks without a goal.
// Wide screens: a column beside the calendar that collapses (toolbar button "Goals").
// Smaller screens: the same content as a sheet from the bottom, opened by the same button.
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { usePanels } from "@/components/shell/PanelState";
import { Button } from "@/components/ui/Button";
import { ChevronRight, Plus, Target, X } from "lucide-react";
import { COLLAPSED_KEY, readCollapsed, toggleCollapsed } from "@/lib/goals/collapsed";
import { nextGoalColor } from "@/lib/goals/style";
import type { GoalView } from "@/lib/goals/types";
import { useLiveTasks } from "@/components/live/Live";
import { openCount, sortTasks } from "@/lib/tasks/order";
import type { TaskDto } from "@/lib/tasks/types";
import { GoalCard, OpenTaskCount } from "./GoalCard";
import { GoalEditor, type GoalEditorState } from "./GoalEditor";
import { GoalTile } from "./GoalTile";
import { TaskList, type GoalOption } from "./TaskList";

type Props = { goals: GoalView[]; tasks: TaskDto[]; today: string };

/** The key under which the Inbox section's collapsed state is remembered (next to goal ids). */
const INBOX_KEY = "inbox";

/** Tasks per goal id, and the Inbox (no goal, or a goal this list does not know). Each in R33's order. */
function groupTasks(goals: GoalView[], tasks: TaskDto[]): { byGoal: Map<string, TaskDto[]>; inbox: TaskDto[] } {
  const known = new Set(goals.map((goal) => goal.id));
  const byGoal = new Map<string, TaskDto[]>();
  const inbox: TaskDto[] = [];
  for (const task of sortTasks(tasks)) {
    if (task.goalId !== null && known.has(task.goalId)) byGoal.set(task.goalId, [...(byGoal.get(task.goalId) ?? []), task]);
    else inbox.push(task);
  }
  return { byGoal, inbox };
}

type ContentProps = {
  titleId: string;
  goals: GoalView[];
  tasks: TaskDto[];
  today: string;
  collapsed: string[];
  onToggle: (goalId: string) => void;
  onNew: () => void;
  onOpen: (goal: GoalView) => void;
  onClose: () => void;
  closeLabel: string;
};

function PanelContent({ titleId, goals, tasks, today, collapsed, onToggle, onNew, onOpen, onClose, closeLabel }: ContentProps) {
  const { byGoal, inbox } = groupTasks(goals, tasks);
  const goalOptions: GoalOption[] = goals.map(({ id, title }) => ({ id, title }));
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 px-4 pt-5 pb-2">
        <h2 id={titleId} className="min-w-0 flex-1 text-[15px] font-semibold tracking-snug text-ink">
          Goals
        </h2>
        <Button variant="ghost" size="icon" className="size-8 text-ink-3" aria-label="New goal" title="New goal" onClick={onNew}>
          <Plus className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" className="size-8 text-ink-3" aria-label={closeLabel} title={closeLabel} onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-1 pb-6">
        {goals.length === 0 && <p className="text-sm text-ink-2">No goals yet. Add one, link events to it, and see each week here.</p>}
        {goals.map((goal) => {
          const own = byGoal.get(goal.id) ?? [];
          return (
            <GoalCard
              key={goal.id}
              goal={goal}
              onOpen={() => onOpen(goal)}
              collapsed={collapsed.includes(goal.id)}
              onToggle={() => onToggle(goal.id)}
              openTasks={openCount(own)}
            >
              <TaskList tasks={own} goalId={goal.id} color={goal.look.color} sectionTitle={goal.title} today={today} goals={goalOptions} />
            </GoalCard>
          );
        })}
        <button
          type="button"
          onClick={onNew}
          className="-mx-1 flex h-8 items-center gap-2.5 rounded-md px-1 text-left text-[14px] text-ink-3 transition-colors hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
        >
          <Plus className="size-4" />
          New goal
        </button>
        <InboxSection
          tasks={inbox}
          today={today}
          goals={goalOptions}
          collapsed={collapsed.includes(INBOX_KEY)}
          onToggle={() => onToggle(INBOX_KEY)}
        />
      </div>
    </div>
  );
}

/** Tasks without a goal (R32), always at the bottom, also when there are no goals. Grey tile and bar. */
function InboxSection({
  tasks,
  today,
  goals,
  collapsed,
  onToggle,
}: {
  tasks: TaskDto[];
  today: string;
  goals: GoalOption[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  const bodyId = useId();
  return (
    <section aria-label="Inbox" className="mt-2 pb-4">
      <div className="flex min-h-9 items-center gap-1.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          aria-label={`${collapsed ? "Expand" : "Collapse"} Inbox`}
          title={collapsed ? "Expand" : "Collapse"}
          className="-ml-1 flex size-6 shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
        >
          <ChevronRight className={`size-3.5 transition-transform ${collapsed ? "" : "rotate-90"}`} strokeWidth={2.2} />
        </button>
        <GoalTile look={null} inbox />
        <h3 className="ml-1 min-w-0 flex-1 truncate text-[15px] font-semibold tracking-snug text-ink">Inbox</h3>
        <OpenTaskCount count={openCount(tasks)} />
      </div>
      <div aria-hidden className="mt-1.5 h-[3px] rounded-full bg-muted" />
      {!collapsed && (
        <div id={bodyId}>
          <TaskList tasks={tasks} goalId={null} color={null} sectionTitle="Inbox" today={today} goals={goals} />
        </div>
      )}
    </section>
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

export function GoalsPanel({ goals, tasks: serverTasks, today }: Props) {
  // The tasks with the changes of actions whose re-read has not arrived yet (components/live/Live.tsx).
  const tasks = useLiveTasks(serverTasks);
  const panels = usePanels();
  const [editor, setEditor] = useState<GoalEditorState>(null);
  const sheet = useRef<HTMLDialogElement>(null);
  const sheetOpen = panels.sheet === "goals";
  const [collapsed, toggle] = useCollapsed([...goals.map((goal) => goal.id), INBOX_KEY]);

  useEffect(() => {
    const element = sheet.current;
    if (!element) return;
    if (sheetOpen && !element.open) element.showModal();
    if (!sheetOpen && element.open) element.close();
  }, [sheetOpen]);

  const newGoal = () => {
    panels.openSheet(null);
    setEditor({ mode: "create", today, color: nextGoalColor(goals.map((goal) => goal.look.color)) });
  };

  const openGoal = (goal: GoalView) => {
    panels.openSheet(null);
    setEditor({ mode: "edit", goal, today });
  };

  return (
    <>
      {panels.isOpen("goals") && (
        <aside aria-labelledby="goals-panel-title" className="sticky top-0 hidden h-dvh w-[280px] shrink-0 overflow-y-auto overscroll-contain border-r border-line-subtle bg-canvas xl:block">
          <PanelContent
            titleId="goals-panel-title"
            goals={goals}
            tasks={tasks}
            today={today}
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
            tasks={tasks}
            today={today}
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

/** The prototype's round panel toggle (target icon); with its name once the calendar column is wide. */
function toggleClass(active: boolean): string {
  return `inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-full border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 @3xl:px-3 ${
    active ? "border-line bg-raised text-ink" : "border-line bg-surface text-ink-2 hover:bg-raised hover:text-ink"
  }`;
}

/**
 * The toolbar button, as in the prototype: collapses or shows the column on wide screens, opens the
 * sheet on smaller ones.
 */
export function GoalsToggle() {
  const panels = usePanels();
  const open = panels.isOpen("goals");
  // The wrappers decide which button shows (a class on the button itself would fight its own display).
  return (
    <>
      <div className="hidden xl:block">
        <button
          type="button"
          aria-label="Goals"
          title={`${open ? "Hide" : "Show"} goals`}
          aria-pressed={open}
          onClick={() => panels.toggle("goals")}
          className={toggleClass(open)}
        >
          <Target className="size-4" strokeWidth={2} />
          <span className="hidden @3xl:inline">Goals</span>
        </button>
      </div>
      <div className="xl:hidden">
        <button
          type="button"
          aria-label="Goals"
          title="Open goals"
          aria-haspopup="dialog"
          aria-expanded={panels.sheet === "goals"}
          onClick={() => panels.openSheet("goals")}
          className={toggleClass(panels.sheet === "goals")}
        >
          <Target className="size-4" strokeWidth={2} />
          <span className="hidden @3xl:inline">Goals</span>
        </button>
      </div>
    </>
  );
}
