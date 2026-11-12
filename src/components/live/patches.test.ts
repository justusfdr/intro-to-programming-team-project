// The rules for showing an action's change at once (src/components/live/Live.tsx): a click shows at
// once, a rejection puts the screen back, an accepted answer shows what was saved until the page's
// re-read has arrived, and an action still waiting is not lost when another one's re-read arrives.
import { describe, expect, it } from "vitest";
import type { TaskDto } from "@/lib/tasks/types";
import { accepted, applyPatches, rejected, reread, started, taskChanges, type Patch } from "./patches";

function task(id: string, change: Partial<TaskDto> = {}): TaskDto {
  return { id, title: id, goalId: null, dueDate: null, status: "open", doneAt: null, ...change };
}

const SERVER = [task("shoes"), task("sign up")];

describe("a tick on a task", () => {
  const tick = taskChanges.saved({ ...SERVER[0], status: "done", doneAt: "2026-11-16T09:00:00.000Z" });

  it("shows at once, before the answer", () => {
    const list = started([], 1, tick);
    expect(applyPatches(list, "tasks", SERVER).map((t) => t.status)).toEqual(["done", "open"]);
  });

  it("goes back when the server rejects it", () => {
    const list = rejected(started([], 1, tick), 1);
    expect(applyPatches(list, "tasks", SERVER)).toEqual(SERVER);
  });

  it("shows the saved task from the answer until the re-read arrives, then the server's data counts", () => {
    const saved = { ...SERVER[0], status: "done" as const, doneAt: "2026-11-16T09:00:01.000Z" };
    let list = accepted(started([], 1, tick), 1, taskChanges.saved(saved));
    expect(applyPatches(list, "tasks", SERVER)[0]).toEqual(saved);
    list = reread(list);
    expect(list).toEqual([]);
  });

  it("keeps an action that is still waiting for its answer when another action's re-read arrives", () => {
    let list: Patch[] = accepted(started([], 1, tick), 1, tick);
    list = started(list, 2, taskChanges.saved({ ...SERVER[1], status: "done" }));
    list = reread(list);
    expect(list.map((p) => p.id)).toEqual([2]);
    expect(applyPatches(list, "tasks", SERVER).map((t) => t.status)).toEqual(["open", "done"]);
  });
});

describe("task changes are 'set' steps", () => {
  it("adds a new task, replaces a known one and removes one; applying twice changes nothing more", () => {
    const added = taskChanges.saved(task("new"));
    const once = added.tasks!(SERVER);
    expect(once.map((t) => t.id)).toEqual(["shoes", "sign up", "new"]);
    expect(added.tasks!(once)).toEqual(once);
    expect(taskChanges.saved(task("shoes", { title: "Running shoes" })).tasks!(SERVER)[0].title).toBe("Running shoes");
    expect(taskChanges.removed("shoes").tasks!(SERVER).map((t) => t.id)).toEqual(["sign up"]);
  });

  it("shows nothing until the re-read when an accepted answer describes no change", () => {
    const list = accepted(started([], 1, undefined), 1, null);
    expect(list).toEqual([]);
  });
});
