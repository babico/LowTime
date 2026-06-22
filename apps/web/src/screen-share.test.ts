import assert from "node:assert/strict";
import test from "node:test";

import {
  isScreenShareSupported,
  isScreenShareTrackSource,
  requestScreenShareToggle,
} from "./screen-share.js";

test("isScreenShareSupported returns true when navigator.mediaDevices.getDisplayMedia exists", () => {
  const originalNavigator = (globalThis as { navigator?: unknown }).navigator;
  Object.defineProperty(globalThis, "navigator", {
    value: { mediaDevices: { getDisplayMedia: () => Promise.resolve(new MediaStream()) } },
    configurable: true,
    writable: true,
  });

  try {
    assert.equal(isScreenShareSupported(), true);
  } finally {
    if (originalNavigator === undefined) {
      delete (globalThis as { navigator?: unknown }).navigator;
    } else {
      Object.defineProperty(globalThis, "navigator", { value: originalNavigator, configurable: true, writable: true });
    }
  }
});

test("isScreenShareSupported returns false when navigator or mediaDevices is missing", () => {
  const originalNavigator = (globalThis as { navigator?: unknown }).navigator;
  Object.defineProperty(globalThis, "navigator", { value: undefined, configurable: true, writable: true });

  try {
    assert.equal(isScreenShareSupported(), false);
  } finally {
    if (originalNavigator === undefined) {
      delete (globalThis as { navigator?: unknown }).navigator;
    } else {
      Object.defineProperty(globalThis, "navigator", { value: originalNavigator, configurable: true, writable: true });
    }
  }
});

test("isScreenShareSupported returns false when getDisplayMedia is missing", () => {
  const originalNavigator = (globalThis as { navigator?: unknown }).navigator;
  Object.defineProperty(globalThis, "navigator", {
    value: { mediaDevices: {} },
    configurable: true,
    writable: true,
  });

  try {
    assert.equal(isScreenShareSupported(), false);
  } finally {
    if (originalNavigator === undefined) {
      delete (globalThis as { navigator?: unknown }).navigator;
    } else {
      Object.defineProperty(globalThis, "navigator", { value: originalNavigator, configurable: true, writable: true });
    }
  }
});

test("isScreenShareTrackSource accepts LiveKit screen source variants", () => {
  assert.equal(isScreenShareTrackSource("screen_share"), true);
  assert.equal(isScreenShareTrackSource("screenShare"), true);
  assert.equal(isScreenShareTrackSource("screen-share"), true);
  assert.equal(isScreenShareTrackSource("screen_video"), true);
});

test("isScreenShareTrackSource rejects camera, undefined, and other sources", () => {
  assert.equal(isScreenShareTrackSource("camera"), false);
  assert.equal(isScreenShareTrackSource("microphone"), false);
  assert.equal(isScreenShareTrackSource(undefined), false);
  assert.equal(isScreenShareTrackSource(""), false);
});

test("requestScreenShareToggle calls setScreenShareEnabled and reports success", async () => {
  let called = 0;
  const room = {
    localParticipant: {
      setScreenShareEnabled: async (next: boolean) => {
        called += 1;
        assert.equal(next, true);
      },
    },
  };

  const result = await requestScreenShareToggle({
    room,
    nextValue: true,
  });

  assert.equal(called, 1);
  assert.equal(result.ok, true);
});

test("requestScreenShareToggle surfaces underlying error to onError callback", async () => {
  const room = {
    localParticipant: {
      setScreenShareEnabled: async () => {
        throw new Error("Permission denied");
      },
    },
  };

  const captured: string[] = [];
  const result = await requestScreenShareToggle({
    room,
    nextValue: true,
    onError: (message) => {
      captured.push(message);
    },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(captured, ["Permission denied"]);
});

test("requestScreenShareToggle returns a generic error message when rejection is not an Error", async () => {
  const room = {
    localParticipant: {
      setScreenShareEnabled: async () => {
        throw "boom";
      },
    },
  };

  const result = await requestScreenShareToggle({ room, nextValue: false });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.message, "Unable to update screen share state");
  }
});

test("requestScreenShareToggle rejects when room is null", async () => {
  const result = await requestScreenShareToggle({ room: null, nextValue: true });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /not connected/i);
  }
});
