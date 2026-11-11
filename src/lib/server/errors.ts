import "server-only";

// Turns what goes wrong inside an action into the answer the user sees.
// Rejected actions throw ActionError with the exact ontology message. Everything else becomes a
// neutral message; details go only to the server log, never to the browser.
import { MESSAGES } from "@/lib/messages";
import { AuthUnavailableError } from "./auth/types";
import { MissingConfigError } from "./config";
import { jsonError } from "./http";

/** A rejected action: HTTP status, a short code and the message from the ontology. */
export class ActionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ActionError";
  }
}

// Error codes of the Postgres driver that mean "the database cannot be reached or gave up".
const DATABASE_DOWN = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "CONNECT_TIMEOUT",
  "CONNECTION_CLOSED",
  "CONNECTION_ENDED",
  "CONNECTION_DESTROYED",
  "57014", // statement timeout (10 seconds)
  "57P01", // server shutting down
]);

/** Maps any thrown value to an answer. Used by `handleAction`; exported for tests. */
export function errorToResponse(error: unknown): Response {
  if (error instanceof ActionError) return jsonError(error.status, error.code, error.message);

  if (error instanceof AuthUnavailableError || error instanceof MissingConfigError) {
    console.error(error.message);
    return jsonError(503, "service_down", MESSAGES.authDown);
  }

  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && DATABASE_DOWN.has(code)) {
    console.error("Database not reachable:", code);
    return jsonError(503, "database_down", MESSAGES.databaseDown);
  }

  console.error("Unexpected error in an action:", error);
  return jsonError(500, "unexpected", MESSAGES.unexpected);
}

/** Runs an action and turns any thrown error into an answer. Every route handler goes through this. */
export async function handleAction(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    return errorToResponse(error);
  }
}
