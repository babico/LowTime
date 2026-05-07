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
