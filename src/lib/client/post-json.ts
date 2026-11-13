// Sends a form's data to one of our route handlers and returns the message to show.
// The server decides everything; this only carries the answer back to the page.

/**
 * `next`: the page the server says to open next, if any (only a path on our own site).
 * `data`: the whole answer, for actions that return what they saved (for example { event }).
 */
export type PostResult = { ok: boolean; status: number; message: string; next?: string; data?: unknown };

const NETWORK_ERROR = "We could not reach the server. Check your connection and try again.";

/** Accepts only a path on our own site ("/reset-password"), never another site ("//evil.example"). */
function ownPath(value: unknown): string | undefined {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")
    ? value
    : undefined;
}

export async function postJson(path: string, body: unknown): Promise<PostResult> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as { message?: unknown; next?: unknown };
    const message = typeof data.message === "string" ? data.message : response.ok ? "" : NETWORK_ERROR;
    return { ok: response.ok, status: response.status, message, next: ownPath(data.next), data };
  } catch {
    return { ok: false, status: 0, message: NETWORK_ERROR };
  }
}

/** Reads data from one of our route handlers (a GET on our own site), in the same shape as postJson. */
export async function getJson(path: string): Promise<PostResult> {
  try {
    const response = await fetch(path, { method: "GET", headers: { accept: "application/json" }, cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as { message?: unknown };
    const message = typeof data.message === "string" ? data.message : response.ok ? "" : NETWORK_ERROR;
    return { ok: response.ok, status: response.status, message, data };
  } catch {
    return { ok: false, status: 0, message: NETWORK_ERROR };
  }
}
