// Tests for reject_draft (spec 19; ontology section 5, R1, R3): open -> rejected, nothing else; every
// other status and every foreign, missing or malformed id is refused and changes nothing.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { A5_PROPOSALS, draftsOf, seedDraft } from "@test/support/chat";
import { eventsOf } from "@test/support/events";
import { rejectDraft } from "./reject-draft";

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

function reject(id: string, headers?: Record<string, string>) {
  return rejectDraft(postJson(`/api/chat/drafts/${id}/reject`, {}, headers), app.deps, id);
}

describe("reject_draft", () => {
  it("turns an open draft 'rejected'; the calendar is not touched", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { draftId } = await seedDraft(app.db, alice, A5_PROPOSALS);
    expect(await read(await reject(draftId))).toEqual({ status: 200, body: { message: "Draft rejected.", draftId } });
    expect(await draftsOf(app.db, alice)).toEqual([{ id: draftId, status: "rejected" }]);
    expect(await eventsOf(app.db, alice)).toEqual([]);
  });

  it.each(["rejected", "replaced", "accepted"] as const)("refuses a %s draft: 'This draft is no longer open'", async (status) => {
    const alice = await app.signedInAs("alice@example.com");
    const { draftId } = await seedDraft(app.db, alice, A5_PROPOSALS, status);
    const before = await app.snapshot();
    expect(await read(await reject(draftId))).toEqual({ status: 409, body: { error: "draft_not_open", message: "This draft is no longer open" } });
    expect(await app.snapshot()).toEqual(before);
  });

  it("answers 'Not found' for another user's draft, a missing one and a malformed id (R3)", async () => {
    const bob = await app.signedInAs("bob@example.com");
    const bobs = await seedDraft(app.db, bob, A5_PROPOSALS);
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    for (const id of [bobs.draftId, "00000000-0000-4000-8000-000000000000", "x"]) {
      expect(await read(await reject(id)), id).toEqual({ status: 404, body: { error: "not_found", message: "Not found" } });
    }
    expect(await app.snapshot()).toEqual(before);
  });

  it("answers 401 without a session and 403 from another site", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const { draftId } = await seedDraft(app.db, alice, A5_PROPOSALS);
    expect((await reject(draftId, { origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status).toBe(403);
    await app.auth.signOut();
    expect((await reject(draftId)).status).toBe(401);
    expect(await draftsOf(app.db, alice)).toEqual([{ id: draftId, status: "open" }]);
  });
});
