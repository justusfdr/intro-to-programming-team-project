// Spec 43: the two ways into the coach from a goal (the setup's success screen and the goal card) go
// to /coach?plan=<goal id>. The coach page reads the parameter on the server: only the id of one of the
// user's own goals fills the message field with a sentence to send; anything else is ignored without a
// trace. Nothing is sent until the person sends it. Pure: the page passes the goals it read (row-level
// security already limits them to the user's own).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Where "Plan with coach" goes. */
export function planGoalHref(goalId: string): string {
  return `/coach?plan=${encodeURIComponent(goalId)}`;
}

/** The sentence the field starts with, or null for anything that is not one of these goals' ids. */
export function planGoalText(param: string | string[] | undefined, goals: readonly { id: string; title: string }[]): string | null {
  if (typeof param !== "string" || !UUID.test(param)) return null;
  const goal = goals.find((g) => g.id.toLowerCase() === param.toLowerCase());
  return goal ? `Plan "${goal.title}" into my week.` : null;
}
