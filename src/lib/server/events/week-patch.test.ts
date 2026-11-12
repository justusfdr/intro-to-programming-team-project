// The screen shows an action's answer at once with withEventChange (src/lib/events/week-view.ts).
// Here: the week it calculates equals the week the server reads after the same change, so the
// background re-read changes nothing on screen.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { EventDto } from "@/lib/events/types";
import { withEventChange } from "@/lib/events/week-view";
import { createTestApp, type TestApp } from "@test/support/app";
import { seedAllDay, seedEvent } from "@test/support/events";
import { EVENT_COLUMNS, toEventDto, type EventRow } from "./rows";
import { loadWeek } from "./week";

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.reset(); // Monday 16 November 2026, 09:00 UTC
});

async function dtoOf(id: string): Promise<EventDto> {
  const [row] = await app.db.admin<EventRow>(`select ${EVENT_COLUMNS} from app.events where id = $1`, [id]);
  return toEventDto(row);
}

describe("withEventChange shows what the next read will show", () => {
  it("a new timed event, with the conflict mark on both events (R10)", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Lisbon" });
    await seedEvent(app.db, alice, { title: "Deep work", start: "2026-11-17T10:00:00Z", end: "2026-11-17T11:00:00Z" });
    await seedAllDay(app.db, alice, { title: "Exam week", firstDay: "2026-11-16", lastDay: "2026-11-18" });
    const before = await loadWeek(app.deps, alice);
    const added = await seedEvent(app.db, alice, { title: "Call", start: "2026-11-17T10:30:00Z", end: "2026-11-17T11:30:00Z" });
    const after = await loadWeek(app.deps, alice);
    expect(withEventChange(before, { event: await dtoOf(added.id) })).toEqual(after);
    expect(after.days[1].events.map((e) => [e.title, e.conflict])).toEqual([["Deep work", true], ["Call", true]]);
  });

  it("an event moved to another day, marked done, and removed", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "America/New_York" });
    const run = await seedEvent(app.db, alice, { title: "Run", start: "2026-11-16T12:00:00Z", end: "2026-11-16T13:00:00Z" });
    await seedEvent(app.db, alice, { title: "Lunch", start: "2026-11-18T12:00:00Z", end: "2026-11-18T13:00:00Z" });
    let week = await loadWeek(app.deps, alice);

    await app.db.admin("update app.events set start_at = '2026-11-18T12:30:00Z', end_at = '2026-11-18T13:30:00Z', status = 'done' where id = $1", [run.id]);
    let server = await loadWeek(app.deps, alice);
    week = withEventChange(week, { event: await dtoOf(run.id) });
    expect(week).toEqual(server);
    expect(week.days[0].events).toEqual([]);

    await app.db.admin("delete from app.events where id = $1", [run.id]);
    server = await loadWeek(app.deps, alice);
    expect(withEventChange(week, { removed: run.id })).toEqual(server);
  });

  it("an all-day event, on each of its days (R2)", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedAllDay(app.db, alice, { title: "Conference", firstDay: "2026-11-18", lastDay: "2026-11-18" });
    const before = await loadWeek(app.deps, alice);
    const away = await seedAllDay(app.db, alice, { title: "Away", firstDay: "2026-11-17", lastDay: "2026-11-19" });
    const after = await loadWeek(app.deps, alice);
    expect(withEventChange(before, { event: await dtoOf(away.id) })).toEqual(after);
  });
});
