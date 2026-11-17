"use client";

// The Goals page (spec 39): what the goals column beside the calendar showed (specs 03, 10, 11, 13),
// laid out for a whole page. The title "Goals" with "New goal"; one card per goal in a grid (one
// column on phones, two from 768 px, three from 1280 px) with its tile, title, this week's bar and
// rules, the strip of weeks, the countdown and its tasks; then "Inbox", tasks without a goal, as a
// card of its own. Each card can be collapsed, remembered in this browser as before (spec 10).
// Ticking, adding and editing tasks show at once; the page re-reads in the background (Live.tsx).
// Spec 42: "New goal" opens the guided questions (setup/GoalSetup.tsx); their first question offers
// "Use the form instead", which opens the goal editor for a new goal. Editing a goal opens the editor.
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { useLiveTasks } from "@/components/live/Live";
import { Button } from "@/components/ui/Button";
import { COLLAPSED_KEY, readCollapsed, toggleCollapsed } from "@/lib/goals/collapsed";
import { nextGoalColor } from "@/lib/goals/style";
import type { GoalView } from "@/lib/goals/types";
import type { SavedPlace } from "@/lib/places/saved";
import { openCount, sortTasks } from "@/lib/tasks/order";
import type { TaskDto } from "@/lib/tasks/types";
import { GoalCard, OpenTaskCount } from "./GoalCard";
import { GoalEditor, type GoalEditorState } from "./GoalEditor";
import { GoalTile } from "./GoalTile";
import { GoalSetup } from "./setup/GoalSetup";
import { TaskList, type GoalOption } from "./TaskList";

type Props = {
  goals: GoalView[];
  tasks: TaskDto[];
  today: string;
  /** The saved places, offered as a goal's place (spec 42). */
  places?: SavedPlace[];
  /** Previews and tests only: open with the questions or the form for a new goal. */
  openOn?: "setup" | "form";
  /** Spec 47: the goal a widget in the sidebar was clicked for; the page scrolls to it and marks it. */
  focusGoalId?: string;
};

/** The key under which the Inbox card's collapsed state is remembered (next to goal ids). */
const INBOX_KEY = "inbox";

/** The frame of every card on the page. */
const CARD = "min-w-0 rounded-card border border-line-subtle bg-surface px-4 pt-3";

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

export function GoalsPage({ goals, tasks: serverTasks, today, places = [], openOn, focusGoalId }: Props) {
  // The tasks with the changes of actions whose re-read has not arrived yet (components/live/Live.tsx).
  const tasks = useLiveTasks(serverTasks);
  const newGoalState = (): GoalEditorState => ({ mode: "create", today, color: nextGoalColor(goals.map((goal) => goal.look.color)) });
  const [editor, setEditor] = useState<GoalEditorState>(() => (openOn === "form" ? newGoalState() : null));
  const [setupOpen, setSetupOpen] = useState(openOn === "setup");
  const [collapsed, toggle] = useCollapsed([...goals.map((goal) => goal.id), INBOX_KEY]);
  const { byGoal, inbox } = groupTasks(goals, tasks);
  const goalOptions: GoalOption[] = goals.map(({ id, title }) => ({ id, title }));
  // Spec 47: opened from a goal widget. The goal's card opens if it was folded, comes into view and is
  // marked for a moment.
  const [marked, setMarked] = useState<string | null>(null);
  useEffect(() => {
    if (!focusGoalId || !goals.some((goal) => goal.id === focusGoalId)) return;
    if (collapsed.includes(focusGoalId)) toggle(focusGoalId);
    // After the first paint, when the card has its place on the screen.
    let unmark = 0;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`goal-${focusGoalId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      setMarked(focusGoalId);
      unmark = window.setTimeout(() => setMarked(null), 2400);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(unmark);
    };
    // Only when the page opens for a goal, not on every change of the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusGoalId]);


  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-10">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-[28px] leading-[34px] font-semibold tracking-display text-ink md:text-[32px] md:leading-[38px]">Goals</h1>
        <Button onClick={() => setSetupOpen(true)}>
          <Plus className="size-4" aria-hidden />
          New goal
        </Button>
      </header>

      {goals.length === 0 && <p className="mt-4 text-sm text-ink-2">No goals yet. Add one, link events to it, and see each week here.</p>}

      <div className="mt-6 grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        {goals.map((goal) => {
          const own = byGoal.get(goal.id) ?? [];
          return (
            <div
              key={goal.id}
              className={`${CARD} scroll-mt-6 transition-shadow duration-500 ${marked === goal.id ? "ring-2 ring-ink/25 ring-offset-2 ring-offset-canvas" : ""}`}
              id={`goal-${goal.id}`}
            >
              <GoalCard
                goal={goal}
                onOpen={() => setEditor({ mode: "edit", goal, today })}
                collapsed={collapsed.includes(goal.id)}
                onToggle={() => toggle(goal.id)}
                openTasks={openCount(own)}
              >
                <TaskList tasks={own} goalId={goal.id} color={goal.look.color} sectionTitle={goal.title} today={today} goals={goalOptions} />
              </GoalCard>
            </div>
          );
        })}
        <InboxCard
          tasks={inbox}
          today={today}
          goals={goalOptions}
          collapsed={collapsed.includes(INBOX_KEY)}
          onToggle={() => toggle(INBOX_KEY)}
        />
      </div>

      <GoalSetup
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        onUseForm={() => {
          setSetupOpen(false);
          setEditor(newGoalState());
        }}
        goals={goals}
        places={places}
        today={today}
      />
      <GoalEditor state={editor} onClose={() => setEditor(null)} places={places} />
    </div>
  );
}

/** Tasks without a goal (R32), always the last card, also when there are no goals. Grey tile and bar. */
function InboxCard({
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
    <section aria-label="Inbox" className={`${CARD} pb-4`}>
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
        <h2 className="ml-1 min-w-0 flex-1 truncate text-[15px] font-semibold tracking-snug text-ink">Inbox</h2>
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

// Collapsed cards, remembered in this browser (spec 10; the same key the goals column used, so a
// choice made there still holds). The server and the browser's first render see nothing stored, so
// both start with every card open.
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
