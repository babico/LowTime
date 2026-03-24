import test from "node:test";
import assert from "node:assert/strict";

import { buildApp } from "./app.js";

test("POST /api/rooms creates a room with defaults and host secret", async () => {
  const app = buildApp({
    now: () => new Date("2026-03-24T12:00:00.000Z"),
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/rooms",
  });

  assert.equal(response.statusCode, 200);

  const payload = response.json();

  assert.equal(typeof payload.roomSlug, "string");
  assert.equal(payload.roomSlug.length, 12);
  assert.equal(payload.joinUrl, `/r/${payload.roomSlug}`);
  assert.equal(typeof payload.hostSecret, "string");
  assert.equal(payload.expiresAt, "2026-03-24T14:00:00.000Z");
  assert.deepEqual(payload.room, {
    slug: payload.roomSlug,
    accessMode: "open",
    maxParticipants: 2,
    qualityCap: "balanced",
    allowScreenShare: true,
    status: "created",
    expiresAt: "2026-03-24T14:00:00.000Z",
  });

  await app.close();
});

test("POST /api/rooms validates the create request", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/rooms",
    payload: {
      accessMode: "invalid",
      maxParticipants: 8,
    },
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), {
    message: "accessMode must be one of open, lobby, or passcode",
  });

  await app.close();
});

test("GET /api/rooms/:slug returns public room metadata", async () => {
  const app = buildApp({
    now: () => new Date("2026-03-24T12:00:00.000Z"),
  });

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/rooms",
    payload: {
      accessMode: "lobby",
      maxParticipants: 4,
      qualityCap: "high",
      allowScreenShare: false,
    },
  });

  const { roomSlug } = createResponse.json();

  const response = await app.inject({
    method: "GET",
    url: `/api/rooms/${roomSlug}`,
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    slug: roomSlug,
    accessMode: "lobby",
    maxParticipants: 4,
    qualityCap: "high",
    allowScreenShare: false,
    status: "created",
    expiresAt: "2026-03-24T14:00:00.000Z",
  });

  await app.close();
});
