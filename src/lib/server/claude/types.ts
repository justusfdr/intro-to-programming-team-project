import "server-only";

// The small interface between the coach's actions and Claude. Deps carries it; the real one is in
// ./client.ts, the tests use ./fake.ts and never call the real service.

export type AssistantRequest = {
  /** The fixed system prompt. */
  system: string;
  /** The user turn: one JSON block of data (src/lib/chat/input.ts). */
  data: string;
  /** The JSON schema the answer must follow (structured output). */
  schema: Record<string, unknown>;
};

/**
 * What came back:
 * - "answer": parsed JSON, not yet trusted (the caller runs every check of R23 on it);
 * - "failed": Claude answered, but refused, was cut off or did not send JSON ("failed our checks");
 * - "unavailable": the service could not be reached, refused the key, timed out or broke ("not available").
 */
export type AssistantResult =
  | { kind: "answer"; value: unknown }
  | { kind: "failed"; reason: "refusal" | "max_tokens" | "not_json" | "other_stop" }
  | { kind: "unavailable"; reason: string };

export interface Assistant {
  ask(request: AssistantRequest): Promise<AssistantResult>;
}
