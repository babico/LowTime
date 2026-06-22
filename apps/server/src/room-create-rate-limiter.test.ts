import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  createInMemoryRoomCreateRateLimiter,
  type RoomCreateRateLimiter,
} from "./domain/room-create-rate-limiter.js";

function makeLimiter(overrides: {
  windowMs?: number;
  threshold?: number;
  cooldownMs?: number;
  now?: () => number;
} = {}): { limiter: RoomCreateRateLimiter; now: () => number } {
  let tick = 0;
  const now = overrides.now ?? (() => {
    tick += 1;
    return tick * 1000;
  });
  return {
    now,
    limiter: createInMemoryRoomCreateRateLimiter({
      windowMs: overrides.windowMs ?? 60_000,
      threshold: overrides.threshold ?? 5,
      cooldownMs: overrides.cooldownMs ?? 30_000,
      now,
    }),
  };
}

describe("createInMemoryRoomCreateRateLimiter", () => {
  test("allows the first request and tracks no failures", () => {
    const { limiter } = makeLimiter();
    assert.equal(limiter.shouldAllow("203.0.113.1"), true);
    const state = limiter.getState("203.0.113.1");
    assert.equal(state.failuresInWindow, 0);
    assert.equal(state.cooldownUntil, null);
  });

  test("records a failure and returns true up to the threshold", () => {
    const { limiter } = makeLimiter({ threshold: 3 });
    limiter.recordFailure("203.0.113.1");
    assert.equal(limiter.shouldAllow("203.0.113.1"), true);
    limiter.recordFailure("203.0.113.1");
    assert.equal(limiter.shouldAllow("203.0.113.1"), true);
    limiter.recordFailure("203.0.113.1");
    assert.equal(limiter.shouldAllow("203.0.113.1"), false);
  });

  test("places the client in cooldown after the threshold and expires it after cooldownMs", () => {
    let now = 0;
    const { limiter } = makeLimiter({ threshold: 2, cooldownMs: 30_000, now: () => now });
    limiter.recordFailure("203.0.113.1");
    limiter.recordFailure("203.0.113.1");
    assert.equal(limiter.shouldAllow("203.0.113.1"), false);

    now = 31_000;
    assert.equal(limiter.shouldAllow("203.0.113.1"), true);
  });

  test("recordSuccess clears the counter so the client can try again", () => {
    const { limiter } = makeLimiter({ threshold: 2 });
    limiter.recordFailure("203.0.113.1");
    limiter.recordFailure("203.0.113.1");
    assert.equal(limiter.shouldAllow("203.0.113.1"), false);

    limiter.recordSuccess("203.0.113.1");
    assert.equal(limiter.shouldAllow("203.0.113.1"), true);
  });

  test("isolates buckets per client IP so one noisy IP does not affect another", () => {
    const { limiter } = makeLimiter({ threshold: 2 });
    limiter.recordFailure("203.0.113.1");
    limiter.recordFailure("203.0.113.1");
    assert.equal(limiter.shouldAllow("203.0.113.1"), false);
    assert.equal(limiter.shouldAllow("198.51.100.7"), true);
  });

  test("prunes failures that fall outside the sliding window", () => {
    let now = 0;
    const { limiter } = makeLimiter({ threshold: 2, windowMs: 60_000, now: () => now });
    limiter.recordFailure("203.0.113.1");
    now = 100_000;
    limiter.recordFailure("203.0.113.1");
    assert.equal(limiter.shouldAllow("203.0.113.1"), true);
  });

  test("clearAll wipes every bucket", () => {
    const { limiter } = makeLimiter({ threshold: 1 });
    limiter.recordFailure("203.0.113.1");
    limiter.recordFailure("198.51.100.7");
    assert.equal(limiter.shouldAllow("203.0.113.1"), false);
    assert.equal(limiter.shouldAllow("198.51.100.7"), false);
    limiter.clearAll();
    assert.equal(limiter.shouldAllow("203.0.113.1"), true);
    assert.equal(limiter.shouldAllow("198.51.100.7"), true);
  });
});
