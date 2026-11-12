"use client";

// The goal editor: title, deadline, the auto-block switch and the weekly rules (R7). A native
// <dialog> like the event editor: focus stays inside, Escape closes it, focus returns afterwards.
// It creates a goal (create_goal) or edits one (edit_goal). In edit mode a rule that already exists
// is removed at once (remove_rule), and the goal can be deleted after a confirmation (delete_goal).
// It only collects the input and shows the server's answer; the server checks every rule.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { FormMessage } from "@/components/account/FormMessage";
import { useAnnounce } from "@/components/calendar/Announcer";
import { Button } from "@/components/ui/Button";
import { Close, Plus, Trash } from "@/components/ui/icons";
import { GoalTile } from "./GoalTile";
import { postJson, type PostResult } from "@/lib/client/post-json";
import type { GoalDto, GoalView } from "@/lib/goals/types";

/** One rule row as the form holds it. `id` is set for a rule the server already has. */
type RuleRow = { key: number; id?: string; kind: "count" | "hours"; target: string; minMinutes: string };

export type GoalEditorState = { mode: "create"; today: string } | { mode: "edit"; goal: GoalView; today: string } | null;

const inputClass =
  "block h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10";
const eyebrow = "text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3";

let nextKey = 1;
function newRule(): RuleRow {
  return { key: nextKey++, kind: "count", target: "2", minMinutes: "" };
}

/** A rule the server already has, filled in from the server's copy. */
function ruleRow(rule: GoalView["rules"][number]): RuleRow {
  return {
    key: nextKey++,
    id: rule.id,
    kind: rule.kind,
    target: String(rule.target),
    minMinutes: rule.minMinutes === null ? "" : String(rule.minMinutes),
  };
}

/** What the server receives for a rule. An empty target is sent as 0, so the server names the limit. */
function ruleBody(rule: RuleRow) {
  return {
    ...(rule.id ? { id: rule.id } : {}),
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
      className="event-editor m-0 mt-auto max-h-[88dvh] w-full max-w-none overflow-hidden rounded-t-panel border border-line-subtle bg-surface p-0 text-ink shadow-pop sm:m-auto sm:max-h-[calc(100dvh-2rem)] sm:w-[420px] sm:rounded-[20px]"
    >
      {/* A new key for every goal gives the form its own rows, fields and messages. */}
      {state && <GoalForm key={state.mode === "edit" ? state.goal.id : "new"} state={state} onClose={onClose} />}
    </dialog>
  );
}

function GoalForm({ state, onClose }: { state: Exclude<GoalEditorState, null>; onClose: () => void }) {
  const router = useRouter();
  const announce = useAnnounce();
  const goal = state.mode === "edit" ? state.goal : null;
  // The goal's updated_at as this device last saw it (R4). Removing a rule gives the goal a new one.
  const [updatedAt, setUpdatedAt] = useState(goal?.updatedAt ?? "");
  const [rules, setRules] = useState<RuleRow[]>(() => (goal ? goal.rules.map(ruleRow) : [newRule()]));
  const [result, setResult] = useState<PostResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const confirmButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirmingDelete) confirmButton.current?.focus();
  }, [confirmingDelete]);

  // An unchanged past deadline stays allowed when editing; the server checks it as well.
  const minDeadline = goal && goal.deadline < state.today ? goal.deadline : state.today;

  function updateRule(key: number, change: Partial<RuleRow>) {
    setRules((current) => current.map((rule) => (rule.key === key ? { ...rule, ...change } : rule)));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fields = {
      title: String(form.get("title") ?? ""),
      deadline: String(form.get("deadline") ?? ""),
      autoBlock: form.get("autoBlock") === "on",
      rules: rules.map(ruleBody),
    };
    setBusy(true);
    const answer = goal
      ? await postJson(`/api/goals/${goal.id}/edit`, { ...fields, updatedAt })
      : await postJson("/api/goals", fields);
    setBusy(false);
    setResult(answer.ok ? null : answer);
    if (!answer.ok) return;
    announce(answer.message);
    router.refresh();
    onClose();
  }

  /** A rule the server does not have yet is only dropped here; a saved rule is removed at once. */
  async function removeRule(rule: RuleRow) {
    if (!rule.id) {
      setRules((current) => current.filter((r) => r.key !== rule.key));
      return;
    }
    setBusy(true);
    const answer = await postJson(`/api/rules/${rule.id}/remove`, { updatedAt });
    setBusy(false);
    setResult(answer.ok ? null : answer);
    if (!answer.ok) return;
    const saved = (answer.data as { goal?: GoalDto } | undefined)?.goal;
    if (saved) setUpdatedAt(saved.updatedAt);
    announce(answer.message);
    setRules((current) => current.filter((r) => r.key !== rule.key));
    router.refresh();
  }

  async function deleteGoal() {
    if (!goal) return;
    setBusy(true);
    const answer = await postJson(`/api/goals/${goal.id}/delete`, { updatedAt });
    setBusy(false);
    setResult(answer.ok ? null : answer);
    if (!answer.ok) return;
    announce(answer.message);
    router.refresh();
    onClose();
  }

  const stale = result?.status === 409 && result.message.startsWith("Changed on another device");

  return (
    <form onSubmit={save} noValidate className="flex max-h-[inherit] flex-col">
      <div className="scroll-thin flex flex-col gap-5 overflow-y-auto px-5 pt-5 pb-6">
        <div className="flex items-center gap-3">
          <GoalTile colorIndex={goal ? goal.colorIndex : null} size="lg" />
          <h2 id="goal-editor-title" className="min-w-0 flex-1 text-[15px] font-semibold tracking-snug">
            {goal ? "Edit goal" : "New goal"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
          >
            <Close />
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="goal-title" className={eyebrow}>
            Title
          </label>
          <input
            id="goal-title"
            name="title"
            defaultValue={goal?.title ?? ""}
            placeholder="Run a half marathon"
            autoFocus
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="goal-deadline" className={eyebrow}>
            Deadline
          </label>
          <input id="goal-deadline" name="deadline" type="date" defaultValue={goal?.deadline ?? ""} min={minDeadline} className={inputClass} />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className={`${eyebrow} mb-1.5`}>Every week</legend>
          {rules.map((rule, index) => (
            <div key={rule.key} className="rounded-card border border-line-subtle bg-raised/50 p-3">
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
                  onClick={() => removeRule(rule)}
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

        <section className="flex flex-col gap-2">
          <p className={eyebrow}>Blocker</p>
          <label htmlFor="goal-auto-block" className="flex cursor-pointer items-start justify-between gap-3 text-sm text-ink">
            <span>
              Auto-block distracting sites during this goal&apos;s events
              <span className="block text-xs text-ink-3">Takes effect once the blocker is part of the app.</span>
            </span>
            <input
              id="goal-auto-block"
              name="autoBlock"
              type="checkbox"
              role="switch"
              defaultChecked={goal?.autoBlock ?? false}
              className="relative mt-0.5 h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full bg-line transition-colors checked:bg-ink before:absolute before:top-0.5 before:left-0.5 before:size-4 before:rounded-full before:bg-white before:shadow-sm before:transition-transform checked:before:translate-x-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-1"
            />
          </label>
        </section>

        {result && <FormMessage tone="error" text={result.message} />}
        {stale && (
          <Button
            variant="secondary"
            size="sm"
            className="w-fit"
            onClick={() => {
              router.refresh();
              onClose();
            }}
          >
            Reload
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line-subtle bg-surface px-5 py-3.5">
        {goal && confirmingDelete ? (
          <>
            <p className="w-full text-sm font-medium">{`Delete '${goal.title}'? Its events stay, without goal.`}</p>
            <Button ref={confirmButton} variant="danger" size="sm" disabled={busy} onClick={deleteGoal}>
              Yes, delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? "Saving…" : goal ? "Save" : "Add goal"}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            {goal && (
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto size-8 text-ink-3"
                aria-label={`Delete ${goal.title}`}
                title="Delete"
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash />
              </Button>
            )}
          </>
        )}
      </div>
    </form>
  );
}
