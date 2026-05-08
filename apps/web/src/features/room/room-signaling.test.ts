import assert from "node:assert/strict";
import test from "node:test";

import { signalingWsUrlFromApiBase } from "./room-signaling.js";

test("signalingWsUrlFromApiBase maps http bases to ws", () => {
  assert.equal(
    signalingWsUrlFromApiBase("http://localhost:3000"),
    "ws://localhost:3000/signal",
  );
});

test("signalingWsUrlFromApiBase maps https bases to wss", () => {
  assert.equal(
    signalingWsUrlFromApiBase("https://api.lowti.me"),
    "wss://api.lowti.me/signal",
  );
});

test("signalingWsUrlFromApiBase strips a trailing slash before appending /signal", () => {
  assert.equal(
    signalingWsUrlFromApiBase("https://api.lowti.me/"),
    "wss://api.lowti.me/signal",
  );
});

test("signalingWsUrlFromApiBase keeps a ws base as-is and appends /signal exactly once", () => {
  assert.equal(
    signalingWsUrlFromApiBase("ws://localhost:3000"),
    "ws://localhost:3000/signal",
  );
  assert.equal(
    signalingWsUrlFromApiBase("ws://localhost:3000/signal"),
    "ws://localhost:3000/signal",
  );
});
