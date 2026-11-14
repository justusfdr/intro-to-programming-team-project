// Tests for supabase/migrations/20261201000001_undo_keeps_travel_mode.sql: when the coach's accepted draft
// deleted an event, undo brings it back with its own travel mode. Undo data written before the migration
// (no travel mode in it) still restores the event, with none (the standard from the settings).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedEvent } from "@test/support/events";
import { createTestDb, type TestDb } from "./harness";

let db: TestDb;
let alice: string;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.admin("delete from auth.users");
  alice = await db.createUser("alice@example.com", { confirmed: true });
});

/** An open draft that deletes one event, written as the user (the way send_message saves it). */
async function deleteDraft(userId: string, event: { id: string; updatedAt: string }): Promise<string> {
  return db.withUser(userId, async (q) => {
    const [m] = await q<{ id: string }>("insert into app.chat_messages (role, text) values ('assistant', 'Free your afternoon') returning id");
    const [d] = await q<{ id: string }>(
      "insert into app.draft_plans (message_id, proposed_events, changes) values ($1::uuid, $2::text::jsonb, $3::text::jsonb) returning id",
      [m.id, "[]", JSON.stringify([{ kind: "delete", event_id: event.id, updated_at: event.updatedAt }])],
    );
    return d.id;
  });
}

const apply = (draftId: string) => db.withUser(alice, (q) => q("select id from app.chat_apply_draft_todos($1::uuid) as id", [draftId]));
const undo = (draftId: string) => db.withUser(alice, (q) => q("select app.chat_undo_draft($1)", [draftId]));
const events = () =>
  db.admin<{ title: string; travel_mode: string | null; location: string | null }>("select title, travel_mode, location from app.events where user_id = $1", [alice]);

async function lunchWith(mode: string | null) {
  const event = await seedEvent(db, alice, { title: "Lunch", start: "2026-12-01T12:30:00Z", end: "2026-12-01T13:30:00Z" });
  await db.admin("update app.events set travel_mode = $2, location = 'Rua Augusta 100' where id = $1", [event.id, mode]);
  const [row] = await db.admin<{ updated_at: Date }>("select updated_at from app.events where id = $1", [event.id]);
  return { id: event.id, updatedAt: new Date(row.updated_at).toISOString() };
}

describe("undo of a deleted event keeps its travel mode", () => {
  it("keeps the travel mode in the undo data and brings the event back with it", async () => {
    const draftId = await deleteDraft(alice, await lunchWith("transit"));
    await apply(draftId);
    expect(await events()).toEqual([]);
    const [{ undo: data }] = await db.admin<{ undo: { deleted: { travel_mode: string | null }[] } }>("select undo from app.draft_plans where id = $1", [draftId]);
    expect(data.deleted[0].travel_mode).toBe("transit");

    await undo(draftId);
    expect(await events()).toEqual([{ title: "Lunch", travel_mode: "transit", location: "Rua Augusta 100" }]);
  });

  it("brings back an event without a travel mode with none", async () => {
    const draftId = await deleteDraft(alice, await lunchWith(null));
    await apply(draftId);
    await undo(draftId);
    expect(await events()).toEqual([{ title: "Lunch", travel_mode: null, location: "Rua Augusta 100" }]);
  });

  it("restores undo data written before the migration (no travel mode in it), with none", async () => {
    const draftId = await deleteDraft(alice, await lunchWith("walking"));
    await apply(draftId);
    // The undo data as the earlier function wrote it: the same, without the key.
    await db.admin(
      `update app.draft_plans
          set undo = jsonb_set(undo, '{deleted}', (select jsonb_agg(x.value - 'travel_mode') from jsonb_array_elements(undo -> 'deleted') x))
        where id = $1`,
      [draftId],
    );
    await undo(draftId);
    expect(await events()).toEqual([{ title: "Lunch", travel_mode: null, location: "Rua Augusta 100" }]);
  });

  it("still refuses an undo that is no longer possible, and changes nothing", async () => {
    const draftId = await deleteDraft(alice, await lunchWith("driving"));
    await apply(draftId);
    await undo(draftId);
    await expect(undo(draftId)).rejects.toThrow(/no longer be undone/);
    expect(await events()).toHaveLength(1);
  });
});
