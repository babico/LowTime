import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import RedisMock from "ioredis-mock";

import {
  createInMemoryPresence,
  createRedisPresence,
  type Presence,
  type RedisLike,
} from "./domain/presence.js";

describe("createInMemoryPresence", () => {
  test("markPresent records the session and isPresent reports true", async () => {
    const now = 0;
    const presence = createInMemoryPresence({ now: () => now });
    await presence.markPresent("alpha", "sess_1", new Date(now));
    assert.equal(await presence.isPresent("alpha", "sess_1"), true);
  });

  test("markAbsent removes the session", async () => {
    const now = 0;
    const presence = createInMemoryPresence({ now: () => now });
    await presence.markPresent("alpha", "sess_1", new Date(now));
    await presence.markAbsent("alpha", "sess_1");
    assert.equal(await presence.isPresent("alpha", "sess_1"), false);
  });

  test("pruneExpired drops sessions whose lastSeenAt is older than the grace window", async () => {
    const now = 0;
    const presence = createInMemoryPresence({ presenceTtlMs: 60_000, now: () => now });
    await presence.markPresent("alpha", "sess_1", new Date(now));
    await presence.markPresent("alpha", "sess_2", new Date(now));
    const removed = await presence.pruneExpired(new Date(now + 60_001));
    assert.deepEqual(removed.sort(), ["alpha\u0001sess_1", "alpha\u0001sess_2"]);
    assert.equal(await presence.isPresent("alpha", "sess_1"), false);
    assert.equal(await presence.isPresent("alpha", "sess_2"), false);
  });

  test("pruneExpired keeps fresh sessions", async () => {
    const now = 0;
    const presence = createInMemoryPresence({ presenceTtlMs: 60_000, now: () => now });
    await presence.markPresent("alpha", "sess_1", new Date(now));
    const removed = await presence.pruneExpired(new Date(now + 30_000));
    assert.deepEqual(removed, []);
    assert.equal(await presence.isPresent("alpha", "sess_1"), true);
  });

  test("isolates buckets by room slug", async () => {
    const now = 0;
    const presence = createInMemoryPresence({ now: () => now });
    await presence.markPresent("alpha", "sess_1", new Date(now));
    assert.equal(await presence.isPresent("beta", "sess_1"), false);
  });
});

describe("createRedisPresence", () => {
  function makeRedis(): RedisLike {
    return new RedisMock() as unknown as RedisLike;
  }

  function newPresence(opts: { ttlMs?: number; now?: () => number } = {}): {
    presence: Presence;
    now: () => number;
  } {
    let tick = 0;
    const now = opts.now ?? (() => {
      tick += 1;
      return tick * 1000;
    });
    return {
      now,
      presence: createRedisPresence({
        redis: makeRedis(),
        keyPrefix: "lowtime-test-presence",
        presenceTtlMs: opts.ttlMs ?? 60_000,
        now,
      }),
    };
  }

  test("markPresent then isPresent reports true", async () => {
    const { presence } = newPresence();
    await presence.markPresent("alpha", "sess_1", new Date("2026-06-22T00:00:00.000Z"));
    assert.equal(await presence.isPresent("alpha", "sess_1"), true);
  });

  test("pruneExpired drops stale keys and keeps fresh ones", async () => {
    let now = 0;
    const { presence } = newPresence({ ttlMs: 60_000, now: () => now });
    await presence.markPresent("alpha", "sess_1", new Date(0));
    await presence.markPresent("alpha", "sess_2", new Date(0));
    now = 30_000;
    await presence.markPresent("beta", "sess_3", new Date(30_000));

    now = 90_000;
    const removed = await presence.pruneExpired(new Date(90_000));
    assert.equal(removed.length, 2);
    assert.equal(await presence.isPresent("alpha", "sess_1"), false);
    assert.equal(await presence.isPresent("alpha", "sess_2"), false);
    assert.equal(await presence.isPresent("beta", "sess_3"), true);
  });

  test("markAbsent deletes the key", async () => {
    const { presence } = newPresence();
    await presence.markPresent("alpha", "sess_1", new Date(0));
    await presence.markAbsent("alpha", "sess_1");
    assert.equal(await presence.isPresent("alpha", "sess_1"), false);
  });
});
