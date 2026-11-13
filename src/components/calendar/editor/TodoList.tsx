"use client";

// TO-DOS, copied from our first prototype (its components/calendar/SubtaskList.tsx): the heading with
// the count ("2/3"), one row per to-do with the grip to reorder (drag, or the arrow keys), the box to
// tick it, the title (click to rename: Enter saves, Esc cancels) and the cross to delete it, then the
// field "Add a to-do" (Enter adds; Esc empties it, a second Esc closes the editor as usual).
// Only the look and the gestures live here; what a change does (saved at once for an existing event,
// kept until "Add event" for a new one) is decided by the caller (spec 21).
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Check, GripVertical, X } from "lucide-react";
import { FormMessage } from "@/components/account/FormMessage";
import { countOf, type TodoItem } from "@/lib/todos/list";
import { MAX_TODO_TITLE, todoCountText } from "@/lib/todos/types";
import { Eyebrow, inputClass } from "../fields";

const addClass = inputClass.replace("h-9", "h-8");
const editClass =
  "h-7 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 text-sm text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10";

type DragState = { key: string; from: number; drop: number; pointerId: number };

export type TodoListProps = {
  todos: TodoItem[];
  /** The server's refusal (or the local check's), shown under the list. */
  error?: string;
  onAdd: (title: string) => void;
  onRename: (key: string, title: string) => void;
  onToggle: (key: string) => void;
  onMove: (key: string, toIndex: number) => void;
  onDelete: (key: string) => void;
};

export function TodoList({ todos, error, onAdd, onRename, onToggle, onMove, onDelete }: TodoListProps) {
  const listRef = useRef<HTMLUListElement>(null);
  // Drag data for the event handlers (no render dependency).
  const dragRef = useRef<DragState | null>(null);
  // Which row is being renamed; the ref lets blur, Enter and Esc finish the edit only once.
  const editingRef = useRef<string | null>(null);
  // Only what the render needs: the dragged row and the insertion slot (0..n, before row n).
  const [drag, setDrag] = useState<{ key: string; from: number; drop: number } | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [newTitle, setNewTitle] = useState("");

  const total = todos.length;
  const { done: doneCount } = countOf(todos);

  /** The insertion slot for a pointer at clientY: after every row whose middle is above it. */
  const insertionAt = (clientY: number): number => {
    const rows: HTMLElement[] = listRef.current ? Array.from(listRef.current.querySelectorAll<HTMLElement>("[data-todo-row]")) : [];
    let slot = 0;
    rows.forEach((row, i) => {
      const r = row.getBoundingClientRect();
      if (clientY > r.top + r.height / 2) slot = i + 1;
    });
    return slot;
  };

  const onHandleDown = (e: PointerEvent<HTMLButtonElement>, key: string, index: number) => {
    if (e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // The pointer is no longer active: dragging still works, only without capture.
    }
    dragRef.current = { key, from: index, drop: index, pointerId: e.pointerId };
    setDrag({ key, from: index, drop: index });
  };

  const onHandleMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const drop = insertionAt(e.clientY);
    if (drop === d.drop) return;
    d.drop = drop;
    setDrag((cur) => (cur && cur.key === d.key ? { ...cur, drop } : cur));
  };

  const endDrag = (e: PointerEvent<HTMLButtonElement>, commit: boolean) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDrag(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!commit) return;
    // The row is taken out first, then put in at toIndex: a slot below its old place shifts by one.
    const toIndex = d.drop > d.from ? d.drop - 1 : d.drop;
    if (toIndex !== d.from) onMove(d.key, toIndex);
  };

  const moveBy = (key: string, index: number, dir: 1 | -1) => {
    const to = index + dir;
    if (to < 0 || to >= total) return;
    onMove(key, to);
    // Keep the keyboard focus on the moved grip once the list has been drawn again.
    window.requestAnimationFrame(() => {
      const handles: HTMLElement[] = listRef.current ? Array.from(listRef.current.querySelectorAll<HTMLElement>("[data-handle-key]")) : [];
      handles.find((h) => h.dataset.handleKey === key)?.focus();
    });
  };

  const onHandleKey = (e: KeyboardEvent<HTMLButtonElement>, key: string, index: number) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      moveBy(key, index, -1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      moveBy(key, index, 1);
    }
  };

  const startEdit = (todo: TodoItem) => {
    editingRef.current = todo.key;
    setDraft(todo.title);
    setEditingKey(todo.key);
  };

  const finishEdit = (todo: TodoItem, value: string, save: boolean) => {
    if (editingRef.current !== todo.key) return;
    editingRef.current = null;
    setEditingKey(null);
    const title = value.trim();
    if (save && title && title !== todo.title) onRename(todo.key, title);
  };

  const onAddKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter") {
      e.preventDefault();
      const title = newTitle.trim();
      if (!title) return;
      onAdd(title);
      setNewTitle("");
    } else if (e.key === "Escape" && newTitle) {
      // Only empties the field; a second Esc (empty field) closes the editor as usual.
      e.preventDefault();
      setNewTitle("");
    }
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>To-dos</Eyebrow>
        {total > 0 && (
          <span className="text-xs tabular text-ink-3" aria-label={`${doneCount} of ${total} done`}>
            {todoCountText(doneCount, total)}
          </span>
        )}
      </div>

      {total > 0 && (
        <ul ref={listRef} aria-label="To-dos" className="flex flex-col">
          {todos.map((s, i) => {
            const dragging = drag?.key === s.key;
            // A slot right above or below the dragged row would change nothing: no line there.
            const showLine = drag !== null && drag.drop === i && drag.drop !== drag.from && drag.drop !== drag.from + 1;
            return (
              <li
                key={s.key}
                data-todo-row
                className={`group relative flex items-center gap-1 rounded-md pr-1 transition-colors hover:bg-raised ${dragging ? "opacity-50" : ""}`}
              >
                {showLine && <span aria-hidden className="pointer-events-none absolute inset-x-1 -top-px h-0.5 rounded-full bg-ink" />}
                <button
                  type="button"
                  data-handle-key={s.key}
                  aria-label={`Reorder "${s.title}"`}
                  title="Drag to reorder"
                  onPointerDown={(e) => onHandleDown(e, s.key, i)}
                  onPointerMove={onHandleMove}
                  onPointerUp={(e) => endDrag(e, true)}
                  onPointerCancel={(e) => endDrag(e, false)}
                  onKeyDown={(e) => onHandleKey(e, s.key, i)}
                  className="flex size-6 pointer-coarse:size-9 shrink-0 touch-none cursor-grab items-center justify-center rounded text-ink-3 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 active:cursor-grabbing"
                >
                  <GripVertical className="size-3.5" strokeWidth={1.8} />
                </button>

                <button
                  type="button"
                  onClick={() => onToggle(s.key)}
                  aria-label={`Mark "${s.title}" ${s.done ? "not done" : "done"}`}
                  className={`flex size-4 shrink-0 items-center justify-center rounded border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 ${
                    s.done ? "border-ink bg-ink text-white" : "border-line"
                  }`}
                >
                  {s.done && <Check className="size-3" strokeWidth={3} />}
                </button>

                {editingKey === s.key ? (
                  <input
                    autoFocus
                    aria-label="To-do title"
                    maxLength={MAX_TODO_TITLE}
                    value={draft}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing) return;
                      if (e.key === "Enter") {
                        e.preventDefault();
                        finishEdit(s, e.currentTarget.value, true);
                      } else if (e.key === "Escape") {
                        // Keep the editor open: Esc only cancels this edit.
                        e.preventDefault();
                        finishEdit(s, s.title, false);
                      }
                    }}
                    onBlur={(e) => finishEdit(s, e.currentTarget.value, true)}
                    className={editClass}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => startEdit(s)}
                    className={`min-w-0 flex-1 break-words rounded py-1.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 ${
                      s.done ? "text-ink-3 line-through" : "text-ink"
                    }`}
                  >
                    {s.title}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onDelete(s.key)}
                  aria-label={`Delete "${s.title}"`}
                  className="flex size-6 pointer-coarse:size-9 shrink-0 items-center justify-center rounded text-ink-3 opacity-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <X className="size-3.5" strokeWidth={1.8} />
                </button>
              </li>
            );
          })}
          {drag !== null && drag.drop === total && drag.from !== total - 1 && (
            <li aria-hidden className="relative h-0">
              <span className="pointer-events-none absolute inset-x-1 top-0 h-0.5 rounded-full bg-ink" />
            </li>
          )}
        </ul>
      )}

      <input
        value={newTitle}
        onChange={(e) => setNewTitle(e.target.value)}
        onKeyDown={onAddKey}
        placeholder="Add a to-do"
        aria-label="Add a to-do"
        maxLength={MAX_TODO_TITLE}
        className={addClass}
      />
      {error && <FormMessage tone="error" text={error} />}
    </section>
  );
}
