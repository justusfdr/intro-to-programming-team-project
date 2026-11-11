// Sends a form's data to one of our route handlers and returns the message to show.
// The server decides everything; this only carries the answer back to the page.

export type PostResult = { ok: boolean; status: number; message: string };

const NETWORK_ERROR = "We could not reach the server. Check your connection and try again.";

export async function postJson(path: string, body: unknown): Promise<PostResult> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as { message?: unknown };
    const message = typeof data.message === "string" ? data.message : NETWORK_ERROR;
    return { ok: response.ok, status: response.status, message };
  } catch {
    return { ok: false, status: 0, message: NETWORK_ERROR };
  }
}
