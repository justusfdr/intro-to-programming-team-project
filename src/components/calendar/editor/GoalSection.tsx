"use client";

// GOAL, as in the prototype: "No goal" and every goal as chips. All-day events have no goal (R29), so
// the editor leaves this section out for them.
import { Eyebrow, GoalChips } from "../fields";
import type { GoalLabel } from "../TimeGrid";

export function GoalSection({ goals, value, onChange }: { goals: GoalLabel[]; value: string | null; onChange: (goalId: string | null) => void }) {
  return (
    <section className="flex flex-col gap-1.5">
      <Eyebrow>Goal</Eyebrow>
      <GoalChips goals={goals} value={value} onChange={onChange} />
    </section>
  );
}
