"use client";

// Shows the result of an action on screen at once, and lets the page re-read in the background.
//
// Before, every action waited for its answer and then for a full re-read of the page
// (router.refresh()) before anything changed on screen. Now an action can describe the change:
// - `optimistic`: shown as soon as the user clicks (ticking a task, marking an event done);
// - `fromAnswer`: shown as soon as the server's answer arrives (it says what was saved).
// A rejected action removes its change again (the screen goes back) and the caller shows the
// ontology's message. An accepted one starts the page's re-read in the background; once that has
// arrived, the server's data includes the change and the local change is dropped.
//
// The changes are plain "set" steps (this task is now …, this event is now …), so applying one to
// data that already has it changes nothing. Dragging events (next step) can use the same `run`.
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import type { PostResult } from "@/lib/client/post-json";
import type { WeekData } from "@/lib/events/types";
import type { SettingsData } from "@/lib/settings/types";
import type { TaskDto } from "@/lib/tasks/types";
import { accepted, applyPatches, rejected, reread, started, type Changes, type Patch } from "./patches";

export { taskChanges, type Changes } from "./patches";

export type RunOptions = {
  /** Sends the action. */
  send: () => Promise<PostResult>;
  /** Shown at once, before the answer. Removed again if the action is rejected. */
  optimistic?: Changes;
  /** Built from an accepted answer; replaces `optimistic`. Return null to show nothing until the re-read. */
  fromAnswer?: (answer: PostResult) => Changes | null;
};

export type Live = {
  /** Sends an action, shows its change, and re-reads the page in the background when it was accepted. */
  run: (options: RunOptions) => Promise<PostResult>;
  /** Re-reads the page in the background (for example after a change that has no answer to show). */
  refresh: () => void;
};

type LiveState = Live & { patches: Patch[] };

const LiveContext = createContext<LiveState | null>(null);

/** Wrap a page in it, so every part of the page sees the changes of every action at once. */
export function LiveProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [patches, setPatches] = useState<Patch[]>([]);
  const nextId = useRef(1);

  // When every background re-read has arrived, the server's data holds all saved changes: drop them.
  // (Adjusting state while rendering, as React recommends instead of an effect.)
  const [wasRefreshing, setWasRefreshing] = useState(false);
  if (refreshing !== wasRefreshing) {
    setWasRefreshing(refreshing);
    if (!refreshing) setPatches(reread);
  }

  const refresh = useCallback(() => startTransition(() => router.refresh()), [router]);

  const run = useCallback(
    async ({ send, optimistic, fromAnswer }: RunOptions) => {
      const id = nextId.current++;
      setPatches((list) => started(list, id, optimistic));
      const answer = await send();
      if (!answer.ok) {
        // Rejected: the screen goes back to what the server has (R1: nothing changed there).
        setPatches((list) => rejected(list, id));
        return answer;
      }
      const changes = fromAnswer ? fromAnswer(answer) : (optimistic ?? null);
      setPatches((list) => accepted(list, id, changes));
      refresh();
      return answer;
    },
    [refresh],
  );

  const value = useMemo(() => ({ run, refresh, patches }), [run, refresh, patches]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

/**
 * The page's Live, or (outside a LiveProvider, as in component tests) a plain one: send, then
 * re-read the page.
 */
export function useLive(): Live {
  const context = useContext(LiveContext);
  const router = useRouter();
  const plain = useMemo<Live>(
    () => ({
      run: async ({ send }) => {
        const answer = await send();
        if (answer.ok) router.refresh();
        return answer;
      },
      refresh: () => router.refresh(),
    }),
    [router],
  );
  return context ?? plain;
}

function usePatched<K extends keyof Changes>(kind: K, server: Parameters<NonNullable<Changes[K]>>[0]) {
  const patches = useContext(LiveContext)?.patches;
  return useMemo(() => applyPatches(patches ?? [], kind, server), [kind, server, patches]);
}

/** The tasks as the server sent them, with the changes of recent actions. */
export function useLiveTasks(server: TaskDto[]): TaskDto[] {
  return usePatched("tasks", server);
}

/** The week as the server sent it, with the changes of recent actions. */
export function useLiveWeek(server: WeekData): WeekData {
  return usePatched("week", server);
}

/** The settings as the server sent them, with the changes of recent actions. */
export function useLiveSettings(server: SettingsData): SettingsData {
  return usePatched("settings", server);
}
