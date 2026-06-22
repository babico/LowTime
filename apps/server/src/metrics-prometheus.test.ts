import assert from "node:assert/strict";
import test from "node:test";

import { toPrometheusText } from "./domain/metrics-prometheus.js";

test("toPrometheusText emits a HELP and TYPE preamble per counter name", () => {
  const text = toPrometheusText({
    counters: { "room_created{accessMode=open}": 1 },
    emittedAt: "2026-06-23T00:00:00.000Z",
  });

  assert.match(text, /# HELP room_created /);
  assert.match(text, /# TYPE room_created counter/);
  assert.match(text, /room_created\{accessMode="open"\} 1/);
});

test("toPrometheusText escapes label values containing quotes and backslashes", () => {
  const text = toPrometheusText({
    counters: { 'room_created{accessMode=he"llo\\world}': 3 },
    emittedAt: "2026-06-23T00:00:00.000Z",
  });

  assert.match(text, /room_created\{accessMode="he\\"llo\\\\world"\} 3/);
});

test("toPrometheusText emits the snapshot timestamp as a meta counter", () => {
  const emittedAt = "2026-06-23T00:00:00.000Z";
  const text = toPrometheusText({
    counters: { "room_created": 2 },
    emittedAt,
  });

  const expectedSeconds = Math.floor(new Date(emittedAt).getTime() / 1000);
  assert.match(text, new RegExp(`lowtime_metrics_emitted_at_seconds ${expectedSeconds}`));
});

test("toPrometheusText groups counters by base name and sorts within a group", () => {
  const text = toPrometheusText({
    counters: {
      "room_created{accessMode=open}": 1,
      "room_created{accessMode=lobby}": 2,
      "room_created": 4,
    },
    emittedAt: "2026-06-23T00:00:00.000Z",
  });

  // Unlabelled counter comes last in the Prometheus convention; sorted
  // labelled variants are first.
  const lines = text
    .split("\n")
    .filter((line) => line.startsWith("room_created") && !line.startsWith("#"));
  assert.deepEqual(lines, [
    'room_created{accessMode="lobby"} 2',
    'room_created{accessMode="open"} 1',
    "room_created 4",
  ]);
});

test("toPrometheusText returns just the meta block when no counters are present", () => {
  const emittedAt = "2026-06-23T00:00:00.000Z";
  const text = toPrometheusText({
    counters: {},
    emittedAt,
  });

  const expectedSeconds = Math.floor(new Date(emittedAt).getTime() / 1000);
  assert.equal(
    text,
    [
      "# HELP lowtime_metrics_emitted_at_seconds Unix epoch in seconds when the snapshot was rendered",
      "# TYPE lowtime_metrics_emitted_at_seconds gauge",
      `lowtime_metrics_emitted_at_seconds ${expectedSeconds}`,
    ].join("\n"),
  );
});
