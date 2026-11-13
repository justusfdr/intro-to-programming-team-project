// Tests for update_settings (ontology section 5; spec 12). Every rule has an accepted and a rejected
// case; a rejected request changes nothing (R1).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { updateSettings } from "./update-settings";

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
  return updateSettings(postJson("/api/settings", body, headers), app.deps);
}

async function settingsOf(userId: string) {
  const [row] = await app.db.admin(
    `select time_zone, home_address, travel_mode, travel_buffer_minutes, time_format, day_start_hour, day_end_hour
       from app.settings where user_id = $1`,
    [userId],
  );
  return row;
}

const DEFAULTS = {
  time_zone: "Europe/Berlin",
  home_address: null,
  travel_mode: "driving",
  travel_buffer_minutes: 10,
  time_format: "12h",
  day_start_hour: 7,
  day_end_hour: 21,
};

describe("update_settings accepted", () => {
  it("starts a new account with 12-hour times and 7 am to 9 pm", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Berlin" });
    expect(await settingsOf(alice)).toEqual(DEFAULTS);
  });

  it("saves only the fields sent and answers with the whole row", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Berlin" });
    const answer = await read(await send({ timeFormat: "24h", dayStartHour: 6, dayEndHour: 24 }));
    expect(answer).toEqual({
      status: 200,
      body: {
        message: "Settings saved.",
        settings: {
          timeZone: "Europe/Berlin",
          homeAddress: "",
          travelMode: "driving",
          travelBufferMinutes: 10,
          timeFormat: "24h",
          dayStartHour: 6,
          dayEndHour: 24,
        },
      },
    });
    expect(await settingsOf(alice)).toEqual({ ...DEFAULTS, time_format: "24h", day_start_hour: 6, day_end_hour: 24 });
  });

  it("saves a known time zone under its proper name", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Berlin" });
    expect((await send({ timeZone: "america/new_york" })).status).toBe(200);
    expect((await settingsOf(alice)).time_zone).toBe("America/New_York");
  });

  it("saves the travel details: address (trimmed, up to 200 characters), mode, buffer 0 and 120", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Berlin" });
    const address = "a".repeat(200);
    expect((await send({ homeAddress: `  ${address}  `, travelMode: "cycling", travelBufferMinutes: 0 })).status).toBe(200);
    expect(await settingsOf(alice)).toMatchObject({ home_address: address, travel_mode: "cycling", travel_buffer_minutes: 0 });
    expect((await send({ travelBufferMinutes: 120 })).status).toBe(200);
    expect((await settingsOf(alice)).travel_buffer_minutes).toBe(120);
  });

  it("accepts public transport as the travel mode", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Berlin" });
    expect((await send({ travelMode: "transit" })).status).toBe(200);
    expect((await settingsOf(alice)).travel_mode).toBe("transit");
  });

  it("stores an empty address as no address", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Berlin" });
    await send({ homeAddress: "Rua Augusta 100, Lisbon" });
    expect((await send({ homeAddress: "   " })).status).toBe(200);
    expect((await settingsOf(alice)).home_address).toBeNull();
  });

  it("checks the visible hours against the saved ones when only one end is sent", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Berlin" });
    expect((await send({ dayStartHour: 20 })).status).toBe(200); // 20 to 21
    expect((await settingsOf(alice)).day_start_hour).toBe(20);
  });

  it("saves the calendar's default view (spec 14); the answer keeps its shape", async () => {
    const alice = await app.signedInAs("alice@example.com", { timeZone: "Europe/Berlin" });
    const defaultView = async () => (await app.db.admin("select default_view from app.settings where user_id = $1", [alice]))[0].default_view;
    expect(await defaultView()).toBe("week");
    for (const view of ["month", "day", "week"]) {
      const answer = await read(await send({ defaultView: view }));
      expect(answer.status).toBe(200);
      expect(await defaultView()).toBe(view);
    }
    // Another change leaves the default view as it is.
    await send({ defaultView: "month" });
    expect((await send({ timeFormat: "24h" })).status).toBe(200);
    expect(await defaultView()).toBe("month");
    expect(await settingsOf(alice)).toEqual({ ...DEFAULTS, time_format: "24h" });
  });

  it("changes only the signed-in user's row", async () => {
    const bob = await app.signedInAs("bob@example.com", { timeZone: "Europe/Berlin" });
    await app.signedInAs("alice@example.com", { timeZone: "Europe/Berlin" });
    await send({ timeFormat: "24h", travelBufferMinutes: 30 });
    expect(await settingsOf(bob)).toEqual(DEFAULTS);
  });
});

describe("update_settings rejected: nothing changes (R1)", () => {
  async function rejected(body: unknown, expected: { status: number; body: Record<string, unknown> }) {
    await app.signedInAs("alice@example.com", { timeZone: "Europe/Berlin" });
    const before = await app.snapshot();
    expect(await read(await send(body))).toEqual(expected);
    expect(await app.snapshot()).toEqual(before);
  }

  it("rejects a buffer of 121, -1 or 7.5 with 'Buffer must be 0 to 120 minutes'", async () => {
    const answer = { status: 400, body: { error: "buffer_range", message: "Buffer must be 0 to 120 minutes" } };
    await rejected({ travelBufferMinutes: 121 }, answer);
    await rejected({ travelBufferMinutes: -1 }, answer);
    await rejected({ travelBufferMinutes: 7.5 }, answer);
  });

  it("rejects an unknown time zone", async () => {
    await rejected({ timeZone: "Mars/Olympus_Mons" }, { status: 400, body: { error: "unknown_time_zone", message: "Choose a time zone from the list" } });
  });

  it("rejects an address over 200 characters", async () => {
    await rejected(
      { homeAddress: "a".repeat(201) },
      { status: 400, body: { error: "address_too_long", message: "Home address can be at most 200 characters" } },
    );
  });

  it("rejects visible hours that end before they start, are outside 0 to 24 or not whole", async () => {
    const answer = {
      status: 400,
      body: { error: "visible_hours", message: "Visible hours must be whole hours, from 0 to 24, ending after they start" },
    };
    await rejected({ dayStartHour: 9, dayEndHour: 9 }, answer);
    await rejected({ dayStartHour: 22 }, answer); // saved end is 21
    await rejected({ dayStartHour: 24, dayEndHour: 24 }, answer);
    await rejected({ dayEndHour: 25 }, answer);
    await rejected({ dayStartHour: -1 }, answer);
    await rejected({ dayStartHour: 7.5 }, answer);
  });

  it("rejects an unknown time format or travel mode, an empty body and unknown fields as an invalid request", async () => {
    const answer = { status: 400, body: { error: "bad_request", message: "Invalid request." } };
    await rejected({ timeFormat: "36h" }, answer);
    await rejected({ travelMode: "flying" }, answer);
    await rejected({ defaultView: "year" }, answer);
    await rejected({ defaultView: "Week" }, answer);
    await rejected({}, answer);
    await rejected({ plan: "pro" }, answer);
  });

  it("rejects a signed-out request (401)", async () => {
    const before = await app.snapshot();
    expect(await read(await send({ timeFormat: "24h" }))).toEqual({
      status: 401,
      body: { error: "unauthorized", message: "Please sign in." },
    });
    expect(await app.snapshot()).toEqual(before);
  });

  it("rejects a request from another site (403)", async () => {
    await app.signedInAs("alice@example.com", { timeZone: "Europe/Berlin" });
    const before = await app.snapshot();
    const response = await send({ timeFormat: "24h" }, { origin: "https://evil.example", "sec-fetch-site": "cross-site" });
    expect(response.status).toBe(403);
    expect(await app.snapshot()).toEqual(before);
  });

  it("rejects a body over the size cap (413)", async () => {
    await app.signedInAs("alice@example.com", { timeZone: "Europe/Berlin" });
    const before = await app.snapshot();
    const response = await send(JSON.stringify({ homeAddress: "a".repeat(20_000) }));
    expect(response.status).toBe(413);
    expect(await app.snapshot()).toEqual(before);
  });
});
