import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { buildApp } from "./app.js";
import { createInMemoryMetrics, recordEvent } from "./domain/metrics.js";

describe("GET /metrics", () => {
  test("returns the Prometheus exposition format with a snapshot timestamp", async () => {
    const metrics = createInMemoryMetrics();
    metrics.record(recordEvent("room_created", { accessMode: "open" }));
    metrics.record(recordEvent("room_created", { accessMode: "lobby" }));

    const app = buildApp({ metrics, now: () => new Date("2026-06-23T00:00:00.000Z") });

    const response = await app.inject({ method: "GET", url: "/metrics" });

    assert.equal(response.statusCode, 200);
    assert.match(response.headers["content-type"] as string, /text\/plain/);
    const body = response.body;
    assert.match(body, /# HELP room_created /);
    assert.match(body, /# TYPE room_created counter/);
    assert.match(body, /room_created\{accessMode="open"\} 1/);
    assert.match(body, /room_created\{accessMode="lobby"\} 1/);
    assert.match(body, /lowtime_metrics_emitted_at_seconds \d+/);

    await app.close();
  });

  test("emits only the meta block when no counters have been recorded", async () => {
    const app = buildApp({ now: () => new Date("2026-06-23T00:00:00.000Z") });
    const response = await app.inject({ method: "GET", url: "/metrics" });

    assert.equal(response.statusCode, 200);
    assert.match(response.body, /# HELP lowtime_metrics_emitted_at_seconds/);
    assert.doesNotMatch(response.body, /# HELP room_created/);

    await app.close();
  });
});
