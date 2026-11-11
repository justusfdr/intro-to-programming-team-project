"use client";

// The goal editor: title, deadline, the auto-block switch and the weekly rules (R7). A native
// <dialog> like the event editor: focus stays inside, Escape closes it, focus returns afterwards.
// It only collects the input and shows the server's answer; the server checks every rule.
//
// Build step 2 reference slice: creating a goal (create_goal). Editing, removing a rule and
// deleting are added by the tasks in tasks-04.json.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { FormMessage } from "@/components/account/FormMessage";
import { useAnnounce } from "@/components/calendar/Announcer";
import { Button } from "@/components/ui/Button";
import { Close, Plus, Trash } from "@/components/ui/icons";
import { postJson, type PostResult } from "@/lib/client/post-json";

/** One rule row as the form holds it (text fields keep what the user typed). */
type RuleRow = { key: number; kind: "count" | "hours"; target: string; minMinutes: string };

export type GoalEditorState = { mode: "create"; today: string } | null;

const inputClass =
  "block h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10";
const eyebrow = "text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3";

let nextKey = 1;
function newRule(): RuleRow {
  return { key: nextKey++, kind: "count", target: "2", minMinutes: "" };
}

/** What the server receives for a rule. An empty target is sent as 0, so the server names the limit. */
function ruleBody(rule: RuleRow) {
  return {
    kind: rule.kind,
    target: rule.target.trim() === "" ? 0 : Number(rule.target),
    minMinutes: rule.kind === "count" && rule.minMinutes.trim() !== "" ? Number(rule.minMinutes) : null,
  };
}

export function GoalEditor({ state, onClose }: { state: GoalEditorState; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const open = state !== null;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="goal-editor-title"
      onClose={onClose}
      onClick={(event) => event.target === dialog.current && onClose()}
      className="event-editor m-0 mt-auto max-h-[88dvh] w-full max-w-none overflow-hidden rounded-t-panel border border-line-subtle bg-surface p-0 text-ink shadow-pop sm:m-auto sm:max-h-[calc(100dvh-2rem)] sm:w-[420px] sm:rounded-card"
    >
      {state && <GoalForm state={state} onClose={onClose} />}
    </dialog>
  );
}

function GoalForm({ state, onClose }: { state: Exclude<GoalEditorState, null>; onClose: () => void }) {
  const router = useRouter();
  const announce = useAnnounce();
  const [rules, setRules] = useState<RuleRow[]>(() => [newRule()]);
  const [result, setResult] = useState<PostResult | null>(null);
  const [busy, setBusy] = useState(false);

  function updateRule(key: number, change: Partial<RuleRow>) {
    setRules((current) => current.map((rule) => (rule.key === key ? { ...rule, ...change } : rule)));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    const answer = await postJson("/api/goals", {
      title: String(form.get("title") ?? ""),
      deadline: String(form.get("deadline") ?? ""),
      autoBlock: form.get("autoBlock") === "on",
      rules: rules.map(ruleBody),
    });
    setBusy(false);
    setResult(answer.ok ? null : answer);
    if (!answer.ok) return;
    announce(answer.message);
    router.refresh();
    onClose();
  }

  return (
    <form onSubmit={save} noValidate className="flex max-h-[inherit] flex-col">
      <div className="scroll-thin flex flex-col gap-4 overflow-y-auto p-4">
        <div className="flex items-center gap-3">
          <h2 id="goal-editor-title" className="min-w-0 flex-1 text-[15px] font-semibold">
            New goal
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 flex size-7 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
          >
            <Close />
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="goal-title" className={eyebrow}>
            Title
          </label>
          <input id="goal-title" name="title" placeholder="Run a half marathon" autoFocus className={inputClass} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="goal-deadline" className={eyebrow}>
            Deadline
          </label>
          <input id="goal-deadline" name="deadline" type="date" min={state.today} className={inputClass} />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className={`${eyebrow} mb-1.5`}>Every week</legend>
          {rules.map((rule, index) => (
            <div key={rule.key} className="rounded-lg border border-line-subtle bg-raised/60 p-2.5">
              <div className="grid grid-cols-[1fr_5.5rem_auto] items-end gap-2">
                <div>
                  <label htmlFor={`rule-${rule.key}-kind`} className="text-xs text-ink-2">
                    Rule {index + 1}
                  </label>
                  <select
                    id={`rule-${rule.key}-kind`}
                    value={rule.kind}
                    onChange={(e) => updateRule(rule.key, { kind: e.target.value as RuleRow["kind"] })}
                    className={`${inputClass} mt-1`}
                  >
                    <option value="count">Events per week</option>
                    <option value="hours">Hours per week</option>
                  </select>
                </div>
                <div>
                  <label htmlFor={`rule-${rule.key}-target`} className="text-xs text-ink-2">
                    {rule.kind === "count" ? "Events" : "Hours"}
                  </label>
                  <input
                    id={`rule-${rule.key}-target`}
                    type="number"
                    inputMode="decimal"
                    step={rule.kind === "count" ? 1 : 0.5}
                    value={rule.target}
                    onChange={(e) => updateRule(rule.key, { target: e.target.value })}
                    className={`${inputClass} mt-1`}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove rule ${index + 1}`}
                  title="Remove rule"
                  disabled={rules.length === 1}
                  onClick={() => setRules((current) => current.filter((r) => r.key !== rule.key))}
                >
                  <Trash />
                </Button>
              </div>
              {rule.kind === "count" && (
                <div className="mt-2">
                  <label htmlFor={`rule-${rule.key}-min`} className="text-xs text-ink-2">
                    Each at least (minutes, optional)
                  </label>
                  <input
                    id={`rule-${rule.key}-min`}
                    type="number"
                    inputMode="numeric"
                    step={5}
                    placeholder="45"
                    value={rule.minMinutes}
                    onChange={(e) => updateRule(rule.key, { minMinutes: e.target.value })}
                    className={`${inputClass} mt-1`}
                  />
                </div>
              )}
            </div>
          ))}
          <Button variant="secondary" size="sm" className="w-fit" onClick={() => setRules((current) => [...current, newRule()])}>
            <Plus className="size-3.5" />
            Add rule
          </Button>
        </fieldset>

        <label htmlFor="goal-auto-block" className="flex items-start gap-2 text-sm text-ink">
          <input id="goal-auto-block" name="autoBlock" type="checkbox" className="mt-0.5 size-4 accent-ink" />
          <span>
            Auto-block distracting sites during this goal&apos;s events
            <span className="block text-xs text-ink-3">Takes effect once the blocker is part of the app.</span>
          </span>
        </label>

        {result && <FormMessage tone="error" text={result.message} />}
      </div>

      <div className="flex items-center gap-2 border-t border-line-subtle bg-surface px-4 py-3">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Saving…" : "Add goal"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
