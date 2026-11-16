// Tests for add_place, edit_place and remove_place: the user's saved places ("Uni", "Gym").
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, postJson, read, type TestApp } from "@test/support/app";
import { addPlace, editPlace, removePlace } from "./saved-places";

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

const add = (body: unknown, headers?: Record<string, string>) => addPlace(postJson("/api/saved-places", body, headers), app.deps);
const edit = (id: string, body: unknown) => editPlace(postJson(`/api/saved-places/${id}`, body), app.deps, id);
const remove = (id: string) => removePlace(postJson(`/api/saved-places/${id}/remove`, {}), app.deps, id);
const placesOf = (userId: string) => app.db.admin("select name, address from app.places where user_id = $1 order by created_at", [userId]);

describe("saved places", () => {
  it("adds a place with its name and address trimmed, changes it and removes it", async () => {
    const alice = await app.signedInAs("alice@example.com");
    const added = await read(await add({ name: "  Uni ", address: " Campus 1, Lisboa " }));
    expect(added.status).toBe(201);
    const place = added.body.place as { id: string; name: string; address: string };
    expect(place).toMatchObject({ name: "Uni", address: "Campus 1, Lisboa" });

    expect((await edit(place.id, { name: "University", address: "Campus 2" })).status).toBe(200);
    expect(await placesOf(alice)).toEqual([{ name: "University", address: "Campus 2" }]);

    expect((await remove(place.id)).status).toBe(200);
    expect(await placesOf(alice)).toEqual([]);
    expect((await remove(place.id)).status).toBe(404);
  });

  it("refuses an empty name or address, a name twice and an 11th place", async () => {
    await app.signedInAs("alice@example.com");
    expect((await read(await add({ name: " ", address: "Campus" }))).body.error).toBe("invalid_name");
    expect((await read(await add({ name: "x".repeat(41), address: "Campus" }))).body.error).toBe("invalid_name");
    expect((await read(await add({ name: "Gym", address: "  " }))).body.error).toBe("invalid_address");
    await add({ name: "Gym", address: "Rua 1" });
    expect((await read(await add({ name: "Gym", address: "Rua 2" }))).status).toBe(409);
    for (let i = 1; i < 10; i++) expect((await add({ name: `Place ${i}`, address: "Rua" })).status).toBe(201);
    expect((await read(await add({ name: "Eleven", address: "Rua" }))).body.error).toBe("too_many_places");
  });

  it("refuses renaming to a name that is taken, but keeps the own name", async () => {
    await app.signedInAs("alice@example.com");
    const gym = (await read(await add({ name: "Gym", address: "Rua 1" }))).body.place as { id: string };
    await add({ name: "Uni", address: "Campus" });
    expect((await edit(gym.id, { name: "Uni", address: "Rua 1" })).status).toBe(409);
    expect((await edit(gym.id, { name: "Gym", address: "Rua 9" })).status).toBe(200);
  });

  it("never reaches another user's place (R3)", async () => {
    await app.signedInAs("alice@example.com");
    const place = (await read(await add({ name: "Gym", address: "Rua 1" }))).body.place as { id: string };
    const bob = await app.signedInAs("bob@example.com");
    expect((await edit(place.id, { name: "Mine", address: "Rua" })).status).toBe(404);
    expect((await remove(place.id)).status).toBe(404);
    expect((await remove("nope")).status).toBe(404);
    expect(await placesOf(bob)).toEqual([]);
  });

  it("rejects no session (401), another site (403) and a wrong body (400)", async () => {
    expect((await add({ name: "Gym", address: "Rua" })).status).toBe(401);
    await app.signedInAs("alice@example.com");
    const before = await app.snapshot();
    expect((await add({ name: "Gym", address: "Rua" }, { origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await add({ name: 42 })).status).toBe(400);
    expect(await app.snapshot()).toEqual(before);
  });
});
