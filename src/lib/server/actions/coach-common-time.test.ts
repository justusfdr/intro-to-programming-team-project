// Tests for spec 37 (ontology R22 extended, R65 to R68) on the server, with the fake assistant and the
// temporary database: who is sent (named, sharing, at most 5), exactly what is sent of them (an
// allow-list of keys; never a title, place, level, id or address, also at "details"), the unchanged
// request when nobody is named, the checks of an answer that invites people, accepting with invitations
// (the invited person sees the event as not answered yet), the atomic failure, the fresh re-check at
// accept after a drag or a withdrawn share, undo, and taking someone off before accepting.
// The database decides "not ended" by its own clock, so these tests run the fake clock in January 2030.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { setPlan } from "@test/support/chat";
import { seedEvent } from "@test/support/events";
import { ANSWER_JSON_SCHEMA, ANSWER_JSON_SCHEMA_WITH_PEOPLE, SYSTEM_PROMPT, SYSTEM_PROMPT_WITH_PEOPLE } from "@/lib/chat/prompt";
import { requestBody } from "@/lib/server/claude/client";
import type { Deps } from "@/lib/server/deps";
import type { Query } from "@/lib/server/db";
import { readPeople } from "@/lib/server/profiles/cards";
import { acceptDraft } from "./accept-draft";
import { editDraft } from "./edit-draft";
import { removeDraftPerson } from "./remove-draft-person";
import { sendMessage } from "./send-message";
import { undoDraft } from "./undo-draft";

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

/** Monday 7 January 2030, 09:00 UTC (09:00 in Lisbon). */
const MONDAY = Date.parse("2030-01-07T09:00:00Z");

beforeEach(async () => {
  await app.reset();
  app.advance(MONDAY - app.now().getTime());
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const send = (text: string, deps: Deps = app.deps) => sendMessage(postJson("/api/chat/messages", { text }), deps);
const accept = (draftId: string, deps: Deps = app.deps) => acceptDraft(postJson(`/api/chat/drafts/${draftId}/accept`, {}), deps, draftId);
const undo = (draftId: string) => undoDraft(postJson(`/api/chat/drafts/${draftId}/undo`, {}), app.deps, draftId);
const takeOff = (draftId: string, body: unknown) => removeDraftPerson(postJson(`/api/chat/drafts/${draftId}/people`, body), app.deps, draftId);

/**
 * Ana is signed in at the end and has Pro. Her contacts: Emily Stone (shares her calendar as free/busy,
 * time zone Berlin), Dora Dias (details), Lucas Lima (only the focus chart), Bruno Brandt (nothing).
 * Emily is busy Tuesday 17:00 to 18:30 UTC (two touching events) and Wednesday 09:00 to 10:00; Dora has
 * "Dentist" at "Rua Secreta 1" with notes on Tuesday 08:00 to 09:00.
 */
async function people() {
  const emily = await app.signedInAs("emily@example.com", { timeZone: "Europe/Berlin" });
  const dora = await app.signedInAs("dora@example.com");
  const lucas = await app.signedInAs("lucas@example.com");
  const bruno = await app.signedInAs("bruno@example.com");
  const ana = await app.signedInAs("ana@example.com");
  const contactOf = async (other: string, email: string, name: string) => {
    await app.db.withUser(ana, (q) => q("select app.invite_contact($1)", [email]));
    const received = (await app.db.withUser(other, readPeople)).received[0];
    await app.db.withUser(other, (q) => q("select app.answer_invitation($1::uuid, true)", [received.id]));
    await app.db.admin("update app.profiles set display_name = $2 where id = $1", [other, name]);
    return (await app.db.withUser(ana, readPeople)).contacts.find((c) => c.userId === other)!.id;
  };
  const anaEmily = await contactOf(emily, "emily@example.com", "Emily Stone");
  const anaDora = await contactOf(dora, "dora@example.com", "Dora Dias");
  const anaLucas = await contactOf(lucas, "lucas@example.com", "Lucas Lima");
  const anaBruno = await contactOf(bruno, "bruno@example.com", "Bruno Brandt");
  const share = (owner: string, contact: string, calendar: string, focus = false) =>
    app.db.withUser(owner, (q) => q("select app.set_share($1::uuid, $2::text, $3::boolean)", [contact, calendar, focus]));
  await share(emily, anaEmily, "busy");
  await share(dora, anaDora, "details");
  await share(lucas, anaLucas, "none", true);
  await seedEvent(app.db, emily, { title: "Physio", start: "2030-01-08T17:00:00Z", end: "2030-01-08T18:00:00Z" });
  await seedEvent(app.db, emily, { title: "Choir", start: "2030-01-08T18:00:00Z", end: "2030-01-08T18:30:00Z" });
  await seedEvent(app.db, emily, { title: "Lecture", start: "2030-01-09T09:00:00Z", end: "2030-01-09T10:00:00Z" });
  await app.db.admin(
    "insert into app.events (user_id, title, start_at, end_at, location, notes) values ($1, 'Dentist', '2030-01-08T08:00:00Z', '2030-01-08T09:00:00Z', 'Rua Secreta 1', 'Bring the card')",
    [dora],
  );
  await setPlan(app.db, ana, "pro");
  return { ana, emily, dora, lucas, bruno, anaEmily, anaDora, anaLucas, anaBruno, share };
}

const lastRequest = () => app.assistant.requests.at(-1)!;
const lastData = () => app.assistant.lastData() as { people?: { handle: string; name: string; timeZone: string; busy: { start: string; end: string }[] }[] };

/** The fake's answer: a draft with these events (local times in Lisbon, which is UTC in January). */
const draftAnswer = (events: { title?: string; start: string; end: string; invite: string[] }[], text = "Sport fits well then.") => ({
  kind: "draft",
  text,
  events: events.map((e) => ({ title: e.title ?? "Sport", start: e.start, end: e.end, goalId: null, todos: [], invite: e.invite })),
  changes: [],
  addTodos: [],
});

const draftsOf = (user: string) =>
  app.db.admin<{ id: string; status: string; version: number; proposed_events: Record<string, unknown>[] }>(
    "select d.id, d.status, d.version, d.proposed_events from app.draft_plans d where d.user_id = $1 order by d.created_at",
    [user],
  );
const eventsOf = (user: string) => app.db.admin<{ id: string; title: string }>("select id, title from app.events where user_id = $1 order by start_at", [user]);
const invitesOf = () => app.db.admin<{ invitee: string; answer: string }>("select invitee, answer from app.event_invites order by invitee");

/** Ana asks for sport with Emily and the fake proposes Tuesday 18:30 to 19:30 inviting p1; returns the draft. */
async function draftWithEmily(start = "2030-01-08T18:30", end = "2030-01-08T19:30") {
  app.assistant.answerJson(draftAnswer([{ start, end, invite: ["p1"] }]));
  const answer = await read(await send("I need a time for sport with Emily"));
  expect(answer.status).toBe(201);
  return (await draftsOf((await app.auth.session!).userId)).at(-1)!;
}

describe("who is sent (R65)", () => {
  it("nobody named: the request is exactly the one without any contacts (same prompt, schema and data)", async () => {
    const ana = await app.signedInAs("ana@example.com");
    await setPlan(app.db, ana, "pro");
    expect((await send("Plan my Tuesday")).status).toBe(201);
    const alone = lastRequest();
    await app.db.admin("delete from app.chat_messages where user_id = $1", [ana]);

    await people();
    expect((await send("Plan my Tuesday")).status).toBe(201);
    const withContacts = lastRequest();

    expect(withContacts.system).toBe(SYSTEM_PROMPT);
    expect(withContacts.schema).toBe(ANSWER_JSON_SCHEMA);
    expect(withContacts.data).toBe(alone.data);
    expect(requestBody("claude-opus-5-5", withContacts)).toEqual(requestBody("claude-opus-5-5", alone));
    expect(withContacts.data).not.toContain("people");
  });

  it("a named contact who shares free/busy: handle, name, time zone and merged busy times only", async () => {
    const { emily, anaEmily } = await people();
    expect((await send("I need a time for sport with emily")).status).toBe(201);
    expect(lastRequest().system).toBe(SYSTEM_PROMPT_WITH_PEOPLE);
    expect(lastRequest().schema).toBe(ANSWER_JSON_SCHEMA_WITH_PEOPLE);
    expect(lastData().people).toEqual([
      {
        handle: "p1",
        name: "Emily Stone",
        timeZone: "Europe/Berlin",
        busy: [
          { start: "2030-01-08T17:00", end: "2030-01-08T18:30" },
          { start: "2030-01-09T09:00", end: "2030-01-09T10:00" },
        ],
      },
    ]);
    const sent = JSON.stringify(app.assistant.requests);
    for (const hidden of [emily, anaEmily, "emily@example.com", "Physio", "Choir", "Lecture", "level", "photo"]) expect(sent).not.toContain(hidden);
  });

  it("a contact who shares details: still only the times, never the title, place, notes or the level", async () => {
    const { dora, anaDora } = await people();
    expect((await send("Lunch with Dora on Tuesday?")).status).toBe(201);
    expect(lastData().people).toEqual([{ handle: "p1", name: "Dora Dias", timeZone: "Europe/Lisbon", busy: [{ start: "2030-01-08T08:00", end: "2030-01-08T09:00" }] }]);
    const sent = JSON.stringify(app.assistant.requests);
    for (const hidden of ["Dentist", "Rua Secreta", "Bring the card", "details", dora, anaDora, "dora@example.com"]) expect(sent).not.toContain(hidden);
  });

  it("named in an earlier message (one of the 10 sent anyway) counts too, in the order named", async () => {
    await people();
    expect((await send("Something with Dora this week")).status).toBe(201);
    expect((await send("And Emily as well")).status).toBe(201);
    expect(lastData().people!.map((p) => [p.handle, p.name])).toEqual([
      ["p1", "Dora Dias"],
      ["p2", "Emily Stone"],
    ]);
  });

  it("rejected: a contact who shares only the focus chart, one who shares nothing, a name inside another word", async () => {
    await people();
    expect((await send("Sport with Lucas and Bruno, maybe Emilyann")).status).toBe(201);
    expect(lastRequest().system).toBe(SYSTEM_PROMPT);
    expect(lastData()).not.toHaveProperty("people");
    const sent = JSON.stringify(lastRequest().data);
    expect(sent).not.toContain("Lucas Lima");
  });

  it("rejected: after the share is withdrawn or the contact removed, nothing is sent", async () => {
    const { ana, emily, anaEmily, anaDora, share } = await people();
    await share(emily, anaEmily, "none");
    await app.db.withUser(ana, (q) => q("select app.remove_contact($1::uuid)", [anaDora]));
    expect((await send("Sport with Emily or Dora?")).status).toBe(201);
    expect(lastData()).not.toHaveProperty("people");
  });

  it("a demo contact who shares a calendar is sent only while demo contacts are on, never with its demo id", async () => {
    const { ana } = await people();
    expect((await send("A run with Lea?")).status).toBe(201);
    expect(lastData()).not.toHaveProperty("people");

    await app.db.withUser(ana, (q) => q("select app.set_demo_contacts(true)"));
    expect((await send("A run with Lea?")).status).toBe(201);
    const [lea] = lastData().people!;
    expect(lea).toMatchObject({ handle: "p1", name: "Lea Sousa", timeZone: "Europe/Lisbon" });
    expect(lea.busy.length).toBeGreaterThan(0);
    const sent = JSON.stringify(lastRequest().data);
    for (const hidden of ["demo-lea", "Morning run", "Riverside path", "Statistics student"]) expect(sent).not.toContain(hidden);
  });

  it("more than 5 named: the first 5 are sent and the answer says so", async () => {
    const ana = await app.signedInAs("ana@example.com");
    await setPlan(app.db, ana, "pro");
    const names = ["Anna Alves", "Bert Berg", "Carla Cruz", "Dieter Dahl", "Emma Ernst", "Frida Falk"];
    for (const [i, name] of names.entries()) {
      const other = await app.signedInAs(`p${i}@example.com`);
      await app.db.withUser(ana, (q) => q("select app.invite_contact($1)", [`p${i}@example.com`]));
      const received = (await app.db.withUser(other, readPeople)).received[0];
      await app.db.withUser(other, (q) => q("select app.answer_invitation($1::uuid, true)", [received.id]));
      await app.db.admin("update app.profiles set display_name = $2 where id = $1", [other, name]);
      const contact = (await app.db.withUser(other, readPeople)).contacts[0].id;
      await app.db.withUser(other, (q) => q("select app.set_share($1::uuid, 'busy', false)", [contact]));
    }
    await app.signedInAs("ana@example.com");
    app.assistant.answerJson({ kind: "text", text: "Let me look.", events: [], changes: [], addTodos: [] });
    const answer = await read(await send("Dinner with Frida, Emma, Dieter, Carla, Bert and Anna"));
    expect(lastData().people!.map((p) => p.name)).toEqual(["Frida Falk", "Emma Ernst", "Dieter Dahl", "Carla Cruz", "Bert Berg"]);
    const saved = (answer.body.messages as { text: string }[])[1].text;
    expect(saved).toBe("Let me look.\n\nI only looked at the calendars of the first 5 people you named: Frida Falk, Emma Ernst, Dieter Dahl, Carla Cruz and Bert Berg.");
  });
});

describe("checking the answer (R67)", () => {
  it("accepted: a free time; the draft keeps the contact row id, and the card shows the name", async () => {
    const { anaEmily } = await people();
    app.assistant.answerJson(draftAnswer([{ start: "2030-01-08T18:30", end: "2030-01-08T19:30", invite: ["p1"] }]));
    const answer = await read(await send("I need a time for sport with Emily"));
    expect(answer.status).toBe(201);
    const [draft] = await draftsOf((await app.auth.session!).userId);
    expect(draft.proposed_events).toEqual([
      { title: "Sport", start_at: "2030-01-08T18:30:00.000Z", end_at: "2030-01-08T19:30:00.000Z", goal_id: null, invite_contacts: [anaEmily] },
    ]);
    const shown = (answer.body.messages as { draft: { events: { people?: unknown }[] } | null }[])[1].draft!.events[0].people;
    expect(shown).toEqual([{ key: anaEmily, name: "Emily Stone", photoUrl: null }]);
  });

  it("rejected: a time that overlaps Emily's busy time is left out and the answer says so; no draft when nothing is left", async () => {
    const { ana } = await people();
    app.assistant.answerJson(draftAnswer([{ start: "2030-01-08T18:00", end: "2030-01-08T19:00", invite: ["p1"] }], "How about 6pm?"));
    const answer = await read(await send("Sport with Emily on Tuesday"));
    expect(answer.status).toBe(201);
    const assistant = (answer.body.messages as { text: string; draft: unknown }[])[1];
    expect(assistant.draft).toBeNull();
    expect(assistant.text).toBe("How about 6pm?\n\n\"Sport\" did not fit Emily Stone's calendar, so it was left out. No common time was found, so there is no draft.");
    expect(await draftsOf(ana)).toEqual([]);
  });

  it("rejected: an unknown handle leaves the event out; the rest of the draft stays", async () => {
    const { ana } = await people();
    app.assistant.answerJson(
      draftAnswer([
        { start: "2030-01-08T18:30", end: "2030-01-08T19:30", invite: ["p7"] },
        { title: "Study", start: "2030-01-08T10:00", end: "2030-01-08T11:00", invite: [] },
      ]),
    );
    expect((await send("Sport with Emily, and study")).status).toBe(201);
    const [draft] = await draftsOf(ana);
    expect(draft.proposed_events.map((p) => p.title)).toEqual(["Study"]);
  });
});

describe("accepting with invitations (R68)", () => {
  it("creates the event and invites Emily, who sees it not answered yet; undo removes both", async () => {
    const { emily } = await people();
    const draft = await draftWithEmily();
    const answer = await read(await accept(draft.id));
    expect(answer.status).toBe(201);
    expect(answer.body.message).toBe("Added to your calendar. The people you invited see it in their calendar.");
    expect(await invitesOf()).toEqual([{ invitee: emily, answer: "pending" }]);
    const seen = await app.db.withUser(emily, (q: Query) =>
      q<{ title: string; answer: string }>("select title, answer from app.invited_events($1::timestamptz, $2::timestamptz)", ["2030-01-07T00:00:00Z", "2030-01-14T00:00:00Z"]),
    );
    expect(seen).toEqual([{ title: "Sport", answer: "pending" }]);

    expect((await undo(draft.id)).status).toBe(200);
    expect(await invitesOf()).toEqual([]);
    expect(await app.db.withUser(emily, (q: Query) => q("select * from app.invited_events($1::timestamptz, $2::timestamptz)", ["2030-01-07T00:00:00Z", "2030-01-14T00:00:00Z"]))).toEqual([]);
  });

  it("atomic: when the database refuses an invitation, no event is created and the draft stays open", async () => {
    const { ana } = await people();
    const draft = await draftWithEmily();
    // A driver that hands set_event_invites a contact row nobody has: the database itself refuses.
    const refusing: Deps = {
      ...app.deps,
      withUser: (userId, fn) =>
        app.db.withUser(userId, (query) =>
          fn(((sql: string, params?: readonly unknown[]) =>
            sql.includes("set_event_invites") ? query(sql, [params![0], ["00000000-0000-4000-8000-000000000000"]]) : query(sql, params)) as Query),
        ),
    };
    const before = await app.snapshot();
    const answer = await read(await accept(draft.id, refusing));
    expect(answer).toEqual({ status: 409, body: { error: "invite_failed", message: "Someone you invited is no longer one of your contacts" } });
    expect(await app.snapshot()).toEqual(before);
    expect(await eventsOf(ana)).toEqual([]);
    expect((await draftsOf(ana))[0].status).toBe("open");
  });

  it("rejected: Emily withdrew her share since; nothing is applied", async () => {
    const { emily, anaEmily, share } = await people();
    const draft = await draftWithEmily();
    await share(emily, anaEmily, "none");
    const before = await app.snapshot();
    expect(await read(await accept(draft.id))).toEqual({ status: 409, body: { error: "invitee_not_sharing", message: "Emily Stone no longer shares their calendar with you" } });
    expect(await app.snapshot()).toEqual(before);
  });

  it("rejected: Emily is no longer a contact; nothing is applied", async () => {
    const { ana, anaEmily } = await people();
    const draft = await draftWithEmily();
    await app.db.withUser(ana, (q) => q("select app.remove_contact($1::uuid)", [anaEmily]));
    const before = await app.snapshot();
    expect(await read(await accept(draft.id))).toEqual({ status: 409, body: { error: "invitee_not_sharing", message: "Someone you invited is no longer one of your contacts" } });
    expect(await app.snapshot()).toEqual(before);
  });

  it("a dragged block keeps its people and is checked again at accept: busy now, refused; a fitting drag is accepted", async () => {
    const { ana, emily, anaEmily } = await people();
    const draft = await draftWithEmily("2030-01-08T19:00", "2030-01-08T20:00");
    const drag = (version: number, start: string, end: string) =>
      editDraft(postJson(`/api/chat/drafts/${draft.id}/edit`, { version, item: { kind: "new", index: 0 }, start, end }), app.deps, draft.id);
    expect((await drag(0, "2030-01-08T18:00", "2030-01-08T19:00")).status).toBe(200);
    expect((await draftsOf(ana))[0].proposed_events[0]).toMatchObject({ start_at: "2030-01-08T18:00:00.000Z", invite_contacts: [anaEmily] });

    const before = await app.snapshot();
    expect(await read(await accept(draft.id))).toEqual({ status: 409, body: { error: "invitee_busy", message: "The time no longer fits Emily Stone" } });
    expect(await app.snapshot()).toEqual(before);

    expect((await drag(1, "2030-01-08T18:30", "2030-01-08T19:30")).status).toBe(200);
    expect((await accept(draft.id)).status).toBe(201);
    expect(await invitesOf()).toEqual([{ invitee: emily, answer: "pending" }]);
  });

  it("a demo contact is taken into account for the time but never invited", async () => {
    const { ana } = await people();
    await app.db.withUser(ana, (q) => q("select app.set_demo_contacts(true)"));
    app.assistant.answerJson(draftAnswer([{ title: "Run", start: "2030-01-08T19:00", end: "2030-01-08T20:00", invite: ["p1"] }]));
    const answer = await read(await send("A run with Lea on Tuesday evening"));
    const shown = (answer.body.messages as { draft: { events: { people?: unknown }[] } }[])[1].draft.events[0].people;
    expect(shown).toEqual([{ key: "demo-lea", name: "Lea Sousa", photoUrl: null, demo: { initials: "LS", color: "#0f766e" } }]);
    const [draft] = await draftsOf(ana);
    expect(draft.proposed_events[0]).toMatchObject({ demo_people: ["demo-lea"] });
    expect(draft.proposed_events[0]).not.toHaveProperty("invite_contacts");
    const accepted = await read(await accept(draft.id));
    expect(accepted.status).toBe(201);
    expect(accepted.body.message).toBe("Added to your calendar.");
    expect((await eventsOf(ana)).map((e) => e.title)).toEqual(["Run"]);
    expect(await invitesOf()).toEqual([]);
  });
});

describe("taking someone off before accepting (R67)", () => {
  it("accepted: the person is taken off, the version moves on, everything else stays; accepting then invites nobody", async () => {
    const { ana, anaEmily } = await people();
    const draft = await draftWithEmily();
    const answer = await read(await takeOff(draft.id, { version: 0, index: 0, person: anaEmily }));
    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({ message: "Taken off this event.", draft: { version: 1, events: [{ title: "Sport", startAt: "2030-01-08T18:30:00.000Z" }] } });
    const [saved] = await draftsOf(ana);
    expect(saved.version).toBe(1);
    expect(saved.proposed_events).toEqual([{ title: "Sport", start_at: "2030-01-08T18:30:00.000Z", end_at: "2030-01-08T19:30:00.000Z", goal_id: null }]);
    expect((await read(await accept(draft.id))).body.message).toBe("Added to your calendar.");
    expect(await invitesOf()).toEqual([]);
  });

  it("rejected: an old version, a person the event does not list, someone else's draft; nothing changes", async () => {
    const { anaEmily, anaDora } = await people();
    const draft = await draftWithEmily();
    const before = await app.snapshot();
    expect((await read(await takeOff(draft.id, { version: 3, index: 0, person: anaEmily }))).body).toMatchObject({ error: "changed_elsewhere" });
    expect((await read(await takeOff(draft.id, { version: 0, index: 0, person: anaDora }))).status).toBe(404);
    expect((await read(await takeOff(draft.id, { version: 0, index: 5, person: anaEmily }))).status).toBe(404);
    expect((await read(await takeOff(draft.id, { version: 0, index: 0, person: "someone" }))).status).toBe(404);
    await app.signedInAs("emily@example.com");
    expect((await read(await takeOff(draft.id, { version: 0, index: 0, person: anaEmily }))).status).toBe(404);
    // The session changed with the sign-in above; the data did not.
    expect((await app.snapshot()).tables).toEqual(before.tables);
  });
});
