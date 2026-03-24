import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRequestedMedia,
  clearStoredCallSession,
  getApiBaseUrl,
  getCallRoute,
  getViewState,
  loadStoredCallSession,
  saveStoredCallSession,
} from "./room-entry.js";

test("getViewState resolves room and call routes", () => {
  assert.deepEqual(getViewState("/"), { kind: "home" });
  assert.deepEqual(getViewState("/r/Room123"), { kind: "room", slug: "Room123" });
  assert.deepEqual(getViewState("/r/Room123/call"), { kind: "call", slug: "Room123" });
});

test("getApiBaseUrl prefers explicit config and falls back to localhost server port", () => {
  assert.equal(
    getApiBaseUrl("https://api.lowti.me/", new URL("https://lowti.me") as unknown as Location),
    "https://api.lowti.me",
  );
  assert.equal(
    getApiBaseUrl(undefined, new URL("http://example.test/path") as unknown as Location),
    "http://example.test:3000",
  );
});

test("call route and requested media helpers return stable values", () => {
  assert.equal(getCallRoute("Room123"), "/r/Room123/call");
  assert.deepEqual(buildRequestedMedia(true, false), {
    audio: true,
    video: false,
  });
});

test("stored call sessions round-trip and clear cleanly", () => {
  const storage = new Map<string, string>();
  const mockStorage = {
    getItem(key: string) {
      return storage.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      storage.set(key, value);
    },
    removeItem(key: string) {
      storage.delete(key);
    },
  } as Storage;

  saveStoredCallSession(mockStorage, "Room123", {
    sessionId: "sess_123",
    displayName: "Sam",
    qualityPreset: "balanced",
    transportPreference: "sfu",
    requestedMedia: {
      audio: true,
      video: true,
    },
  });

  assert.deepEqual(loadStoredCallSession(mockStorage, "Room123"), {
    sessionId: "sess_123",
    displayName: "Sam",
    qualityPreset: "balanced",
    transportPreference: "sfu",
    requestedMedia: {
      audio: true,
      video: true,
    },
  });

  clearStoredCallSession(mockStorage, "Room123");
  assert.equal(loadStoredCallSession(mockStorage, "Room123"), null);
});
