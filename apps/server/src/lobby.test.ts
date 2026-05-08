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


test("Approving a lobby request bumps lastActivityAt on the host's room", async () => {
  const { createInMemoryRoomStore } = await import("./domain/room-store.js");

  const store = createInMemoryRoomStore();
  let simulated = new Date("2026-03-24T12:00:00.000Z");
  const app = buildApp({
    now: () => simulated,
    roomStore: store,
  });

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/rooms",
    payload: { accessMode: "lobby" },
  });
  const { roomSlug, hostSecret } = createResponse.json();
  const beforeApprove = store.getRoom(roomSlug)?.lastActivityAt;

  // Guest enters the lobby queue. This is a waiting join and must not bump.
  simulated = new Date(simulated.getTime() + 60_000);
  const joinResponse = await app.inject({
    method: "POST",
    url: `/api/rooms/${roomSlug}/join`,
    payload: { displayName: "Guest" },
  });
  const { requestId } = joinResponse.json();
  assert.equal(store.getRoom(roomSlug)?.lastActivityAt, beforeApprove);

  // Host approves. Activity clock must advance.
  simulated = new Date(simulated.getTime() + 60_000);
  const approveResponse = await app.inject({
    method: "POST",
    url: `/api/rooms/${roomSlug}/lobby/${requestId}/approve`,
    headers: { "x-host-secret": hostSecret },
  });
  assert.equal(approveResponse.statusCode, 200);
  const afterApprove = store.getRoom(roomSlug)?.lastActivityAt;
  assert.equal(afterApprove, simulated.toISOString());

  await app.close();
});

test("Denying a lobby request does NOT bump lastActivityAt", async () => {
  const { createInMemoryRoomStore } = await import("./domain/room-store.js");

  const store = createInMemoryRoomStore();
  let simulated = new Date("2026-03-24T12:00:00.000Z");
  const app = buildApp({
    now: () => simulated,
    roomStore: store,
  });

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/rooms",
    payload: { accessMode: "lobby" },
  });
  const { roomSlug, hostSecret } = createResponse.json();

  simulated = new Date(simulated.getTime() + 60_000);
  const joinResponse = await app.inject({
    method: "POST",
    url: `/api/rooms/${roomSlug}/join`,
    payload: { displayName: "Guest" },
  });
  const { requestId } = joinResponse.json();
  const beforeDeny = store.getRoom(roomSlug)?.lastActivityAt;

  simulated = new Date(simulated.getTime() + 60_000);
  const denyResponse = await app.inject({
    method: "POST",
    url: `/api/rooms/${roomSlug}/lobby/${requestId}/deny`,
    headers: { "x-host-secret": hostSecret },
  });
  assert.equal(denyResponse.statusCode, 200);

  const afterDeny = store.getRoom(roomSlug)?.lastActivityAt;
  assert.equal(afterDeny, beforeDeny);

  await app.close();
});
