import test from "node:test";
import assert from "node:assert/strict";

import { buildRequestedMedia, getApiBaseUrl, getViewState } from "./room-entry.js";

test("getViewState returns a room view for share links", () => {
  assert.deepEqual(getViewState("/r/Room123"), {
    kind: "room",
    slug: "Room123",
  });
});

test("getViewState returns home for non-room routes", () => {
  assert.deepEqual(getViewState("/"), {
    kind: "home",
  });
});

test("getApiBaseUrl falls back to the current hostname", () => {
  assert.equal(
    getApiBaseUrl(undefined, { protocol: "https:", hostname: "call.lowtime.test" }),
    "https://call.lowtime.test:3000",
  );
});

test("buildRequestedMedia mirrors the selected device toggles", () => {
  assert.deepEqual(buildRequestedMedia(true, false), {
    audio: true,
    video: false,
  });
});
