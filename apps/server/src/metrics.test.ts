import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  createInMemoryMetrics,
  incrementCounter,
  recordEvent,
  type MetricsEvent,
  type MetricsRegistry,
} from "./domain/metrics.js";

function makeRegistry(): MetricsRegistry {
  return createInMemoryMetrics();
}

describe("createInMemoryMetrics", () => {
  test("starts with all known counters at zero", () => {
    const metrics = makeRegistry();
    const summary = metrics.snapshot();
    for (const value of Object.values(summary.counters)) {
      assert.equal(value, 0);
    }
  });

  test("records a tagged event and bumps the matching counter", () => {
    const metrics = makeRegistry();
    metrics.record({ name: "room_created", tags: { accessMode: "open" } });
    metrics.record({ name: "room_created", tags: { accessMode: "lobby" } });
    metrics.record({ name: "room_created", tags: { accessMode: "lobby" } });
    const summary = metrics.snapshot();
    assert.equal(summary.counters["room_created{accessMode=open}"] ?? 0, 1);
    assert.equal(summary.counters["room_created{accessMode=lobby}"] ?? 0, 2);
  });

  test("recordEvent is a pure helper that returns a tagged event", () => {
    const event = recordEvent("join_succeeded", { transport: "sfu" });
    assert.deepEqual(event, { name: "join_succeeded", tags: { transport: "sfu" } });
  });

  test("incrementCounter is a pure helper that returns a counter key", () => {
    const key = incrementCounter("room_created", { accessMode: "open", maxParticipants: "4" });
    assert.equal(key, "room_created{accessMode=open,maxParticipants=4}");
  });

  test("ignores unknown event names so a typo cannot poison the registry", () => {
    const metrics = makeRegistry();
    const event: MetricsEvent = { name: "not_a_real_event" as "room_created", tags: { foo: "bar" } };
    metrics.record(event);
    const summary = metrics.snapshot();
    assert.equal(Object.keys(summary.counters).length, 0);
  });

  test("drops empty tag values so an unlabelled event is one counter and a labelled event is another", () => {
    const metrics = makeRegistry();
    metrics.record({ name: "room_created", tags: { accessMode: "" } });
    metrics.record({ name: "room_created", tags: { accessMode: "open" } });
    metrics.record({ name: "room_created", tags: {} });
    const summary = metrics.snapshot();
    assert.equal(summary.counters["room_created"] ?? 0, 2);
    assert.equal(summary.counters["room_created{accessMode=open}"] ?? 0, 1);
  });

  test("serializes the snapshot as a stable JSON shape", () => {
    const metrics = makeRegistry();
    metrics.record({ name: "room_created", tags: { accessMode: "open" } });
    const summary = metrics.snapshot();
    const json = JSON.stringify(summary);
    const parsed = JSON.parse(json) as { counters: Record<string, number>; emittedAt: string };
    assert.equal(typeof parsed.emittedAt, "string");
    assert.equal(parsed.counters["room_created{accessMode=open}"], 1);
  });
});
