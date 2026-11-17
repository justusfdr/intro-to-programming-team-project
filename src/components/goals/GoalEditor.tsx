"use client";

// The goal editor, laid out like the prototype's goal dialog: name, why it matters, colour dots and
// icon grid (R35); then what our goals have and the prototype's did not: deadline (the event editor's
// date field with its small month calendar, spec 39, or "No end date", spec 41), the weekly rules (R7) and auto-block. A native <dialog> like the event editor: focus stays inside, Escape closes it,
// focus returns afterwards.
// It creates a goal (create_goal) or edits one (edit_goal). In edit mode a rule that already exists
// is removed at once (remove_rule), and the goal can be deleted after a confirmation (delete_goal).
// It only collects the input and shows the server's answer; the server checks every rule.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { FormMessage } from "@/components/account/FormMessage";
import { useAnnounce } from "@/components/calendar/Announcer";
import { DateField } from "@/components/calendar/fields";
import { Button } from "@/components/ui/Button";
import { Plus, Trash2, X } from "lucide-react";
import { GOAL_ICONS } from "./GoalTile";
import { postJson, type PostResult } from "@/lib/client/post-json";
import { goalColor } from "@/lib/goals/colors";
import {
  DEFAULT_GOAL_ICON,
  GOAL_COLOR_LABELS,
  GOAL_COLORS,
  GOAL_ICON_LABELS,
  GOAL_ICON_NAMES,
  type GoalColorName,
  type GoalIconName,
} from "@/lib/goals/style";
import type { GoalDto, GoalView } from "@/lib/goals/types";

/** One rule row as the form holds it. `id` is set for a rule the server already has. */
type RuleRow = { key: number; id?: string; kind: "count" | "hours"; target: string; minMinutes: string };

export type GoalEditorState =
  | { mode: "create"; today: string; /** The colour a new goal starts with (the first unused one). */ color: GoalColorName }
  | { mode: "edit"; goal: GoalView; today: string }
  | null;

// The prototype's field and label classes (inputs 40px high).
const inputClass =
  "block h-10 w-full min-w-0 rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10";
const labelClass = "text-xs font-medium text-ink-2";
const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/50";

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
      className="event-editor m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-card bg-surface p-0 text-ink shadow-pop md:m-auto md:max-h-[calc(100dvh-3rem)] md:max-w-md md:rounded-card"
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
  // A goal without a saved colour shows (and saves) the colour it has now.
  const [color, setColor] = useState<GoalColorName>(goal ? goal.look.color : state.mode === "create" ? state.color : "rose");
  const [icon, setIcon] = useState<GoalIconName>(goal ? goal.look.icon : DEFAULT_GOAL_ICON);
  // The deadline as "YYYY-MM-DD" (empty until one is chosen); sent with the form by the date field.
  const [deadline, setDeadline] = useState(goal?.deadline ?? "");
  // Spec 41: ticked, the goal has no end date and the body sends deadline null. The routine of a goal is
  // not edited here yet (spec 42) and never sent, so an edit keeps it.
  const [noEndDate, setNoEndDate] = useState(goal !== null && goal.deadline === null);
  const [result, setResult] = useState<PostResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const confirmButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirmingDelete) confirmButton.current?.focus();
  }, [confirmingDelete]);

  // An unchanged past deadline stays allowed when editing; the server checks it as well.
  const minDeadline = goal && goal.deadline !== null && goal.deadline < state.today ? goal.deadline : state.today;

  function updateRule(key: number, change: Partial<RuleRow>) {
    setRules((current) => current.map((rule) => (rule.key === key ? { ...rule, ...change } : rule)));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fields = {
      title: String(form.get("title") ?? ""),
      deadline: noEndDate ? null : String(form.get("deadline") ?? ""),
      autoBlock: form.get("autoBlock") === "on",
      rules: rules.map(ruleBody),
      why: String(form.get("why") ?? ""),
      color,
      icon,
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
      <div className="flex items-center justify-between px-5 pt-5">
        <h2 id="goal-editor-title" className="text-base font-semibold tracking-snug text-ink">
          {goal ? "Edit goal" : "New goal"}
        </h2>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
          <X className="size-4" strokeWidth={1.8} aria-hidden />
        </Button>
      </div>

      <div className="scroll-thin flex min-h-0 flex-col gap-5 overflow-y-auto px-5 py-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="goal-title" className={labelClass}>
            Name
          </label>
          <input
            id="goal-title"
            name="title"
            defaultValue={goal?.title ?? ""}
            maxLength={80}
            placeholder="e.g. Run a half marathon"
            autoFocus
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="goal-why" className={labelClass}>
            Why it matters
          </label>
          <input
            id="goal-why"
            name="why"
            defaultValue={goal?.why ?? ""}
            maxLength={200}
            placeholder="One short sentence that keeps you going"
            className={inputClass}
          />
        </div>

        <div role="group" aria-label="Color" className="flex flex-col gap-1.5">
          <span className={labelClass} aria-hidden>
            Color
          </span>
          <div className="grid w-fit grid-cols-5 gap-2 sm:flex sm:flex-wrap">
            {GOAL_COLORS.map((c) => {
              const on = color === c;
              return (
                <button
                  key={c}
                  type="button"
                  aria-label={GOAL_COLOR_LABELS[c]}
                  aria-pressed={on}
                  onClick={() => setColor(c)}
                  className={`size-8 rounded-full ${goalColor(c).dot} transition-transform active:scale-95 ${focusRing} ${
                    on ? "ring-2 ring-ink ring-offset-2 ring-offset-surface" : ""
                  }`}
                />
              );
            })}
          </div>
        </div>

        <div role="group" aria-label="Icon" className="flex flex-col gap-1.5">
          <span className={labelClass} aria-hidden>
            Icon
          </span>
          <div className="grid grid-cols-5 gap-2">
            {GOAL_ICON_NAMES.map((name) => {
              const Icon = GOAL_ICONS[name];
              const on = icon === name;
              return (
                <button
                  key={name}
                  type="button"
                  aria-label={GOAL_ICON_LABELS[name]}
                  aria-pressed={on}
                  onClick={() => setIcon(name)}
                  className={`flex h-10 items-center justify-center rounded-lg border transition-colors ${focusRing} ${
                    on ? "border-ink bg-raised text-ink" : "border-line-subtle text-ink-2 hover:bg-raised"
                  }`}
                >
                  <Icon className="size-4" strokeWidth={1.8} aria-hidden />
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="goal-deadline" className={labelClass}>
            Deadline
          </label>
          <DateField
            id="goal-deadline"
            name="deadline"
            label="Deadline"
            value={deadline}
            min={minDeadline}
            todayKey={state.today}
            onChange={setDeadline}
            placeholder="Choose a deadline"
            disabled={noEndDate}
            tall
          />
          <label htmlFor="goal-no-end-date" className="flex w-fit cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              id="goal-no-end-date"
              type="checkbox"
              checked={noEndDate}
              onChange={(e) => setNoEndDate(e.target.checked)}
              className="size-4 cursor-pointer accent-ink"
            />
            No end date
          </label>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className={`${labelClass} mb-1.5`}>Every week</legend>
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
                  <Trash2 className="size-4" />
                </Button>
              </div>
              {rule.kind === "count" && (
                <div className="mt-2">
                  <label htmlFor={`rule-${rule.key}-min`} className="text-xs text-ink-2">
                    Minimum minutes per event (optional)
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
          <p className={labelClass}>Blocker</p>
          <div className="flex items-start justify-between gap-3 text-sm text-ink">
            <span>
              <label htmlFor="goal-auto-block" className="cursor-pointer">
                Auto-block distracting sites during this goal&apos;s events
              </label>
              <span id="goal-auto-block-hint" className="block text-xs text-ink-3">
                Needs the Chrome extension, see Settings.
              </span>
            </span>
            <input
              id="goal-auto-block"
              name="autoBlock"
              type="checkbox"
              role="switch"
              aria-describedby="goal-auto-block-hint"
              defaultChecked={goal?.autoBlock ?? false}
              className="relative mt-0.5 h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full bg-line transition-colors checked:bg-ink before:absolute before:top-0.5 before:left-0.5 before:size-4 before:rounded-full before:bg-white before:shadow-sm before:transition-transform checked:before:translate-x-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-1"
            />
          </div>
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

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-subtle px-5 py-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        {goal && confirmingDelete ? (
          <>
            <p className="min-w-0 break-words text-sm text-ink">{`Delete “${goal.title}”? Its events and tasks stay, without goal.`}</p>
            <div className="flex shrink-0 gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </Button>
              <button
                ref={confirmButton}
                type="button"
                disabled={busy}
                onClick={deleteGoal}
                className={`inline-flex h-7 shrink-0 items-center justify-center rounded-full bg-danger px-3 text-xs font-semibold whitespace-nowrap text-white transition-colors hover:bg-danger/90 disabled:opacity-40 ${focusRing}`}
              >
                Delete
              </button>
            </div>
          </>
        ) : (
          <>
            {goal ? (
              <button
                type="button"
                aria-label={`Delete ${goal.title}`}
                onClick={() => setConfirmingDelete(true)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger-soft ${focusRing}`}
              >
                Delete
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="secondary" size="md" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" size="md" disabled={busy}>
                {busy ? "Saving…" : goal ? "Save" : "Create"}
              </Button>
            </div>
          </>
        )}
      </div>
    </form>
  );
}
