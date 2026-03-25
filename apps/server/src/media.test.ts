import test from "node:test";
import assert from "node:assert/strict";

import { buildApp } from "./app.js";
import { TEST_LIVEKIT_CONFIG } from "./test-helpers.js";

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
