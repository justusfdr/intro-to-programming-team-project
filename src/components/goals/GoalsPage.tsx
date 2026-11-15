"use client";

// The Goals page (spec 39): what the goals column beside the calendar showed (specs 03, 10, 11, 13),
// laid out for a whole page. The title "Goals" with "New goal"; one card per goal in a grid (one
// column on phones, two from 768 px, three from 1280 px) with its tile, title, this week's bar and
// rules, the strip of weeks, the countdown and its tasks; then "Inbox", tasks without a goal, as a
// card of its own. Each card can be collapsed, remembered in this browser as before (spec 10).
// Ticking, adding and editing tasks show at once; the page re-reads in the background (Live.tsx).
import { useId, useState, useSyncExternalStore } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { useLiveTasks } from "@/components/live/Live";
import { Button } from "@/components/ui/Button";
import { COLLAPSED_KEY, readCollapsed, toggleCollapsed } from "@/lib/goals/collapsed";
import { nextGoalColor } from "@/lib/goals/style";
import type { GoalView } from "@/lib/goals/types";
import { openCount, sortTasks } from "@/lib/tasks/order";
import type { TaskDto } from "@/lib/tasks/types";
import { GoalCard, OpenTaskCount } from "./GoalCard";
import { GoalEditor, type GoalEditorState } from "./GoalEditor";
import { GoalTile } from "./GoalTile";
import { TaskList, type GoalOption } from "./TaskList";

type Props = { goals: GoalView[]; tasks: TaskDto[]; today: string };

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

export function GoalsPage({ goals, tasks: serverTasks, today }: Props) {
  // The tasks with the changes of actions whose re-read has not arrived yet (components/live/Live.tsx).
  const tasks = useLiveTasks(serverTasks);
  const [editor, setEditor] = useState<GoalEditorState>(null);
  const [collapsed, toggle] = useCollapsed([...goals.map((goal) => goal.id), INBOX_KEY]);
  const { byGoal, inbox } = groupTasks(goals, tasks);
  const goalOptions: GoalOption[] = goals.map(({ id, title }) => ({ id, title }));

  const newGoal = () => setEditor({ mode: "create", today, color: nextGoalColor(goals.map((goal) => goal.look.color)) });

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-10">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-[28px] leading-[34px] font-semibold tracking-display text-ink md:text-[32px] md:leading-[38px]">Goals</h1>
        <Button onClick={newGoal}>
          <Plus className="size-4" aria-hidden />
          New goal
        </Button>
      </header>

      {goals.length === 0 && <p className="mt-4 text-sm text-ink-2">No goals yet. Add one, link events to it, and see each week here.</p>}

      <div className="mt-6 grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        {goals.map((goal) => {
          const own = byGoal.get(goal.id) ?? [];
          return (
            <div key={goal.id} className={CARD}>
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

      <GoalEditor state={editor} onClose={() => setEditor(null)} />
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
