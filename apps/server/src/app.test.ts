import test from "node:test";
import assert from "node:assert/strict";

import { buildApp } from "./app.js";
import type { LiveKitConfig } from "./livekit.js";

const TEST_LIVEKIT_CONFIG: LiveKitConfig = {
  url: "ws://localhost:7880",
  apiKey: "devkey",
  apiSecret: "secret",
};

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

test("GET /api/rooms/:slug returns 404 for an unknown room", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/api/rooms/missing-room",
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), {
    message: "Room not found",
  });

  await app.close();
});

test("room endpoints answer CORS preflight requests", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "OPTIONS",
    url: "/api/rooms",
    headers: {
      origin: "http://localhost:5173",
      "access-control-request-method": "POST",
    },
  });

  assert.equal(response.statusCode, 204);
  assert.equal(response.headers["access-control-allow-origin"], "http://localhost:5173");
  assert.match(String(response.headers["access-control-allow-methods"]), /POST/);

  await app.close();
});

test("POST /api/rooms/:slug/join admits an open room with a display name", async () => {
  const app = buildApp();

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/rooms",
  });

  const { roomSlug } = createResponse.json();

  const response = await app.inject({
    method: "POST",
    url: `/api/rooms/${roomSlug}/join`,
    payload: {
      displayName: "Sam",
      qualityPreset: "balanced",
      requestedMedia: {
        audio: true,
        video: true,
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().joinState, "direct");
  assert.match(response.json().sessionId, /^sess_/);
  assert.equal(response.json().transportPreference, "sfu");

  await app.close();
});

test("POST /api/rooms/:slug/join validates the display name", async () => {
  const app = buildApp();

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/rooms",
  });

  const { roomSlug } = createResponse.json();

  const response = await app.inject({
    method: "POST",
    url: `/api/rooms/${roomSlug}/join`,
    payload: {
      displayName: "   ",
    },
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), {
    message: "displayName is required",
  });

  await app.close();
});

test("POST /api/rooms/:slug/join returns waiting for lobby rooms", async () => {
  const app = buildApp();

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/rooms",
    payload: {
      accessMode: "lobby",
    },
  });

  const { roomSlug } = createResponse.json();

  const response = await app.inject({
    method: "POST",
    url: `/api/rooms/${roomSlug}/join`,
    payload: {
      displayName: "Lobby Guest",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().joinState, "waiting");
  assert.match(response.json().requestId, /^req_/);

  await app.close();
});

test("lobby requests can be listed and approved by the host", async () => {
  const app = buildApp();

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/rooms",
    payload: {
      accessMode: "lobby",
    },
  });

  const { roomSlug, hostSecret } = createResponse.json();

  const joinResponse = await app.inject({
    method: "POST",
    url: `/api/rooms/${roomSlug}/join`,
    payload: {
      displayName: "Lobby Guest",
    },
  });

  const { requestId } = joinResponse.json();

  const listResponse = await app.inject({
    method: "GET",
    url: `/api/rooms/${roomSlug}/lobby`,
    headers: {
      "x-host-secret": hostSecret,
    },
  });

  assert.equal(listResponse.statusCode, 200);
  assert.deepEqual(listResponse.json().requests.map((entry: { requestId: string; displayName: string }) => ({
    requestId: entry.requestId,
    displayName: entry.displayName,
  })), [
    {
      requestId,
      displayName: "Lobby Guest",
    },
  ]);

  const approveResponse = await app.inject({
    method: "POST",
    url: `/api/rooms/${roomSlug}/lobby/${requestId}/approve`,
    headers: {
      "x-host-secret": hostSecret,
    },
  });

  assert.equal(approveResponse.statusCode, 200);
  assert.equal(approveResponse.json().status, "approved");
  assert.match(approveResponse.json().sessionId, /^sess_/);
  assert.equal(approveResponse.json().transportPreference, "sfu");

  const statusResponse = await app.inject({
    method: "GET",
    url: `/api/rooms/${roomSlug}/lobby/${requestId}`,
  });

  assert.equal(statusResponse.statusCode, 200);
  assert.equal(statusResponse.json().status, "approved");
  assert.equal(statusResponse.json().sessionId, approveResponse.json().sessionId);

  await app.close();
});

test("lobby requests can be denied by the host", async () => {
  const app = buildApp();

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/rooms",
    payload: {
      accessMode: "lobby",
    },
  });

  const { roomSlug, hostSecret } = createResponse.json();

  const joinResponse = await app.inject({
    method: "POST",
    url: `/api/rooms/${roomSlug}/join`,
    payload: {
      displayName: "Denied Guest",
    },
  });

  const { requestId } = joinResponse.json();

  const denyResponse = await app.inject({
    method: "POST",
    url: `/api/rooms/${roomSlug}/lobby/${requestId}/deny`,
    headers: {
      "x-host-secret": hostSecret,
    },
  });

  assert.equal(denyResponse.statusCode, 200);
  assert.deepEqual(denyResponse.json(), {
    status: "denied",
    reason: "host_denied",
  });

  const statusResponse = await app.inject({
    method: "GET",
    url: `/api/rooms/${roomSlug}/lobby/${requestId}`,
  });

  assert.equal(statusResponse.statusCode, 200);
  assert.deepEqual(statusResponse.json(), {
    status: "denied",
    reason: "host_denied",
  });

  await app.close();
});

test("lobby host endpoints require the host secret", async () => {
  const app = buildApp();

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/rooms",
    payload: {
      accessMode: "lobby",
    },
  });

  const { roomSlug } = createResponse.json();

  const response = await app.inject({
    method: "GET",
    url: `/api/rooms/${roomSlug}/lobby`,
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), {
    message: "Host secret is required",
  });

  await app.close();
});

test("POST /api/rooms/:slug/join denies when the room is full", async () => {
  const app = buildApp();

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/rooms",
    payload: {
      maxParticipants: 2,
    },
  });

  const { roomSlug } = createResponse.json();

  await app.inject({
    method: "POST",
    url: `/api/rooms/${roomSlug}/join`,
    payload: {
      displayName: "Sam",
    },
  });

  await app.inject({
    method: "POST",
    url: `/api/rooms/${roomSlug}/join`,
    payload: {
      displayName: "Alex",
    },
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/rooms/${roomSlug}/join`,
    payload: {
      displayName: "Jordan",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    joinState: "denied",
    reason: "room_full",
  });

  await app.close();
});

test("POST /api/rooms/:slug/token returns signed SFU credentials for an admitted session", async () => {
  const app = buildApp({
    liveKitConfig: TEST_LIVEKIT_CONFIG,
  });

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/rooms",
  });

  const { roomSlug } = createResponse.json();

  const joinResponse = await app.inject({
    method: "POST",
    url: `/api/rooms/${roomSlug}/join`,
    payload: {
      displayName: "Sam",
    },
  });

  const { sessionId } = joinResponse.json();

  const response = await app.inject({
    method: "POST",
    url: `/api/rooms/${roomSlug}/token`,
    payload: {
      sessionId,
      transportPreference: "sfu",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().transport, "sfu");
  assert.equal(response.json().sfuUrl, "ws://localhost:7880");
  assert.equal(response.json().roomName, roomSlug);
  assert.equal(response.json().participantIdentity, sessionId);
  assert.equal(response.json().participantName, "Sam");
  assert.equal(typeof response.json().token, "string");
  assert.match(response.json().token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

  await app.close();
});

test("POST /api/rooms/:slug/token fails cleanly when SFU config is missing", async () => {
  const app = buildApp({
    liveKitConfig: null,
  });

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/rooms",
  });

  const { roomSlug } = createResponse.json();

  const joinResponse = await app.inject({
    method: "POST",
    url: `/api/rooms/${roomSlug}/join`,
    payload: {
      displayName: "Sam",
    },
  });

  const { sessionId } = joinResponse.json();

  const response = await app.inject({
    method: "POST",
    url: `/api/rooms/${roomSlug}/token`,
    payload: {
      sessionId,
    },
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), {
    message: "SFU media service is not configured",
  });

  await app.close();
});

test("POST /api/rooms/:slug/token rejects unknown sessions", async () => {
  const app = buildApp({
    liveKitConfig: TEST_LIVEKIT_CONFIG,
  });

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/rooms",
  });

  const { roomSlug } = createResponse.json();

  const response = await app.inject({
    method: "POST",
    url: `/api/rooms/${roomSlug}/token`,
    payload: {
      sessionId: "sess_missing",
      transportPreference: "sfu",
    },
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), {
    message: "Session not found",
  });

  await app.close();
});

test("POST /api/rooms/:slug/join denies when the room TTL has already expired", async () => {
  let currentTime = new Date("2026-03-24T12:00:00.000Z");
  const app = buildApp({
    now: () => currentTime,
  });

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/rooms",
  });

  const { roomSlug } = createResponse.json();
  currentTime = new Date("2026-03-24T15:00:00.000Z");

  const response = await app.inject({
    method: "POST",
    url: `/api/rooms/${roomSlug}/join`,
    payload: {
      displayName: "Late Guest",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    joinState: "denied",
    reason: "room_expired",
  });

  await app.close();
});
