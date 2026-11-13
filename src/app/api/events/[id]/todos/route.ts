import { addTodo, listTodos } from "@/lib/server/actions/event-todos";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the actions themselves (and their tests) live in src/lib/server/actions/event-todos.ts.
// GET: the event's to-dos for its editor. POST: add_todo.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return listTodos(request, await realDeps(), id);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return addTodo(request, await realDeps(), id);
}
