// Tests for save_widgets (spec 45, R46): a widget list is saved only if every widget is one of the six
// kinds in one of its sizes, only a goal widget names a goal, and all fit in the 3 x 6 grid. Every
// rejected case leaves the saved value as it was (R1).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { DEFAULT_LAYOUT, type WidgetItem } from "@/lib/widgets/types";
import { saveWidgets } from "./save-widgets";

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.reset();
});

function send(body: unknown, headers?: Record<string, string>) {
  return saveWidgets(postJson("/api/widgets", body, headers), app.deps);
}

async function savedOf(userId: string) {
  const [row] = await app.db.admin<{ widgets: unknown }>("select widgets from app.settings where user_id = $1", [userId]);
  return row.widgets;
}

const GOAL_ID = "0f6f7d5e-1c1e-4a39-9a55-0d6a3f2f9c11";
const SAVED: WidgetItem[] = [{ kind: "focus", size: "1x1" }, { kind: "free", size: "3x1" }];

/** Saves SAVED first, so a refusal can be shown to leave it as it was. */
async function withSaved() {
  const alice = await app.signedInAs("alice@example.com");
  expect((await send({ layout: SAVED })).status).toBe(200);
  return alice;
}

describe("save_widgets accepted", () => {
  it("saves a list and answers with it", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const answer = await read(await send({ layout: SAVED }));
    expect(answer).toEqual({ status: 200, body: { layout: SAVED, isDefault: false } });
    expect(await savedOf(alice)).toEqual(SAVED);
  });

  it("saves a full grid: the standard list, and 18 small widgets", async () => {
    const alice = await app.signedInAs("alice@example.com");
    expect((await read(await send({ layout: DEFAULT_LAYOUT }))).body).toEqual({ layout: DEFAULT_LAYOUT, isDefault: false });
    const eighteen = Array.from({ length: 18 }, () => ({ kind: "focus", size: "1x1" }));
    expect((await send({ layout: eighteen })).status).toBe(200);
    expect(await savedOf(alice)).toEqual(eighteen);
  });

  it("saves the empty list (the user removed everything), which is not the standard list", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const answer = await read(await send({ layout: [] }));
    expect(answer).toEqual({ status: 200, body: { layout: [], isDefault: false } });
    expect(await savedOf(alice)).toEqual([]);
  });

  it("saves a goal widget with a goal id, or with none (the first goal)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const layout = [{ kind: "goal", size: "1x1", goalId: GOAL_ID }, { kind: "goal", size: "1x1" }];
    const answer = await read(await send({ layout }));
    expect(answer.body).toEqual({ layout: [{ kind: "goal", size: "1x1", goalId: GOAL_ID }, { kind: "goal", size: "1x1", goalId: null }], isDefault: false });
    expect(await savedOf(alice)).toEqual([{ kind: "goal", size: "1x1", goalId: GOAL_ID }, { kind: "goal", size: "1x1", goalId: null }]);
  });

  it("reset brings back the standard list: nothing is saved any more", async () => {
    const alice = await withSaved();
    const answer = await read(await send({ reset: true }));
    expect(answer).toEqual({ status: 200, body: { layout: DEFAULT_LAYOUT, isDefault: true } });
    expect(await savedOf(alice)).toBeNull();
  });

  it("saves only the signed-in user's own row", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const bob = await app.signedInAs("bob@example.com");
    await send({ layout: SAVED });
    expect(await savedOf(bob)).toEqual(SAVED);
    expect(await savedOf(alice)).toBeNull();
  });
});

describe("save_widgets rejected (R46): nothing changes", () => {
  async function expectRefused(body: unknown, status: number, message?: string, headers?: Record<string, string>) {
    const alice = await withSaved();
    const before = await app.snapshot();
    const answer = await read(await send(body, headers));
    expect(answer.status).toBe(status);
    if (message) expect(answer.body.message).toBe(message);
    expect(await app.snapshot()).toEqual(before);
    expect(await savedOf(alice)).toEqual(SAVED);
  }

  it("a 19th field: 19 small widgets", async () => {
    await expectRefused({ layout: Array.from({ length: 19 }, () => ({ kind: "focus", size: "1x1" })) }, 400, "The widgets do not fit. Remove one first");
  });

  it("widgets that together do not fit the grid", async () => {
    const layout = [...DEFAULT_LAYOUT, { kind: "focus", size: "1x1" }];
    await expectRefused({ layout }, 400, "The widgets do not fit. Remove one first");
  });

  it("a wrong size for the kind", async () => {
    await expectRefused({ layout: [{ kind: "focus", size: "3x2" }] }, 400, "This widget does not come in that size");
    await expectRefused({ layout: [{ kind: "weather", size: "3x4" }] }, 400, "This widget does not come in that size");
    await expectRefused({ layout: [{ kind: "focus", size: "2x2" }] }, 400, "This widget does not come in that size");
    await expectRefused({ layout: [{ kind: "focus" }] }, 400, "This widget does not come in that size");
  });

  it("an unknown kind", async () => {
    await expectRefused({ layout: [{ kind: "clock", size: "1x1" }] }, 400, "Choose a widget from the list");
    await expectRefused({ layout: [{ size: "1x1" }] }, 400, "Choose a widget from the list");
  });

  it("a goal id on a weather widget", async () => {
    await expectRefused({ layout: [{ kind: "weather", size: "3x2", goalId: GOAL_ID }] }, 400, "Choose one of your goals");
  });

  it("a goal widget with something that is not a goal id", async () => {
    await expectRefused({ layout: [{ kind: "goal", size: "1x1", goalId: "first" }] }, 400, "Choose one of your goals");
    await expectRefused({ layout: [{ kind: "goal", size: "1x1", goalId: 5 }] }, 400, "Choose one of your goals");
  });

  it("an entry with a field it should not have, or that is not an object", async () => {
    await expectRefused({ layout: [{ kind: "focus", size: "1x1", color: "red" }] }, 400);
    await expectRefused({ layout: ["focus"] }, 400);
    await expectRefused({ layout: [null] }, 400);
  });

  it("a body that is not a list, has other fields, or both layout and reset", async () => {
    await expectRefused({ layout: "focus" }, 400);
    await expectRefused({ layout: SAVED, extra: 1 }, 400);
    await expectRefused({ layout: SAVED, reset: true }, 400);
    await expectRefused({ reset: false }, 400);
    await expectRefused({ reset: "yes" }, 400);
    await expectRefused({}, 400);
    await expectRefused("not json", 400);
  });

  it("a request from another origin", async () => {
    await expectRefused({ layout: [] }, 403, undefined, { origin: "https://evil.example", "sec-fetch-site": "cross-site" });
    await expectRefused({ reset: true }, 403, undefined, { origin: "https://evil.example", "sec-fetch-site": "cross-site" });
  });

  it("signed out: 401, and nothing is saved", async () => {
    const alice = await withSaved();
    await app.auth.signOut();
    const before = await app.snapshot();
    expect((await send({ layout: [] })).status).toBe(401);
    expect((await send({ reset: true })).status).toBe(401);
    expect(await app.snapshot()).toEqual(before);
    expect(await savedOf(alice)).toEqual(SAVED);
  });
});
