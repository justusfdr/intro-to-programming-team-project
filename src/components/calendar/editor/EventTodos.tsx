"use client";

// TO-DOS of an existing event (spec 21): read from the server when the editor opens, and every change
// saved at once, like "Mark done" (not with the editor's Save button). Each change shows in the list
// right away and is sent in order, one after another; the server answers with the whole list as it is
// then, and the block in the calendar gets its new count ("2/3") from that answer. A refusal puts the
// list back and shows the ontology's message (R1). Not shown for Outlook events (R11; the caller).
import { useCallback, useEffect, useRef, useState } from "react";
import { useLive } from "@/components/live/Live";
import { getJson, postJson, type PostResult } from "@/lib/client/post-json";
import { withEventTodos } from "@/lib/events/week-view";
import { MESSAGES } from "@/lib/messages";
import { cleanTitle, hasRoom, moveTo, type TodoItem } from "@/lib/todos/list";
import type { TodoDto } from "@/lib/todos/types";
import { useAnnounce } from "../Announcer";
import { TodoList } from "./TodoList";

type ListAnswer = { todos?: TodoDto[]; todoCount?: number; todosDone?: number };

const itemsOf = (answer: PostResult): TodoItem[] | null => {
  const todos = (answer.data as ListAnswer | undefined)?.todos;
  return todos ? todos.map((t) => ({ key: t.id, title: t.title, done: t.done })) : null;
};

export function EventTodos({ eventId }: { eventId: string }) {
  const live = useLive();
  const announce = useAnnounce();
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const listRef = useRef<TodoItem[]>([]);
  const [error, setError] = useState("");
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const show = useCallback((list: TodoItem[]) => {
    listRef.current = list;
    setTodos(list);
  }, []);

  useEffect(() => {
    let open = true;
    void getJson(`/api/events/${eventId}/todos`).then((answer) => {
      if (!open) return;
      const list = itemsOf(answer);
      if (list) show(list);
      else if (!answer.ok) setError(answer.message);
    });
    return () => {
      open = false;
    };
  }, [eventId, show]);

  /** One change: shown at once (`next`), sent after the ones before it, then the server's list. */
  const change = useCallback(
    (path: string, body: unknown, next: ((list: TodoItem[]) => TodoItem[]) | null) => {
      const step = async () => {
        const before = listRef.current;
        if (next) show(next(before));
        const answer = await live.run({
          send: () => postJson(path, body),
          fromAnswer: (a) => {
            const data = a.data as ListAnswer | undefined;
            if (data?.todoCount === undefined || data.todosDone === undefined) return null;
            const { todoCount, todosDone } = data;
            return { week: (week) => withEventTodos(week, eventId, todoCount, todosDone) };
          },
        });
        if (!answer.ok) {
          show(before);
          setError(answer.message);
          return;
        }
        const list = itemsOf(answer);
        if (list) show(list);
        setError("");
        if (answer.message) announce(answer.message);
      };
      queue.current = queue.current.then(step, step);
    },
    [live, eventId, show, announce],
  );

  const find = (key: string) => listRef.current.find((t) => t.key === key);

  return (
    <TodoList
      todos={todos}
      error={error}
      onAdd={(raw) => {
        const title = cleanTitle(raw);
        if (!title) return setError(MESSAGES.todoTitleLength);
        if (!hasRoom(listRef.current)) return setError(MESSAGES.tooManyTodos);
        change(`/api/events/${eventId}/todos`, { title }, null);
      }}
      onRename={(key, raw) => {
        const title = cleanTitle(raw);
        if (!title) return setError(MESSAGES.todoTitleLength);
        change(`/api/todos/${key}/rename`, { title }, (list) => list.map((t) => (t.key === key ? { ...t, title } : t)));
      }}
      onToggle={(key) => {
        const todo = find(key);
        if (!todo) return;
        const done = !todo.done;
        change(`/api/todos/${key}/done`, { done }, (list) => list.map((t) => (t.key === key ? { ...t, done } : t)));
      }}
      onMove={(key, toIndex) => change(`/api/todos/${key}/move`, { toIndex }, (list) => moveTo(list, key, toIndex))}
      onDelete={(key) => change(`/api/todos/${key}/delete`, {}, (list) => list.filter((t) => t.key !== key))}
    />
  );
}
