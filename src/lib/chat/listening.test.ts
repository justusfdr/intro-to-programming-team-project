// Spec 44: voice input's listening, with a stand-in for the browser's speech recognition. The fix it
// pins: after sending (or typing) nothing the browser still delivers comes back into the field; a
// second click on the microphone still takes the last words.
import { describe, expect, it } from "vitest";
import { createListening, MIC_NOT_ALLOWED, SPEECH_UNAVAILABLE, type ListeningState, type Recognition } from "./listening";

/** A recognition that does what the test tells it to, like the browser's. */
class FakeRecognition implements Recognition {
  lang = "";
  continuous = false;
  interimResults = false;
  onresult: Recognition["onresult"] = null;
  onerror: Recognition["onerror"] = null;
  onaudiostart: Recognition["onaudiostart"] = null;
  onend: Recognition["onend"] = null;
  started = false;
  stopped = false;
  aborted = false;
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
  }
  abort() {
    this.aborted = true;
  }
  /** The browser delivers everything heard so far (interim and final pieces). */
  hear(...pieces: string[]) {
    this.onresult?.({ results: Object.assign(pieces.map((p) => Object.assign([{ transcript: p }], { length: 1 })), { length: pieces.length }) });
  }
}

function setup() {
  const made: FakeRecognition[] = [];
  const field: string[] = [];
  const errors: string[] = [];
  const states: ListeningState[] = [];
  const listening = createListening(
    () => {
      const r = new FakeRecognition();
      made.push(r);
      return r;
    },
    () => ({ onText: (t) => field.push(t), onError: (e) => errors.push(e), onState: (s) => states.push(s) }),
  );
  return { listening, made, field, errors, states, last: () => field[field.length - 1] };
}

describe("listening", () => {
  it("listens for English, continuously, and puts what it hears after the typed text", () => {
    const t = setup();
    t.listening.start("Tomorrow");
    const r = t.made[0];
    expect([r.lang, r.continuous, r.interimResults, r.started]).toEqual(["en-US", true, true, true]);
    expect(t.states).toEqual([{ listening: true, hearing: false }]);
    r.onaudiostart?.();
    expect(t.states.at(-1)).toEqual({ listening: true, hearing: true });
    r.hear("I want to");
    r.hear("I want to", "study four hours");
    expect(t.last()).toBe("Tomorrow I want to study four hours");
  });

  it("sending: after discard, what the browser still delivers does not come back into the field", () => {
    const t = setup();
    t.listening.start("");
    const r = t.made[0];
    r.hear("study four hours");
    expect(t.last()).toBe("study four hours");

    t.listening.discard(); // the message is sent and the field emptied
    expect(r.aborted).toBe(true);
    expect(t.states.at(-1)).toEqual({ listening: false, hearing: false });

    // The browser's late final result and its end arrive afterwards.
    r.hear("study four hours tomorrow");
    r.onerror?.({ error: "network" });
    r.onend?.();
    expect(t.field).toEqual(["study four hours"]);
    expect(t.errors).toEqual([]);
  });

  it("a second click on the microphone (stop) still takes the last words", () => {
    const t = setup();
    t.listening.start("");
    const r = t.made[0];
    r.hear("go for a");
    t.listening.stop();
    expect(r.stopped).toBe(true);
    r.hear("go for a run");
    r.onend?.();
    expect(t.last()).toBe("go for a run");
    expect(t.states.at(-1)).toEqual({ listening: false, hearing: false });
  });

  it("a discarded listening's late end does not end a new one", () => {
    const t = setup();
    t.listening.start("");
    const first = t.made[0];
    t.listening.discard();
    t.listening.start("Again");
    const second = t.made[1];
    first.onend?.();
    expect(t.states.at(-1)).toEqual({ listening: true, hearing: false });
    second.hear("hello");
    expect(t.last()).toBe("Again hello");
  });

  it("does not start twice; discard and stop without listening do nothing", () => {
    const t = setup();
    t.listening.discard();
    t.listening.stop();
    t.listening.start("");
    t.listening.start("");
    expect(t.made).toHaveLength(1);
  });

  it("says in plain words when the microphone is not allowed or speech is unavailable; nothing for silence", () => {
    const t = setup();
    t.listening.start("");
    t.made[0].onerror?.({ error: "not-allowed" });
    t.made[0].onerror?.({ error: "no-speech" });
    t.made[0].onerror?.({ error: "network" });
    expect(t.errors).toEqual([MIC_NOT_ALLOWED, SPEECH_UNAVAILABLE]);

    const broken = createListening(
      () => {
        throw new Error("no");
      },
      () => ({ onText: () => {}, onError: (e) => t.errors.push(e), onState: () => {} }),
    );
    broken.start("");
    expect(t.errors.at(-1)).toBe(SPEECH_UNAVAILABLE);
  });
});
