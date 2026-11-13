// Tests for the Claude module (spec 19) with a stand-in for the network: the request it sends, and how
// each kind of answer or failure comes back. No test calls the real service.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANSWER_JSON_SCHEMA, SYSTEM_PROMPT } from "@/lib/chat/prompt";
import { acceptsFallbacks, createClaudeAssistant, requestBody } from "./client";

const REQUEST = { system: SYSTEM_PROMPT, data: '{"message":"Plan tomorrow"}', schema: ANSWER_JSON_SCHEMA };
const KEY = "test-key-not-real";

type Sent = { url: string; headers: Headers; body: Record<string, unknown> };

/** A fetch that records the request and answers with `status` and `body`. */
function network(answers: { status: number; body: unknown }[]) {
  const sent: Sent[] = [];
  const fake = (async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({ url: String(input), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    const answer = answers.shift() ?? { status: 500, body: { type: "error", error: { type: "api_error", message: "x" } } };
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fake, sent };
}

function message(change: Record<string, unknown> = {}) {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text: '{"kind":"text","text":"Hi","events":[]}' }],
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 10, output_tokens: 5 },
    ...change,
  };
}

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errors.mockRestore();
});

describe("the request", () => {
  it("uses structured output, effort medium, 16000 tokens, no thinking, no streaming, and fallbacks on the default model", () => {
    const body = requestBody("claude-opus-5-5", REQUEST);
    expect(body).toEqual({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: '{"message":"Plan tomorrow"}' }],
      output_config: { effort: "medium", format: { type: "json_schema", schema: ANSWER_JSON_SCHEMA } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    expect(body).not.toHaveProperty("thinking");
    expect(body).not.toHaveProperty("stream");
  });

  it("sends no fallbacks to Claude Haiku 5.5 or an unknown model", () => {
    expect(acceptsFallbacks("claude-haiku-5-5")).toBe(false);
    expect(requestBody("claude-haiku-5-5", REQUEST)).not.toHaveProperty("fallbacks");
    expect(requestBody("claude-haiku-5-5", REQUEST)).not.toHaveProperty("betas");
    expect(requestBody("some-other-model", REQUEST)).not.toHaveProperty("fallbacks");
  });

  it("sends the key only in its header, and the beta flag for fallbacks", async () => {
    const { fake, sent } = network([{ status: 200, body: message() }]);
    await createClaudeAssistant({ apiKey: KEY, model: "claude-opus-5-5" }, { fetch: fake }).ask(REQUEST);
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toMatch(/\/v1\/messages/);
    // SDK 1.x sends the key as a bearer token (and API version 2026-10-21).
    expect(sent[0].headers.get("authorization")).toBe(`Bearer ${KEY}`);
    expect(sent[0].headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(JSON.stringify(sent[0].body)).not.toContain(KEY);
  });
});

describe("answers", () => {
  it("hands back the parsed JSON of a normal answer (not yet trusted)", async () => {
    const { fake } = network([{ status: 200, body: message() }]);
    const result = await createClaudeAssistant({ apiKey: KEY, model: "claude-opus-5-5" }, { fetch: fake }).ask(REQUEST);
    expect(result).toEqual({ kind: "answer", value: { kind: "text", text: "Hi", events: [] } });
  });

  it.each([
    ["a refusal", message({ stop_reason: "refusal", content: [], stop_details: { type: "refusal", category: "cyber", explanation: "x" } }), "refusal"],
    ["an answer cut off at max_tokens", message({ stop_reason: "max_tokens" }), "max_tokens"],
    ["an answer that is not JSON", message({ content: [{ type: "text", text: "Sure! Here is" }] }), "not_json"],
  ])("treats %s as a failed answer", async (_case, body, reason) => {
    const { fake } = network([{ status: 200, body }]);
    const result = await createClaudeAssistant({ apiKey: KEY, model: "claude-opus-5-5" }, { fetch: fake }).ask(REQUEST);
    expect(result).toEqual({ kind: "failed", reason });
  });
});

describe("the service is not available", () => {
  it.each([
    ["a wrong key (401)", 401, "authentication"],
    ["too many requests (429)", 429, "rate_limit"],
    ["a server error (500)", 500, "server_error"],
    ["overloaded (529)", 529, "server_error"],
    ["a bad request (400)", 400, "bad_request"],
  ])("answers 'unavailable' for %s and logs only the kind and status", async (_case, status, kind) => {
    const error = { status, body: { type: "error", error: { type: "x", message: "secret details" } } };
    const { fake } = network([error, error]);
    const result = await createClaudeAssistant({ apiKey: KEY, model: "claude-opus-5-5" }, { fetch: fake }).ask(REQUEST);
    expect(result).toEqual({ kind: "unavailable", reason: kind });
    const logged = JSON.stringify(errors.mock.calls);
    expect(logged).toContain(kind);
    expect(logged).not.toContain("secret details");
    expect(logged).not.toContain(KEY);
    expect(logged).not.toContain("Plan tomorrow");
  });

  it("retries at most once", async () => {
    const error = { status: 500, body: { type: "error", error: { type: "api_error", message: "x" } } };
    const { fake, sent } = network([error, error, error]);
    await createClaudeAssistant({ apiKey: KEY, model: "claude-opus-5-5" }, { fetch: fake }).ask(REQUEST);
    expect(sent).toHaveLength(2);
  });

  it("answers 'unavailable' when the network fails or times out", async () => {
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    expect(await createClaudeAssistant({ apiKey: KEY, model: "claude-opus-5-5" }, { fetch: down }).ask(REQUEST)).toEqual({
      kind: "unavailable",
      reason: "connection",
    });

    const slow = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      })) as typeof fetch;
    expect(await createClaudeAssistant({ apiKey: KEY, model: "claude-opus-5-5" }, { fetch: slow, timeout: 20 }).ask(REQUEST)).toEqual({
      kind: "unavailable",
      reason: "timeout",
    });
  });
});
