// Tests for the real Outlook module against recorded answer shapes of Microsoft's sign-in and Graph.
// A stand-in fetch returns those shapes; nothing goes to Microsoft.
import { describe, expect, it } from "vitest";
import { allDayDate, authorizeUrl, batchBody, createGraphOutlook, mapGraphEvent, parseBatchAnswer, safeNextLink } from "./graph";
import { grantsCalendarWrite, OutlookRefusedError, OutlookUnavailableError, type SendOp } from "./types";

const CONFIG = { clientId: "app-1", clientSecret: "secret-1", tenant: "common", redirectUri: "http://localhost:3000/api/outlook/callback" };

type Seen = { url: string; init: RequestInit };

/** A fetch that answers from a list and records what it was asked. */
function stubFetch(answers: (Response | Error)[]) {
  const seen: Seen[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    seen.push({ url: String(url), init });
    const next = answers.shift();
    if (!next) throw new Error("no recorded answer left");
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return { fetchFn, seen };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Recorded shapes (values made up).
const TOKEN_OK = {
  token_type: "Bearer",
  scope: "https://graph.microsoft.com/Calendars.ReadWrite",
  expires_in: 3599,
  ext_expires_in: 3599,
  access_token: "eyJ0eXAi.access",
  refresh_token: "M.C5.refresh",
};
const TOKEN_INVALID_GRANT = {
  error: "invalid_grant",
  error_description: "AADSTS70000: The provided value for the 'code' parameter is not valid.",
  error_codes: [70000],
};
const GRAPH_LECTURE = {
  "@odata.etag": 'W/"abc"',
  id: "AAMkAGI2THVSAAA=",
  subject: "Statistics lecture",
  isAllDay: false,
  isCancelled: false,
  showAs: "busy",
  transactionId: null,
  start: { dateTime: "2026-11-17T09:00:00.0000000", timeZone: "UTC" },
  end: { dateTime: "2026-11-17T10:30:00.0000000", timeZone: "UTC" },
  location: { displayName: "Nova SBE, Carcavelos", locationType: "default" },
};
const GRAPH_ALL_DAY_BERLIN = {
  id: "AAMkAGI2ALLDAY=",
  subject: "Exam week",
  isAllDay: true,
  showAs: "busy",
  start: { dateTime: "2026-11-15T23:00:00.0000000", timeZone: "UTC" },
  end: { dateTime: "2026-11-20T23:00:00.0000000", timeZone: "UTC" },
  location: { displayName: "" },
};

describe("sign-in", () => {
  it("builds the authorize address with PKCE S256, our fixed redirect and the two scopes", () => {
    const url = new URL(authorizeUrl(CONFIG, { state: "st", challenge: "ch" }));
    expect(url.origin + url.pathname).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "app-1",
      response_type: "code",
      redirect_uri: "http://localhost:3000/api/outlook/callback",
      response_mode: "query",
      scope: "offline_access https://graph.microsoft.com/Calendars.ReadWrite",
      state: "st",
      code_challenge: "ch",
      code_challenge_method: "S256",
      prompt: "select_account",
    });
  });

  it("exchanges the code with the verifier and reads the granted scope", async () => {
    const { fetchFn, seen } = stubFetch([json(200, TOKEN_OK)]);
    const answer = await createGraphOutlook(CONFIG, fetchFn).exchangeCode({ code: "c-1", verifier: "v-1" });
    expect(answer).toEqual({ kind: "ok", accessToken: "eyJ0eXAi.access", refreshToken: "M.C5.refresh", scope: TOKEN_OK.scope });
    const sent = new URLSearchParams(String(seen[0].init.body));
    expect(seen[0].url).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/token");
    expect(Object.fromEntries(sent)).toMatchObject({ grant_type: "authorization_code", code: "c-1", code_verifier: "v-1", redirect_uri: CONFIG.redirectUri });
  });

  it("treats a refused code as refused, and a refresh with invalid_grant as 'sign in again'", async () => {
    const { fetchFn } = stubFetch([json(400, TOKEN_INVALID_GRANT), json(400, TOKEN_INVALID_GRANT), json(401, { error: "invalid_client" })]);
    const outlook = createGraphOutlook(CONFIG, fetchFn);
    expect(await outlook.exchangeCode({ code: "c", verifier: "v" })).toEqual({ kind: "refused" });
    expect(await outlook.refresh("r")).toEqual({ kind: "refused" });
    // Our own client secret is wrong: not the user's fault, so the connection is kept.
    expect(await outlook.refresh("r")).toEqual({ kind: "unavailable" });
  });

  it("treats a network error, a timeout, 429 and 5xx as unavailable", async () => {
    const { fetchFn } = stubFetch([new TypeError("fetch failed"), new DOMException("timeout", "TimeoutError"), json(429, {}), json(503, {})]);
    const outlook = createGraphOutlook(CONFIG, fetchFn);
    for (let i = 0; i < 4; i++) expect(await outlook.refresh("r")).toEqual({ kind: "unavailable" });
  });

  it("knows whether writing the calendar was granted", () => {
    expect(grantsCalendarWrite("https://graph.microsoft.com/Calendars.ReadWrite")).toBe(true);
    expect(grantsCalendarWrite("openid Calendars.ReadWrite offline_access")).toBe(true);
    expect(grantsCalendarWrite("https://graph.microsoft.com/Calendars.Read")).toBe(false);
    expect(grantsCalendarWrite("")).toBe(false);
  });
});

describe("reading events", () => {
  it("maps a timed event with its location, and an all-day event to its days", () => {
    expect(mapGraphEvent(GRAPH_LECTURE)).toEqual({
      outlookId: "AAMkAGI2THVSAAA=",
      title: "Statistics lecture",
      allDay: false,
      startAt: "2026-11-17T09:00:00.000Z",
      endAt: "2026-11-17T10:30:00.000Z",
      firstDay: null,
      lastDay: null,
      location: "Nova SBE, Carcavelos",
      transactionId: null,
    });
    expect(mapGraphEvent(GRAPH_ALL_DAY_BERLIN)).toMatchObject({ allDay: true, firstDay: "2026-11-16", lastDay: "2026-11-20", location: null, startAt: null });
  });

  it("finds the day of an all-day boundary for zones from UTC-12 to UTC+12", () => {
    expect(allDayDate("2026-11-16T00:00:00.000Z")).toBe("2026-11-16");
    expect(allDayDate("2026-11-15T12:00:00.000Z")).toBe("2026-11-16"); // UTC+12
    expect(allDayDate("2026-11-16T11:00:00.000Z")).toBe("2026-11-16"); // UTC-11
  });

  it("leaves out cancelled, free, non-UTC, broken and too long events, and cuts titles to 100 characters", () => {
    expect(mapGraphEvent({ ...GRAPH_LECTURE, isCancelled: true })).toBeNull();
    expect(mapGraphEvent({ ...GRAPH_LECTURE, showAs: "free" })).toBeNull();
    expect(mapGraphEvent({ ...GRAPH_LECTURE, start: { dateTime: "2026-11-17T09:00:00", timeZone: "W. Europe Standard Time" } })).toBeNull();
    expect(mapGraphEvent({ ...GRAPH_LECTURE, id: "../me" })).toBeNull();
    expect(mapGraphEvent({ ...GRAPH_LECTURE, end: { dateTime: "2026-11-18T09:00:01", timeZone: "UTC" } })).toBeNull();
    expect(mapGraphEvent({ ...GRAPH_ALL_DAY_BERLIN, end: { dateTime: "2026-12-17T23:00:00", timeZone: "UTC" } })).toBeNull();
    expect(mapGraphEvent({ ...GRAPH_LECTURE, subject: "  " })?.title).toBe("Event");
    expect(mapGraphEvent({ ...GRAPH_LECTURE, subject: "x".repeat(150) })?.title).toHaveLength(100);
  });

  it("reads all pages in UTC and sends the token only to Graph's calendar view", async () => {
    const next = "https://graph.microsoft.com/v1.0/me/calendarView?$skiptoken=abc";
    const { fetchFn, seen } = stubFetch([
      json(200, { value: [GRAPH_LECTURE], "@odata.nextLink": next }),
      json(200, { value: [GRAPH_ALL_DAY_BERLIN, { ...GRAPH_LECTURE, id: "AAMk-free", showAs: "free" }] }),
    ]);
    const events = await createGraphOutlook(CONFIG, fetchFn).listEvents("tok", new Date("2026-11-09T09:00:00Z"), new Date("2027-01-15T09:00:00Z"));
    expect(events.map((e) => e.outlookId)).toEqual(["AAMkAGI2THVSAAA=", "AAMkAGI2ALLDAY="]);
    expect(seen[0].url).toContain("startDateTime=2026-11-09T09%3A00%3A00.000Z");
    expect(seen[0].init.headers).toMatchObject({ Authorization: "Bearer tok", Prefer: 'outlook.timezone="UTC"' });
    expect(seen[1].url).toBe(next);
    expect(() => safeNextLink("https://evil.example/v1.0/me/calendarView")).toThrow(OutlookUnavailableError);
  });

  it("gives up (nothing imported) when pages are left after the last one it reads, and accepts a calendar that ends exactly there", async () => {
    const next = "https://graph.microsoft.com/v1.0/me/calendarView?$skiptoken=abc";
    const more = Array.from({ length: 10 }, () => json(200, { value: [GRAPH_LECTURE], "@odata.nextLink": next }));
    await expect(createGraphOutlook(CONFIG, stubFetch(more).fetchFn).listEvents("t", new Date(), new Date())).rejects.toThrow(
      OutlookUnavailableError,
    );
    const exact = [...Array.from({ length: 9 }, () => json(200, { value: [GRAPH_LECTURE], "@odata.nextLink": next })), json(200, { value: [GRAPH_LECTURE] })];
    expect(await createGraphOutlook(CONFIG, stubFetch(exact).fetchFn).listEvents("t", new Date(), new Date())).toHaveLength(10);
  });

  it("turns a refused token into 'sign in again' and throttling into 'not now'", async () => {
    const refused = stubFetch([json(401, { error: { code: "InvalidAuthenticationToken", message: "expired" } })]);
    await expect(createGraphOutlook(CONFIG, refused.fetchFn).listEvents("t", new Date(), new Date())).rejects.toThrow(OutlookRefusedError);
    const throttled = stubFetch([json(429, { error: { code: "ApplicationThrottled" } })]);
    await expect(createGraphOutlook(CONFIG, throttled.fetchFn).listEvents("t", new Date(), new Date())).rejects.toThrow(OutlookUnavailableError);
    const noMailbox = stubFetch([json(401, { error: { code: "OrganizationFromTenantGuidNotFound" } })]);
    await expect(createGraphOutlook(CONFIG, noMailbox.fetchFn).listEvents("t", new Date(), new Date())).rejects.toThrow(OutlookUnavailableError);
  });
});

describe("sending events", () => {
  const event = { title: "Revision", allDay: false, startAt: "2026-11-18T09:00:00.000Z", endAt: "2026-11-18T10:00:00.000Z", firstDay: null, lastDay: null, transactionId: "e1" };
  const ops: SendOp[] = [
    { kind: "create", ref: "e1", event },
    { kind: "update", ref: "e2", outlookId: "AAMk-2", event: { ...event, transactionId: "e2", allDay: true, startAt: null, endAt: null, firstDay: "2026-11-20", lastDay: "2026-11-22" } },
    { kind: "delete", ref: "d1", outlookId: "AAMk-3" },
  ];

  it("builds one $batch with create (transactionId, busy), update and delete", () => {
    expect(batchBody(ops).requests).toEqual([
      {
        id: "0",
        method: "POST",
        url: "/me/events",
        headers: { "Content-Type": "application/json" },
        body: {
          subject: "Revision",
          isAllDay: false,
          start: { dateTime: "2026-11-18T09:00:00", timeZone: "UTC" },
          end: { dateTime: "2026-11-18T10:00:00", timeZone: "UTC" },
          transactionId: "e1",
          showAs: "busy",
          isReminderOn: false,
        },
      },
      {
        id: "1",
        method: "PATCH",
        url: "/me/events/AAMk-2",
        headers: { "Content-Type": "application/json" },
        body: { subject: "Revision", isAllDay: true, start: { dateTime: "2026-11-20T00:00:00", timeZone: "UTC" }, end: { dateTime: "2026-11-23T00:00:00", timeZone: "UTC" } },
      },
      { id: "2", method: "DELETE", url: "/me/events/AAMk-3" },
    ]);
  });

  it("reads each answer: created with its id, gone on 404, later on 429 and 5xx", () => {
    const answer = {
      responses: [
        { id: "2", status: 404, body: { error: { code: "ErrorItemNotFound" } } },
        { id: "0", status: 201, body: { id: "AAMk-new" } },
        { id: "1", status: 429, headers: { "Retry-After": "10" }, body: {} },
      ],
    };
    expect(parseBatchAnswer(ops, answer)).toEqual([
      { ref: "e1", kind: "done", outlookId: "AAMk-new" },
      { ref: "e2", kind: "later" },
      { ref: "d1", kind: "gone" },
    ]);
  });

  it("sends at most 20 per batch, and waits with the rest when Outlook is down", async () => {
    const many: SendOp[] = Array.from({ length: 45 }, (_, i) => ({ kind: "delete", ref: `d${i}`, outlookId: `AAMk-${i}` }));
    const okFor = (n: number, from: number) => json(200, { responses: Array.from({ length: n }, (_, i) => ({ id: String(i), status: 204 })) , from });
    const { fetchFn, seen } = stubFetch([okFor(20, 0), new DOMException("timeout", "TimeoutError")]);
    const results = await createGraphOutlook(CONFIG, fetchFn).send("tok", many);
    expect(seen).toHaveLength(2);
    expect(JSON.parse(String(seen[0].init.body)).requests).toHaveLength(20);
    expect(results.filter((r) => r.kind === "done")).toHaveLength(20);
    expect(results.filter((r) => r.kind === "later")).toHaveLength(25);
  });

  it("never puts an id of the wrong shape into a path", async () => {
    const { fetchFn, seen } = stubFetch([]);
    expect(await createGraphOutlook(CONFIG, fetchFn).send("tok", [{ kind: "delete", ref: "d", outlookId: "../../me/messages" }])).toEqual([{ ref: "d", kind: "gone" }]);
    expect(seen).toHaveLength(0);
  });
});
