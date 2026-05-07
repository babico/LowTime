import test from "node:test";
import assert from "node:assert/strict";

import { buildApp } from "./app.js";

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
  assert.deepEqual(
    listResponse.json().requests.map((entry: { requestId: string; displayName: string }) => ({
      requestId: entry.requestId,
      displayName: entry.displayName,
    })),
    [
      {
        requestId,
        displayName: "Lobby Guest",
      },
    ],
  );

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
