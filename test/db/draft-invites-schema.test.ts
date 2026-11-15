// Tests for supabase/migrations/*_draft_invites.sql (spec 37; ontology R67, R68): that the existing
// draft functions accept and keep the two new keys of a proposed event ("invite_contacts" and
// "demo_people") unchanged, and app.chat_draft_remove_person: only the user's own open draft, only with
// the version last seen (R4), only a person the event lists; everything else of the draft stays. Each
// rule with an accepted and a refused case; a refusal changes nothing.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./harness";

let db: TestDb;
let alice: string;
let bob: string;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.admin("delete from auth.users");
  alice = await db.createUser("alice@example.com", { confirmed: true });
  bob = await db.createUser("bob@example.com", { confirmed: true });
});

const CONTACT_A = "11111111-1111-4111-8111-111111111111";
const CONTACT_B = "22222222-2222-4222-8222-222222222222";

const EVENTS = [
  { title: "Sport", start_at: "2030-01-08T18:30:00.000Z", end_at: "2030-01-08T19:30:00.000Z", goal_id: null, invite_contacts: [CONTACT_A, CONTACT_B], demo_people: ["demo-lea"] },
  { title: "Study", start_at: "2030-01-08T10:00:00.000Z", end_at: "2030-01-08T11:00:00.000Z", goal_id: null, todos: ["Read chapter 3"] },
];

/** An assistant message with a draft, written as the user (the way send_message saves it). */
async function draftAs(userId: string, events: unknown): Promise<string> {
  return db.withUser(userId, async (q) => {
    const [m] = await q<{ id: string }>("insert into app.chat_messages (role, text) values ('assistant', 'Here is a plan') returning id");
    const [d] = await q<{ id: string }>(
      "insert into app.draft_plans (message_id, proposed_events, changes, added_todos) values ($1, $2::text::jsonb, '[]'::jsonb, '[]'::jsonb) returning id",
      [m.id, JSON.stringify(events)],
    );
    return d.id;
  });
}

const removePerson = (userId: string, draftId: string, version: number, index: number, person: string) =>
  db.withUser(userId, async (q) => {
    const [row] = await q<{ version: number }>("select app.chat_draft_remove_person($1::uuid, $2::integer, $3::integer, $4::text) as version", [
      draftId,
      version,
      index,
      person,
    ]);
    return row.version;
  });

const draftOf = async (draftId: string) =>
  (await db.admin<{ version: number; status: string; proposed_events: unknown }>("select version, status, proposed_events from app.draft_plans where id = $1", [draftId]))[0];

describe("the existing draft functions and the new keys", () => {
  it("a draft with invited people is saved as written, and a drag keeps them", async () => {
    const draftId = await draftAs(alice, EVENTS);
    expect((await draftOf(draftId)).proposed_events).toEqual(EVENTS);
    await db.withUser(alice, (q) =>
      q("select app.chat_edit_draft($1, 0, 0, null, '2030-01-08T19:00:00Z'::timestamptz, '2030-01-08T20:00:00Z'::timestamptz)", [draftId]),
    );
    expect((await draftOf(draftId)).proposed_events).toEqual([
      { ...EVENTS[0], start_at: "2030-01-08T19:00:00.000Z", end_at: "2030-01-08T20:00:00.000Z" },
      EVENTS[1],
    ]);
  });

  it("applying it creates the events from their own fields only (the people are invited by our server)", async () => {
    const draftId = await draftAs(alice, EVENTS);
    await db.withUser(alice, (q) => q("select app.chat_apply_draft_todos($1::uuid)", [draftId]));
    expect(await db.admin("select title, source from app.events where user_id = $1 order by start_at", [alice])).toEqual([
      { title: "Study", source: "assistant" },
      { title: "Sport", source: "assistant" },
    ]);
    expect(await db.admin("select * from app.event_invites")).toEqual([]);
  });
});

describe("app.chat_draft_remove_person", () => {
  it("accepted: takes one contact off, keeps the others and everything else, and moves the version on", async () => {
    const draftId = await draftAs(alice, EVENTS);
    expect(await removePerson(alice, draftId, 0, 0, CONTACT_A)).toBe(1);
    expect((await draftOf(draftId)).proposed_events).toEqual([{ ...EVENTS[0], invite_contacts: [CONTACT_B] }, EVENTS[1]]);
  });

  it("accepted: the last one of a list takes the list away; a demo person comes off their own list", async () => {
    const draftId = await draftAs(alice, EVENTS);
    await removePerson(alice, draftId, 0, 0, "demo-lea");
    await removePerson(alice, draftId, 1, 0, CONTACT_A);
    await removePerson(alice, draftId, 2, 0, CONTACT_B);
    const { title, start_at, end_at, goal_id } = EVENTS[0];
    expect(await draftOf(draftId)).toEqual({ version: 3, status: "open", proposed_events: [{ title, start_at, end_at, goal_id }, EVENTS[1]] });
  });

  it("refused: another user's draft, an old version, a draft that is not open, a person or event it does not list", async () => {
    const draftId = await draftAs(alice, EVENTS);
    await expect(removePerson(bob, draftId, 0, 0, CONTACT_A)).rejects.toThrow(/Not found/);
    await expect(removePerson(alice, draftId, 4, 0, CONTACT_A)).rejects.toThrow(/Changed on another device/);
    await expect(removePerson(alice, draftId, 0, 1, CONTACT_A)).rejects.toThrow(/Not found/);
    await expect(removePerson(alice, draftId, 0, 9, CONTACT_A)).rejects.toThrow(/Not found/);
    await expect(removePerson(alice, draftId, 0, 0, "33333333-3333-4333-8333-333333333333")).rejects.toThrow(/Not found/);
    await expect(removePerson(alice, draftId, 0, 0, "demo-jonas")).rejects.toThrow(/Not found/);
    await db.admin("update app.draft_plans set status = 'rejected' where id = $1", [draftId]);
    await expect(removePerson(alice, draftId, 0, 0, CONTACT_A)).rejects.toThrow(/no longer open/);
    expect(await draftOf(draftId)).toEqual({ version: 0, status: "rejected", proposed_events: EVENTS });
  });

  it("gives visitors who are not signed in no right to it", async () => {
    const fn = "app.chat_draft_remove_person(uuid, integer, integer, text)";
    const [row] = await db.admin<{ anon: boolean; user: boolean }>(
      `select has_function_privilege('anon', '${fn}', 'execute') as anon, has_function_privilege('authenticated', '${fn}', 'execute') as user`,
    );
    expect(row).toEqual({ anon: false, user: true });
  });
});
