// The shape of a to-do inside an event as the server sends it to the page (spec 21). The list comes in
// its order; the place itself is not sent.

export type TodoDto = {
  id: string;
  title: string;
  done: boolean;
};

/** A to-do that is not saved yet: in the editor of a new event, or kept to bring a deleted event back. */
export type NewTodo = { title: string; done: boolean };

/** At most this many to-dos per event (spec 21). */
export const MAX_TODOS = 20;
/** A to-do's title: 1 to this many characters. */
export const MAX_TODO_TITLE = 100;

/** "2/3": how many are done of how many. */
export function todoCountText(done: number, total: number): string {
  return `${done}/${total}`;
}
