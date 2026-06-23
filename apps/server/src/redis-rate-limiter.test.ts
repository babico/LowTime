import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import RedisMock from "ioredis-mock";

import {
  createRedisPasscodeRateLimiter,
  createRedisReclaimRateLimiter,
  createRedisRoomCreateRateLimiter,
  type RedisLike,
} from "./domain/redis-rate-limiter.js";

function makeRedis(): RedisLike {
  return new RedisMock() as unknown as RedisLike;
}

function makeKey(parts: string[]): string {
  return parts.join("\u0001");
}

describe("createRedisPasscodeRateLimiter", () => {
  test("allows the first request and tracks no failures", async () => {
    const redis = makeRedis();
    const limiter = createRedisPasscodeRateLimiter({ redis, keyPrefix: "test:pw" });
    const key = makeKey(["203.0.113.1", "alpha"]);

    assert.equal(await limiter.shouldAllow({ clientIp: "203.0.113.1", slug: "alpha" }), true);
    const state = await limiter.getState({ clientIp: "203.0.113.1", slug: "alpha" });
    assert.equal(state.failuresInWindow, 0);
    assert.equal(state.cooldownUntil, null);

    void key;
  });

  test("reaches the threshold and enters cooldown", async () => {
    const redis = makeRedis();
    const limiter = createRedisPasscodeRateLimiter({
      redis,
      keyPrefix: "test:pw",
      threshold: 2,
      cooldownMs: 30_000,
    });

    await limiter.recordFailure({ clientIp: "203.0.113.1", slug: "alpha" });
    assert.equal(await limiter.shouldAllow({ clientIp: "203.0.113.1", slug: "alpha" }), true);
    await limiter.recordFailure({ clientIp: "203.0.113.1", slug: "alpha" });
    assert.equal(await limiter.shouldAllow({ clientIp: "203.0.113.1", slug: "alpha" }), false);
  });

  test("expires the cooldown after the window elapses", async () => {
    const redis = makeRedis();
    let now = 0;
    const limiter = createRedisPasscodeRateLimiter({
      redis,
      keyPrefix: "test:pw",
      threshold: 1,
      cooldownMs: 30_000,
      now: () => now,
    });

    await limiter.recordFailure({ clientIp: "203.0.113.1", slug: "alpha" });
    assert.equal(await limiter.shouldAllow({ clientIp: "203.0.113.1", slug: "alpha" }), false);

    now = 31_000;
    assert.equal(await limiter.shouldAllow({ clientIp: "203.0.113.1", slug: "alpha" }), true);
  });

  test("recordSuccess clears the failure ring and cooldown", async () => {
    const redis = makeRedis();
    const limiter = createRedisPasscodeRateLimiter({
      redis,
      keyPrefix: "test:pw",
      threshold: 1,
    });

    await limiter.recordFailure({ clientIp: "203.0.113.1", slug: "alpha" });
    assert.equal(await limiter.shouldAllow({ clientIp: "203.0.113.1", slug: "alpha" }), false);
    await limiter.recordSuccess({ clientIp: "203.0.113.1", slug: "alpha" });
    assert.equal(await limiter.shouldAllow({ clientIp: "203.0.113.1", slug: "alpha" }), true);
  });

  test("isolates buckets per (clientIp, slug) pair", async () => {
    const redis = makeRedis();
    const limiter = createRedisPasscodeRateLimiter({
      redis,
      keyPrefix: "test:pw",
      threshold: 1,
    });

    await limiter.recordFailure({ clientIp: "203.0.113.1", slug: "alpha" });
    assert.equal(await limiter.shouldAllow({ clientIp: "203.0.113.1", slug: "alpha" }), false);
    assert.equal(await limiter.shouldAllow({ clientIp: "203.0.113.1", slug: "beta" }), true);
    assert.equal(await limiter.shouldAllow({ clientIp: "198.51.100.7", slug: "alpha" }), true);
  });

  test("clear() wipes every bucket for the given slug", async () => {
    const redis = makeRedis();
    const limiter = createRedisPasscodeRateLimiter({
      redis,
      keyPrefix: "test:pw",
      threshold: 1,
    });

    await limiter.recordFailure({ clientIp: "203.0.113.1", slug: "alpha" });
    await limiter.recordFailure({ clientIp: "198.51.100.7", slug: "alpha" });
    assert.equal(await limiter.shouldAllow({ clientIp: "203.0.113.1", slug: "alpha" }), false);
    assert.equal(await limiter.shouldAllow({ clientIp: "198.51.100.7", slug: "alpha" }), false);

    await limiter.clear("alpha");
    assert.equal(await limiter.shouldAllow({ clientIp: "203.0.113.1", slug: "alpha" }), true);
    assert.equal(await limiter.shouldAllow({ clientIp: "198.51.100.7", slug: "alpha" }), true);
  });
});

describe("createRedisReclaimRateLimiter", () => {
  test("blocks after the threshold and clears on success", async () => {
    const redis = makeRedis();
    const limiter = createRedisReclaimRateLimiter({
      redis,
      keyPrefix: "test:reclaim",
      threshold: 2,
      cooldownMs: 10_000,
    });

    const key = { clientIp: "203.0.113.1", slug: "alpha" };
    await limiter.recordFailure(key);
    await limiter.recordFailure(key);
    assert.equal(await limiter.shouldAllow(key), false);

    await limiter.recordSuccess(key);
    assert.equal(await limiter.shouldAllow(key), true);
  });
});

describe("createRedisRoomCreateRateLimiter", () => {
  test("isolates buckets per client IP and applies the sliding window", async () => {
    const redis = makeRedis();
    let now = 0;
    const limiter = createRedisRoomCreateRateLimiter({
      redis,
      keyPrefix: "test:create",
      threshold: 2,
      windowMs: 60_000,
      cooldownMs: 30_000,
      now: () => now,
    });

    await limiter.recordFailure("203.0.113.1");
    await limiter.recordFailure("203.0.113.1");
    assert.equal(await limiter.shouldAllow("203.0.113.1"), false);
    assert.equal(await limiter.shouldAllow("198.51.100.7"), true);

    now = 100_000;
    await limiter.recordFailure("203.0.113.1");
    assert.equal(await limiter.shouldAllow("203.0.113.1"), true);
  });

  test("clearAll wipes every bucket", async () => {
    const redis = makeRedis();
    const limiter = createRedisRoomCreateRateLimiter({
      redis,
      keyPrefix: "test:create",
      threshold: 1,
    });

    await limiter.recordFailure("203.0.113.1");
    await limiter.recordFailure("198.51.100.7");
    assert.equal(await limiter.shouldAllow("203.0.113.1"), false);
    assert.equal(await limiter.shouldAllow("198.51.100.7"), false);

    await limiter.clearAll();
    assert.equal(await limiter.shouldAllow("203.0.113.1"), true);
    assert.equal(await limiter.shouldAllow("198.51.100.7"), true);
  });
});
