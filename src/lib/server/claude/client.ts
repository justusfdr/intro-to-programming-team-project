import "server-only";

// The Claude module: the only place that talks to the Claude API (AGENTS.md: one module per service).
// One request per message, no streaming: structured output (output_config.format), effort "medium",
// thinking left at the model's default (it cannot be switched off on the default model), max_tokens
// 16000, a 60-second timeout and at most one retry. The key comes from config.ts and is never logged.
// Only the kind of a failure and its HTTP status are logged, never what was sent or answered.
import Anthropic from "@anthropic-ai/sdk";
import { anthropicConfig } from "@/lib/server/config";
import type { Assistant, AssistantRequest, AssistantResult } from "./types";

const TIMEOUT_MS = 60_000;
const MAX_RETRIES = 1;
const MAX_TOKENS = 16_000;

/**
 * Models that take server-side refusal fallbacks (`fallbacks: "default"`). Claude Haiku 5.5 has none:
 * the parameter must not be sent to it, so the owner can switch ANTHROPIC_MODEL to it to save money.
 * Any model not on this list is called without fallbacks.
 */
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-2", "claude-fable-5-1"]);
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export function acceptsFallbacks(model: string): boolean {
  return FALLBACK_MODELS.has(model);
}

/** The request body, built separately so a test can check it without calling the service. */
export function requestBody(model: string, request: AssistantRequest): Anthropic.Beta.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: MAX_TOKENS,
    system: request.system,
    messages: [{ role: "user", content: request.data }],
    output_config: { effort: "medium", format: { type: "json_schema", schema: request.schema } },
    ...(acceptsFallbacks(model) ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
  };
}

/** Turns a thrown error into the kind we log (most specific first). Never includes the message text. */
export function errorKind(error: unknown): { kind: string; status?: number } {
  if (error instanceof Anthropic.APIConnectionTimeoutError) return { kind: "timeout" };
  if (error instanceof Anthropic.APIConnectionError) return { kind: "connection" };
  if (error instanceof Anthropic.AuthenticationError) return { kind: "authentication", status: error.status };
  if (error instanceof Anthropic.PermissionDeniedError) return { kind: "permission", status: error.status };
  if (error instanceof Anthropic.RateLimitError) return { kind: "rate_limit", status: error.status };
  if (error instanceof Anthropic.BadRequestError) return { kind: "bad_request", status: error.status };
  if (error instanceof Anthropic.InternalServerError) return { kind: "server_error", status: error.status };
  if (error instanceof Anthropic.APIError) return { kind: "api_error", status: error.status };
  return { kind: "unexpected" };
}

/** `testing` lets the tests hand in a stand-in for the network (they never call the real service). */
export function createClaudeAssistant(
  config: { apiKey: string; model: string },
  testing: { fetch?: typeof fetch; timeout?: number } = {},
): Assistant {
  const client = new Anthropic({
    apiKey: config.apiKey,
    timeout: testing.timeout ?? TIMEOUT_MS,
    maxRetries: MAX_RETRIES,
    ...(testing.fetch ? { fetch: testing.fetch } : {}),
  });
  return {
    async ask(request): Promise<AssistantResult> {
      let response: Anthropic.Beta.BetaMessage;
      try {
        response = await client.beta.messages.create(requestBody(config.model, request));
      } catch (error) {
        const { kind, status } = errorKind(error);
        console.error("Claude call failed:", kind, status ?? "");
        return { kind: "unavailable", reason: kind };
      }

      if (response.stop_reason === "refusal") {
        console.error("Claude answer not used:", "refusal", response.stop_details?.category ?? "");
        return { kind: "failed", reason: "refusal" };
      }
      if (response.stop_reason === "max_tokens") {
        console.error("Claude answer not used:", "max_tokens");
        return { kind: "failed", reason: "max_tokens" };
      }
      if (response.stop_reason !== "end_turn") {
        console.error("Claude answer not used:", "stop_reason", response.stop_reason ?? "");
        return { kind: "failed", reason: "other_stop" };
      }
      const text = response.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("");
      try {
        return { kind: "answer", value: JSON.parse(text) as unknown };
      } catch {
        console.error("Claude answer not used:", "not_json");
        return { kind: "failed", reason: "not_json" };
      }
    },
  };
}

let cached: { key: string; assistant: Assistant } | null = null;

/** The real assistant for this server, or null when ANTHROPIC_API_KEY is not set. */
export function claudeAssistant(): Assistant | null {
  const config = anthropicConfig();
  if (!config) return null;
  const key = `${config.model}\u0000${config.apiKey}`;
  if (!cached || cached.key !== key) cached = { key, assistant: createClaudeAssistant(config) };
  return cached.assistant;
}
