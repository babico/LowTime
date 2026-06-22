import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import RedisMock from "ioredis-mock";

import {
  createInMemoryReconnectState,
  createRedisReconnectState,
  type RedisLike,
} from "./domain/reconnect-state.js";

function now(offsetMs: number = 0): Date {
  return new Date(Date.UTC(2026, 5, 22, 12, 0, 0, offsetMs));
}

describe("createInMemoryReconnectState", () => {
  test("markDisconnected then isReconnectable reports true within the window", async () => {
    const state = createInMemoryReconnectState();
    await state.markDisconnected("sess_1", now());
    assert.equal(await state.isReconnectable("sess_1", now(10_000)), true);
  });

  test("isReconnectable returns false after the window expires", async () => {
    const state = createInMemoryReconnectState({ windowMs: 60_000 });
    await state.markDisconnected("sess_1", now());
    assert.equal(await state.isReconnectable("sess_1", now(61_000)), false);
  });

  test("isReconnectable returns false for an unknown session", async () => {
    const state = createInMemoryReconnectState();
    assert.equal(await state.isReconnectable("sess_missing", now()), false);
  });

  test("clear marks the session as no longer reconnectable", async () => {
    const state = createInMemoryReconnectState();
    await state.markDisconnected("sess_1", now());
    await state.clear("sess_1");
    assert.equal(await state.isReconnectable("sess_1", now(1000)), false);
  });

  test("reapExpired drops buckets past the window", async () => {
    const state = createInMemoryReconnectState({ windowMs: 60_000 });
    await state.markDisconnected("sess_old", now());
    await state.markDisconnected("sess_fresh", now(50_000));
    const removed = await state.reapExpired(now(61_000));
    assert.deepEqual(removed.sort(), ["sess_old"]);
    assert.equal(await state.isReconnectable("sess_old", now(61_000)), false);
    assert.equal(await state.isReconnectable("sess_fresh", now(61_000)), true);
  });
});

describe("createRedisReconnectState", () => {
  function makeRedis(): RedisLike {
    return new RedisMock() as unknown as RedisLike;
  }

  function newState(suffix: string, opts: { windowMs?: number } = {}): ReturnType<typeof createRedisReconnectState> {
    return createRedisReconnectState({
      redis: makeRedis(),
      keyPrefix: `lowtime-test-reconnect-${suffix}-${Math.random().toString(36).slice(2, 8)}`,
      windowMs: opts.windowMs,
    });
  }

  test("markDisconnected then isReconnectable reports true within the window", async () => {
    const state = newState("basic");
    await state.markDisconnected("sess_1", now());
    assert.equal(await state.isReconnectable("sess_1", now(10_000)), true);
  });

  test("isReconnectable returns false after the window expires", async () => {
    const state = newState("expire", { windowMs: 60_000 });
    await state.markDisconnected("sess_1", now());
    assert.equal(await state.isReconnectable("sess_1", now(61_000)), false);
  });

  test("clear marks the session as no longer reconnectable", async () => {
    const state = newState("clear");
    await state.markDisconnected("sess_1", now());
    await state.clear("sess_1");
    assert.equal(await state.isReconnectable("sess_1", now(1000)), false);
  });

  test("reapExpired drops buckets past the window", async () => {
    const state = newState("reap", { windowMs: 60_000 });
    await state.markDisconnected("sess_old", now());
    await state.markDisconnected("sess_fresh", now(50_000));
    const removed = await state.reapExpired(now(61_000));
    assert.deepEqual(removed.sort(), ["sess_old"]);
    assert.equal(await state.isReconnectable("sess_old", now(61_000)), false);
    assert.equal(await state.isReconnectable("sess_fresh", now(61_000)), true);
  });
});

void createInMemoryReconnectState;
