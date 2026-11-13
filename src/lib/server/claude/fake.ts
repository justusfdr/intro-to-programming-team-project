import "server-only";

// A stand-in for Claude in tests: answers what the test tells it to and remembers every request, so a
// test can check what would have been sent (R22) and that Claude was not called at all (A4, A6).
import type { Assistant, AssistantRequest, AssistantResult } from "./types";

export class FakeAssistant implements Assistant {
  readonly requests: AssistantRequest[] = [];
  private next: AssistantResult[] = [];

  /** The answers of the next calls, in order. Without one, a call answers a short text. */
  answer(...results: AssistantResult[]): void {
    this.next.push(...results);
  }

  /** Shortcut: the next call answers this JSON value. */
  answerJson(value: unknown): void {
    this.answer({ kind: "answer", value });
  }

  async ask(request: AssistantRequest): Promise<AssistantResult> {
    this.requests.push(request);
    return this.next.shift() ?? { kind: "answer", value: { kind: "text", text: "Okay.", events: [] } };
  }

  /** The data block of the last call, parsed. */
  lastData(): Record<string, unknown> {
    const last = this.requests[this.requests.length - 1];
    if (!last) throw new Error("FakeAssistant: no request was made");
    return JSON.parse(last.data) as Record<string, unknown>;
  }

  reset(): void {
    this.requests.length = 0;
    this.next = [];
  }
}
