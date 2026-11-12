"use client";

// The tasks of one section of the goals column (spec 11): one row per task (R33's order, done ones
// struck through), the ring as a button that completes or reopens the task, a date chip (red with
// "overdue" for screen readers when the date is before today), and "Add task" at the end.
// "Add task" opens a one-line input with an optional due date: Enter saves, Escape closes.
// Clicking a task's title opens the same small form to change title, due date and goal, with Delete.
// It only collects the input and shows the server's answer; the server checks every rule.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useAnnounce } from "@/components/calendar/Announcer";
import { Button } from "@/components/ui/Button";
import { Plus, Trash2 } from "lucide-react";
import { postJson } from "@/lib/client/post-json";
import { dueLabel, isOverdue } from "@/lib/tasks/order";
import type { TaskDto } from "@/lib/tasks/types";
import { GoalRow } from "./GoalRow";

export type GoalOption = { id: string; title: string };

type Props = {
  /** This section's tasks, already in R33's order. */
  tasks: TaskDto[];
  /** The section's goal, or null for "Inbox". */
  goalId: string | null;
  /** The goal's colour index, or null for the grey of "Inbox". */
  colorIndex: number | null;
  /** The section's name, for the names of its controls ("Add task to Inbox"). */
  sectionTitle: string;
  /** The user's local date, "2026-11-16". */
  today: string;
  /** Every goal, for the goal list when editing a task. */
  goals: GoalOption[];
};

// The same fields as in the event editor.
const inputClass =
  "block h-10 w-full min-w-0 rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10";

/** A rejection shown next to the input, read out at once. */
function ErrorLine({ text }: { text: string }) {
  return (
    <p role="alert" className="mt-1 rounded-md bg-danger-soft px-2 py-1 text-[12px] text-danger">
      {text}
    </p>
  );
}

export function TaskList({ tasks, goalId, colorIndex, sectionTitle, today, goals }: Props) {
  const router = useRouter();
  const announce = useAnnounce();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);

  async function toggle(task: TaskDto) {
    setBusyId(task.id);
    const answer = await postJson(`/api/tasks/${task.id}/${task.status === "open" ? "done" : "open"}`, {});
    setBusyId(null);
    if (!answer.ok) {
      setRowError({ id: task.id, text: answer.message });
      return;
    }
    setRowError(null);
    announce(answer.message);
    router.refresh();
  }

  function closeAdd() {
    setAdding(false);
    // Focus goes back to "Add task", so the keyboard user stays in place.
    requestAnimationFrame(() => addButton.current?.focus());
  }

  return (
    <div className="mt-2">
      <ul aria-label={`Tasks of ${sectionTitle}`} className="flex flex-col">
        {tasks.map((task) =>
          editingId === task.id ? (
            <li key={task.id}>
              <TaskForm
                mode={{ kind: "edit", task }}
                goalId={goalId}
                today={today}
                goals={goals}
                onDone={() => setEditingId(null)}
              />
            </li>
          ) : (
            <TaskRow
              key={task.id}
              task={task}
              colorIndex={colorIndex}
              today={today}
              busy={busyId === task.id}
              error={rowError?.id === task.id ? rowError.text : null}
              onToggle={() => toggle(task)}
              onOpen={() => {
                setRowError(null);
                setAdding(false);
                setEditingId(task.id);
              }}
            />
          ),
        )}
      </ul>
      {adding ? (
        <TaskForm mode={{ kind: "add", sectionTitle }} goalId={goalId} today={today} goals={goals} onDone={closeAdd} />
      ) : (
        <button
          ref={addButton}
          type="button"
          onClick={() => {
            setEditingId(null);
            setAdding(true);
          }}
          aria-label={`Add task to ${sectionTitle}`}
          className="-mx-1 flex h-8 w-[calc(100%+0.5rem)] items-center gap-2.5 rounded-md px-1 text-left text-[14px] text-ink-3 transition-colors hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
        >
          <Plus className="size-[18px] p-[2px]" />
          Add task
        </button>
      )}
    </div>
  );
}

function TaskRow({
  task,
  colorIndex,
  today,
  busy,
  error,
  onToggle,
  onOpen,
}: {
  task: TaskDto;
  colorIndex: number | null;
  today: string;
  busy: boolean;
  error: string | null;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const done = task.status === "done";
  const overdue = isOverdue(task, today);
  // A done task shows no date chip (the date no longer matters once it is done).
  const chip =
    task.dueDate && !done
      ? { text: dueLabel(task.dueDate), tone: overdue ? ("danger" as const) : ("neutral" as const), srPrefix: overdue ? "Overdue, due " : "Due " }
      : undefined;
  return (
    <>
      <GoalRow
        colorIndex={colorIndex}
        done={done}
        struck={done}
        chip={chip}
        toggle={{ label: done ? `Reopen '${task.title}'` : `Mark '${task.title}' done`, onClick: onToggle, disabled: busy }}
      >
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Edit task ${task.title}`}
          className="block w-full truncate rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
        >
          {task.title}
        </button>
      </GoalRow>
      {error && (
        <li className="pl-7">
          <ErrorLine text={error} />
        </li>
      )}
    </>
  );
}

export type FormMode = { kind: "add"; sectionTitle: string } | { kind: "edit"; task: TaskDto };

export function TaskForm({
  mode,
  goalId,
  today,
  goals,
  onDone,
}: {
  mode: FormMode;
  goalId: string | null;
  today: string;
  goals: GoalOption[];
  onDone: () => void;
}) {
  const router = useRouter();
  const announce = useAnnounce();
  const task = mode.kind === "edit" ? mode.task : null;
  const [title, setTitle] = useState(task?.title ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [goal, setGoal] = useState(task?.goalId ?? goalId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const titleInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleInput.current?.focus();
  }, []);

  // An unchanged past due date stays allowed when editing; the server checks it as well.
  const minDate = task?.dueDate && task.dueDate < today ? task.dueDate : today;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const body = { title, dueDate: dueDate === "" ? null : dueDate, goalId: goal === "" ? null : goal };
    const answer = task ? await postJson(`/api/tasks/${task.id}/edit`, body) : await postJson("/api/tasks", body);
    setBusy(false);
    if (!answer.ok) {
      setError(answer.message);
      return;
    }
    setError(null);
    announce(answer.message);
    router.refresh();
    if (task) {
      onDone();
    } else {
      // Stays open for the next task, like a list you type into.
      setTitle("");
      setDueDate("");
      titleInput.current?.focus();
    }
  }

  async function remove() {
    if (!task) return;
    setBusy(true);
    const answer = await postJson(`/api/tasks/${task.id}/delete`, {});
    setBusy(false);
    if (!answer.ok) {
      setError(answer.message);
      return;
    }
    announce(answer.message);
    router.refresh();
    onDone();
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Escape") return;
    // Closes only this small form, not the phone sheet around it.
    event.preventDefault();
    event.stopPropagation();
    onDone();
  }

  const formName = mode.kind === "edit" ? `Edit task ${mode.task.title}` : `Add task to ${mode.sectionTitle}`;
  return (
    <form onSubmit={save} onKeyDown={onKeyDown} aria-label={formName} className="my-1 rounded-xl border border-line-subtle bg-raised/60 p-2">
      <input
        ref={titleInput}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        aria-label="Task title"
        placeholder="Task title"
        maxLength={200}
        enterKeyHint="done"
        aria-invalid={error ? true : undefined}
        className={inputClass}
      />
      <div className="mt-1.5 flex flex-col gap-1.5">
        <input
          type="date"
          value={dueDate}
          min={minDate}
          onChange={(event) => setDueDate(event.target.value)}
          aria-label="Due date (optional)"
          title="Due date (optional)"
          className={inputClass}
        />
        {task && (
          <select value={goal} onChange={(event) => setGoal(event.target.value)} aria-label="Goal" className={inputClass}>
            <option value="">Inbox (no goal)</option>
            {goals.map((option) => (
              <option key={option.id} value={option.id}>
                {option.title}
              </option>
            ))}
          </select>
        )}
      </div>
      {error && <ErrorLine text={error} />}
      <div className="mt-2 flex items-center gap-1.5">
        <Button type="submit" size="sm" disabled={busy}>
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone}>
          {task ? "Cancel" : "Close"}
        </Button>
        {task && (
          <Button
            variant="secondary"
            size="sm"
            onClick={remove}
            disabled={busy}
            aria-label={`Delete task ${task.title}`}
            title="Delete task"
            className="ml-auto text-danger! hover:bg-danger-soft"
          >
            <Trash2 className="size-3.5" />
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}
