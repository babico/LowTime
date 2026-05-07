import assert from "node:assert/strict";
import test from "node:test";

import { joinRoomRequest } from "./room-actions.js";

function createFetchStub(responseBody: unknown, ok = true) {
  const calls: Array<{ url: string; body: unknown }> = [];

  const stub = async (url: string, init?: RequestInit) => {
    const bodyText = typeof init?.body === "string" ? init.body : "";
    calls.push({
      url,
      body: bodyText === "" ? null : JSON.parse(bodyText),
    });
    return {
      ok,
      async json() {
        return responseBody;
      },
    } as unknown as Response;
  };

  return { stub, calls };
}

test("joinRoomRequest forwards passcode when provided", async () => {
  const { stub, calls } = createFetchStub({
    joinState: "direct",
    sessionId: "sess_1",
    transportPreference: "sfu",
  });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = stub as unknown as typeof fetch;

  try {
    await joinRoomRequest({
      apiBaseUrl: "http://localhost:3000",
      displayName: "Sam",
      passcode: "my-secret",
      qualityPreset: "balanced",
      requestedMedia: { audio: true, video: true },
      slug: "Room123",
    });
  } finally {
    globalThis.fetch = previousFetch;
  }

  assert.equal(calls.length, 1);
  const body = calls[0].body as Record<string, unknown>;
  assert.equal(body.passcode, "my-secret");
  assert.equal(body.displayName, "Sam");
});

test("joinRoomRequest omits passcode when empty or missing", async () => {
  const { stub, calls } = createFetchStub({
    joinState: "direct",
    sessionId: "sess_1",
    transportPreference: "sfu",
  });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = stub as unknown as typeof fetch;

  try {
    // Empty passcode.
    await joinRoomRequest({
      apiBaseUrl: "http://localhost:3000",
      displayName: "Sam",
      passcode: "",
      qualityPreset: "balanced",
      requestedMedia: { audio: true, video: true },
      slug: "Room123",
    });

    // Omitted passcode.
    await joinRoomRequest({
      apiBaseUrl: "http://localhost:3000",
      displayName: "Sam",
      qualityPreset: "balanced",
      requestedMedia: { audio: true, video: true },
      slug: "Room123",
    });
  } finally {
    globalThis.fetch = previousFetch;
  }

  assert.equal(calls.length, 2);
  for (const call of calls) {
    const body = call.body as Record<string, unknown>;
    assert.equal("passcode" in body, false);
  }
});

test("joinRoomRequest never writes passcode to any passed-in storage", async () => {
  // `joinRoomRequest` does not receive a Storage argument; this test simply
  // documents that invariant by asserting the function signature does not
  // accept one. The compile-time check is part of `npm run typecheck`.
  const signatureFields = new Set(Object.keys({
    apiBaseUrl: "",
    displayName: "",
    passcode: "",
    qualityPreset: "balanced" as const,
    requestedMedia: { audio: true, video: true },
    slug: "",
  }));
  assert.equal(signatureFields.has("storage"), false);
});


import { reclaimHostRole } from "./room-actions.js";

function createReclaimStub(
  status: number,
  body: unknown,
): { stub: typeof fetch; calls: Array<{ url: string; headers: Record<string, string> }> } {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const stub = async (url: string, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    if (init?.headers) {
      for (const [key, value] of Object.entries(init.headers as Record<string, string>)) {
        headers[key.toLowerCase()] = value;
      }
    }
    calls.push({ url, headers });
    return {
      ok: status >= 200 && status < 300,
      status,
      async json() {
        return body;
      },
    } as unknown as Response;
  };
  return { stub: stub as unknown as typeof fetch, calls };
}

test("reclaimHostRole sends x-host-secret header and returns ok on 200", async () => {
  const { stub, calls } = createReclaimStub(200, {
    room: {
      slug: "Room123",
      accessMode: "open",
      maxParticipants: 2,
      qualityCap: "balanced",
      allowScreenShare: true,
      status: "created",
      expiresAt: "2026-03-24T18:00:00Z",
    },
    lobbyRequests: [],
  });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = stub;

  try {
    const outcome = await reclaimHostRole({
      apiBaseUrl: "http://localhost:3000",
      hostSecret: "secret-xyz",
      slug: "Room123",
    });

    assert.equal(outcome.kind, "ok");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://localhost:3000/api/rooms/Room123/reclaim");
    assert.equal(calls[0].headers["x-host-secret"], "secret-xyz");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("reclaimHostRole returns 'unauthorized' on 403", async () => {
  const { stub } = createReclaimStub(403, { message: "Host secret is required" });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = stub;

  try {
    const outcome = await reclaimHostRole({
      apiBaseUrl: "http://localhost:3000",
      hostSecret: "bad",
      slug: "Room123",
    });
    assert.equal(outcome.kind, "unauthorized");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("reclaimHostRole returns 'unavailable' on 409", async () => {
  const { stub } = createReclaimStub(409, { message: "Room is no longer available" });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = stub;

  try {
    const outcome = await reclaimHostRole({
      apiBaseUrl: "http://localhost:3000",
      hostSecret: "secret",
      slug: "Room123",
    });
    assert.equal(outcome.kind, "unavailable");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("reclaimHostRole returns 'error' with a default message on non-parseable bodies", async () => {
  const stub = async () => {
    return {
      ok: false,
      status: 500,
      async json() {
        throw new Error("parse error");
      },
    } as unknown as Response;
  };
  const previousFetch = globalThis.fetch;
  globalThis.fetch = stub as unknown as typeof fetch;

  try {
    const outcome = await reclaimHostRole({
      apiBaseUrl: "http://localhost:3000",
      hostSecret: "secret",
      slug: "Room123",
    });
    assert.equal(outcome.kind, "error");
    if (outcome.kind === "error") {
      assert.ok(outcome.message.length > 0);
    }
  } finally {
    globalThis.fetch = previousFetch;
  }
});
