import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { buildApp } from "./app.js";
import {
  createInMemoryRoomCreateRateLimiter,
  type RoomCreateRateLimiter,
} from "./domain/room-create-rate-limiter.js";

function makeApp(rateLimiter: RoomCreateRateLimiter) {
  return buildApp({
    now: () => new Date("2026-06-23T12:00:00.000Z"),
    roomCreateRateLimiter: rateLimiter,
  });
}

describe("POST /api/rooms rate limiting", () => {
  test("returns 429 when the per-IP room-create rate limiter is in cooldown", async () => {
    const rateLimiter = createInMemoryRoomCreateRateLimiter({
      threshold: 1,
      cooldownMs: 30_000,
    });
    // First request consumes the budget; the second trips the limit.
    rateLimiter.recordFailure("203.0.113.1");
    const app = makeApp(rateLimiter);

    const response = await app.inject({
      method: "POST",
      url: "/api/rooms",
      headers: { "x-forwarded-for": "203.0.113.1" },
    });

    assert.equal(response.statusCode, 429);
    const body = response.json() as { message: string };
    assert.match(body.message, /Too many rooms/i);

    await app.close();
  });

  test("successful room creation clears the rate-limit bucket", async () => {
    const rateLimiter = createInMemoryRoomCreateRateLimiter({
      threshold: 2,
      cooldownMs: 30_000,
    });
    rateLimiter.recordFailure("203.0.113.1");
    const app = makeApp(rateLimiter);

    const response = await app.inject({
      method: "POST",
      url: "/api/rooms",
      headers: { "x-forwarded-for": "203.0.113.1" },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(rateLimiter.getState("203.0.113.1").failuresInWindow, 0);

    await app.close();
  });
});
