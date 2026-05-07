import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  createMemoryLogger,
  joinOutputs,
  TEST_LIVEKIT_CONFIG,
} from "./test-helpers.js";

test("TEST_LIVEKIT_CONFIG exposes dev defaults for integration tests", () => {
  assert.equal(TEST_LIVEKIT_CONFIG.url, "ws://localhost:7880");
  assert.equal(TEST_LIVEKIT_CONFIG.apiKey, "devkey");
  assert.equal(TEST_LIVEKIT_CONFIG.apiSecret, "secret");
});

test("createMemoryLogger captures writes made to its stream", () => {
  const logger = createMemoryLogger();

  logger.loggerOption.stream.write("hello\n");
  logger.loggerOption.stream.write("world");

  const captured = logger.readCapturedLogs();
  assert.ok(captured.includes("hello"));
  assert.ok(captured.includes("world"));
});

test("createMemoryLogger returns isolated buffers per helper", () => {
  const first = createMemoryLogger();
  const second = createMemoryLogger();

  first.loggerOption.stream.write("only-first");

  assert.ok(first.readCapturedLogs().includes("only-first"));
  assert.equal(second.readCapturedLogs().includes("only-first"), false);
});

test("joinOutputs concatenates response bodies with log output", () => {
  const combined = joinOutputs(['{"ok":true}', "body-two"], "log-line-a\nlog-line-b");

  assert.ok(combined.includes('{"ok":true}'));
  assert.ok(combined.includes("body-two"));
  assert.ok(combined.includes("log-line-a"));
  assert.ok(combined.includes("log-line-b"));
});
