import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import IORedis, { type Redis as IORedisType } from "ioredis";

import {
  createRedisPasscodeRateLimiter,
  createRedisRoomCreateRateLimiter,
  type RedisLike,
} from "./domain/redis-rate-limiter.js";

/**
 * Smoke test against the real Redis instance. The `runIfReachable`
 * helper short-circuits to a no-op when the host is unreachable so
 * `npm test` does not flake on offline machines.
 */

const REDIS_HOST = "192.168.21.2";
const REDIS_PORT = 16379;
const REDIS_PASSWORD = "redis";

function makeRedis(): RedisLike {
  return new IORedis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  }) as unknown as RedisLike;
}

async function redisIsReachable(): Promise<boolean> {
  try {
    const redis = new IORedis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 1500,
    });
    await redis.connect();
    const result = (await redis.ping()) as string;
    await redis.quit();
    return result === "PONG";
  } catch {
    return false;
  }
}

const runIfReachable = await redisIsReachable();

describe("createRedisPasscodeRateLimiter (live Redis)", () => {
  test("allows, throttles, and recovers against a real Redis", { skip: !runIfReachable }, async () => {
    const redis = makeRedis();
    const limiter = createRedisPasscodeRateLimiter({
      redis,
      keyPrefix: `lowtime-test-pw-${Date.now()}`,
      threshold: 2,
      windowMs: 60_000,
      cooldownMs: 30_000,
    });

    const key = { clientIp: "203.0.113.99", slug: "alpha-live" as never };

    assert.equal(await limiter.shouldAllow(key), true);
    await limiter.recordFailure(key);
    assert.equal(await limiter.shouldAllow(key), true);
    await limiter.recordFailure(key);
    assert.equal(await limiter.shouldAllow(key), false);
    await limiter.recordSuccess(key);
    assert.equal(await limiter.shouldAllow(key), true);

    await limiter.clear("alpha-live" as never);
    await (redis as unknown as IORedisType).quit();
  });
});

describe("createRedisRoomCreateRateLimiter (live Redis)", () => {
  test("counts failures and re-allows after the window against a real Redis", { skip: !runIfReachable }, async () => {
    const redis = makeRedis();
    let now = 0;
    const limiter = createRedisRoomCreateRateLimiter({
      redis,
      keyPrefix: `lowtime-test-create-${Date.now()}`,
      threshold: 2,
      windowMs: 60_000,
      cooldownMs: 30_000,
      now: () => now,
    });

    await limiter.recordFailure("203.0.113.42");
    await limiter.recordFailure("203.0.113.42");
    assert.equal(await limiter.shouldAllow("203.0.113.42"), false);

    now = 100_000;
    await limiter.recordFailure("203.0.113.42");
    assert.equal(await limiter.shouldAllow("203.0.113.42"), true);

    await limiter.clearAll();
    await (redis as unknown as IORedisType).quit();
  });
});
