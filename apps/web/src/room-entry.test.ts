import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRequestedMedia,
  clearStoredCallSession,
  clearStoredHostSecret,
  clearStoredLobbyRequest,
  getApiBaseUrl,
  getCallRoute,
  getViewState,
  getWaitingRoute,
  loadStoredHostSecret,
  loadStoredLobbyRequest,
  loadStoredCallSession,
  saveStoredHostSecret,
  saveStoredLobbyRequest,
  saveStoredCallSession,
} from "./room-entry.js";

test("getViewState resolves room and call routes", () => {
  assert.deepEqual(getViewState("/"), { kind: "home" });
  assert.deepEqual(getViewState("/r/Room123"), { kind: "room", slug: "Room123" });
  assert.deepEqual(getViewState("/r/Room123/waiting/req_abc123"), {
    kind: "waiting",
    slug: "Room123",
    requestId: "req_abc123",
  });
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
  assert.equal(getWaitingRoute("Room123", "req_123"), "/r/Room123/waiting/req_123");
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
    advancedPrefs: undefined,
  });

  clearStoredCallSession(mockStorage, "Room123");
  assert.equal(loadStoredCallSession(mockStorage, "Room123"), null);
});

test("stored lobby requests and host secret round-trip cleanly", () => {
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

  saveStoredLobbyRequest(mockStorage, "Room123", {
    requestId: "req_123",
    displayName: "Sam",
    qualityPreset: "balanced",
    requestedMedia: {
      audio: true,
      video: false,
    },
  });
  saveStoredHostSecret(mockStorage, "Room123", "host_secret_123");

  assert.deepEqual(loadStoredLobbyRequest(mockStorage, "Room123"), {
    requestId: "req_123",
    displayName: "Sam",
    qualityPreset: "balanced",
    requestedMedia: {
      audio: true,
      video: false,
    },
  });
  assert.equal(loadStoredHostSecret(mockStorage, "Room123"), "host_secret_123");

  clearStoredLobbyRequest(mockStorage, "Room123");
  assert.equal(loadStoredLobbyRequest(mockStorage, "Room123"), null);
});


test("clearStoredHostSecret removes the host secret and is a no-op for missing keys", () => {
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

  saveStoredHostSecret(mockStorage, "Room456", "host_secret_xyz");
  assert.equal(loadStoredHostSecret(mockStorage, "Room456"), "host_secret_xyz");

  clearStoredHostSecret(mockStorage, "Room456");
  assert.equal(loadStoredHostSecret(mockStorage, "Room456"), null);

  // No-op for a slug that has no cached secret.
  clearStoredHostSecret(mockStorage, "RoomDoesNotExist");
  assert.equal(loadStoredHostSecret(mockStorage, "RoomDoesNotExist"), null);
});


test("stored call sessions round-trip advancedPrefs", () => {
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

  saveStoredCallSession(mockStorage, "Room789", {
    sessionId: "sess_789",
    displayName: "Avery",
    qualityPreset: "balanced",
    transportPreference: "sfu",
    requestedMedia: {
      audio: true,
      video: true,
    },
    advancedPrefs: {
      maxResolution: "360p",
      maxFps: 12,
      maxBitrateKbps: 300,
      audioPriority: true,
      audioOnly: false,
      receiveVideo: true,
    },
  });

  const loaded = loadStoredCallSession(mockStorage, "Room789");
  assert.deepEqual(loaded?.advancedPrefs, {
    maxResolution: "360p",
    maxFps: 12,
    maxBitrateKbps: 300,
    audioPriority: true,
    audioOnly: false,
    receiveVideo: true,
  });
});

test("stored call sessions without advancedPrefs load with advancedPrefs undefined", () => {
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

  saveStoredCallSession(mockStorage, "RoomLegacy", {
    sessionId: "sess_legacy",
    displayName: "Legacy",
    qualityPreset: "balanced",
    transportPreference: "sfu",
    requestedMedia: {
      audio: true,
      video: true,
    },
  });

  const loaded = loadStoredCallSession(mockStorage, "RoomLegacy");
  assert.equal(loaded?.advancedPrefs, undefined);
});
