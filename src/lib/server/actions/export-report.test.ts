// Tests for export_report (spec 49, "Export"): the signed-in user's own numbers of a period as a PDF.
// A bad period or no part is refused; nobody gets a report without being signed in; a report never
// holds another user's data (R3) and saves nothing.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { createTestApp, read, type TestApp } from "@test/support/app";
import { seedSession } from "@test/support/sessions";
import { PARTS } from "@/lib/analytics/period";
import { readPeriodReport } from "@/lib/server/analytics/period";
import { exportReport } from "./export-report";

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

const ALL = PARTS.join(",");

function ask(query: string) {
  return exportReport(new Request(`http://localhost:3000/api/analytics/export?${query}`, { headers: { host: "localhost:3000" } }), app.deps);
}

/** A finished 60-minute session on the given day at 09:00 UTC, fully focused. */
function seedHour(userId: string, day: string) {
  return seedSession(app.db, userId, { status: "finished", plannedMinutes: 60, startedAt: `${day}T09:00:00Z`, endedAt: `${day}T10:00:00Z` });
}

async function pdfOf(response: Response) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { bytes, head: new TextDecoder().decode(bytes.slice(0, 5)), pages: (await PDFDocument.load(bytes)).getPageCount() };
}

describe("export_report accepted", () => {
  it("answers with a PDF file to download, named after the period, that no cache may keep", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedHour(alice, "2026-11-03");
    await seedHour(alice, "2026-11-10");

    const response = await ask(`from=2026-11-02&to=2026-11-09&parts=${ALL}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="LockedIn-report-2026-11-02-to-2026-11-15.pdf"');
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const pdf = await pdfOf(response);
    expect(pdf.head).toBe("%PDF-");
    expect(pdf.pages).toBeGreaterThanOrEqual(2);
    expect(Number(response.headers.get("content-length"))).toBe(pdf.bytes.byteLength);
  });

  it("has more pages for 26 weeks with every part than for one week with one part", async () => {
    const alice = await app.signedInAs("alice@example.com");
    for (const day of ["2026-06-02", "2026-08-11", "2026-10-06", "2026-11-10"]) await seedHour(alice, day);

    const long = await pdfOf(await ask(`from=2026-05-25&to=2026-11-16&parts=${ALL}`));
    const short = await pdfOf(await ask("from=2026-11-09&to=2026-11-09&parts=productivity"));

    expect(short.pages).toBe(1);
    expect(long.pages).toBeGreaterThan(short.pages);
  });

  it("gives one page that says so for a period without anything", async () => {
    await app.signedInAs("alice@example.com");
    const response = await ask(`from=2026-09-07&to=2026-09-28&parts=${ALL}`);
    expect(response.status).toBe(200);
    expect((await pdfOf(response)).pages).toBe(1);
  });

  it("saves nothing", async () => {
    const alice = await app.signedInAs("alice@example.com");
    await seedHour(alice, "2026-11-10");
    const before = await app.snapshot();
    expect((await ask(`from=2026-11-09&to=2026-11-09&parts=${ALL}`)).status).toBe(200);
    expect(await app.snapshot()).toEqual(before);
  });

  it("holds only the signed-in user's own numbers (R3)", async () => {
    const bob = await app.signedInAs("bob@example.com");
    await seedHour(bob, "2026-11-10");
    await app.db.admin("insert into app.blocked_attempts (user_id, domain, attempted_at) values ($1, 'reddit.com', '2026-11-10T09:30:00Z')", [bob]);
    const alice = await app.signedInAs("alice@example.com");

    const period = { from: "2026-11-09", to: "2026-11-09", weeks: 1 };
    const hers = await app.deps.withUser(alice, (query) => readPeriodReport(query, app.deps.now(), period, "Europe/Lisbon"));
    const his = await app.deps.withUser(bob, (query) => readPeriodReport(query, app.deps.now(), period, "Europe/Lisbon"));

    expect(hers.empty).toBe(true);
    expect(hers.totals).toMatchObject({ sessions: 0, attempts: 0, focusedMinutes: 0 });
    expect(hers.topSites).toEqual([]);
    expect(his.totals).toMatchObject({ sessions: 1, attempts: 1, focusedMinutes: 60 });
  });
});

describe("export_report refused", () => {
  async function expectRefused(query: string, message: string) {
    await app.signedInAs("alice@example.com");
    const answer = await read(await ask(query));
    expect(answer.status).toBe(400);
    expect(answer.body.message).toBe(message);
  }

  it("a period that is missing or not a date", async () => {
    await expectRefused(`parts=${ALL}`, "Choose a first and a last week");
    await expectRefused(`from=yesterday&to=2026-11-09&parts=${ALL}`, "Choose a first and a last week");
  });

  it("a first week after the last week", async () => {
    await expectRefused(`from=2026-11-09&to=2026-11-02&parts=${ALL}`, "The first week must not be after the last week");
  });

  it("a week that has not started", async () => {
    await expectRefused(`from=2026-11-16&to=2026-11-23&parts=${ALL}`, "A report cannot include weeks that have not started");
  });

  it("more than 26 weeks", async () => {
    await expectRefused(`from=2026-05-18&to=2026-11-16&parts=${ALL}`, "A report covers at most 26 weeks");
  });

  it("no part, or a part that does not exist", async () => {
    await expectRefused("from=2026-11-09&to=2026-11-09", "Choose at least one part");
    await expectRefused("from=2026-11-09&to=2026-11-09&parts=", "Choose at least one part");
    await expectRefused("from=2026-11-09&to=2026-11-09&parts=summary,travel", "Choose parts from the list");
  });

  it("signed out: 401, and no file", async () => {
    await app.signedInAs("alice@example.com");
    await app.auth.signOut();
    const response = await ask(`from=2026-11-09&to=2026-11-09&parts=${ALL}`);
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).not.toBe("application/pdf");
  });
});
