// Which goal sections the user collapsed in the goals column. Kept only in this browser
// (localStorage), never in the database: it is a view setting, not app data. Pure, no React.

export const COLLAPSED_KEY = "lock-in:goals-collapsed:v1";

/** Adds the goal to the list, or removes it when it is there already. */
export function toggleCollapsed(collapsed: readonly string[], goalId: string): string[] {
  return collapsed.includes(goalId) ? collapsed.filter((id) => id !== goalId) : [...collapsed, goalId];
}

/**
 * Reads the stored list. Broken or missing data gives an empty list; ids of goals that no longer
 * exist are dropped, so the list cannot grow without end.
 */
export function readCollapsed(raw: string | null, goalIds: readonly string[]): string[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const known = new Set(goalIds);
    return [...new Set(data.filter((id): id is string => typeof id === "string" && known.has(id)))];
  } catch {
    return [];
  }
}
