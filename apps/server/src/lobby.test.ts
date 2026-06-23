import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import RedisMock from "ioredis-mock";

import {
  createInMemoryLobby,
  createRedisLobby,
  type Lobby,
  type RedisLike,
} from "./domain/lobby.js";

function now(offsetMs: number = 0): Date {
  return new Date(Date.UTC(2026, 5, 22, 12, 0, 0, offsetMs));
}

describe("createInMemoryLobby", () => {
  function newLobby(cap?: number): Lobby {
    return createInMemoryLobby(cap != null ? { recentDecisionsCap: cap } : {});
  }

  test("enqueue then list returns the request", async () => {
    const lobby = newLobby();
    const id = await lobby.enqueue({ roomSlug: "alpha", displayName: "Alice", now: now() });
    assert.equal(typeof id, "string");
    const items = await lobby.list("alpha");
    assert.equal(items.length, 1);
    assert.equal(items[0]?.displayName, "Alice");
  });

  test("decide marks the request as approved and removes it from the queue", async () => {
    const lobby = newLobby();
    const id = await lobby.enqueue({ roomSlug: "alpha", displayName: "Alice", now: now() });
    const decided = await lobby.decide("alpha", id, "approve", now(1000));
    assert.equal(decided.ok, true);
    const items = await lobby.list("alpha");
    assert.equal(items.length, 0);
    const decisions = await lobby.recentDecisions("alpha");
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0]?.decision, "approve");
  });

  test("decide returns ok false for an unknown request", async () => {
    const lobby = newLobby();
    const decided = await lobby.decide("alpha", "sess_missing", "deny", now());
    assert.equal(decided.ok, false);
  });

  test("recentDecisions is bounded by the cap", async () => {
    const lobby = newLobby(2);
    const r1 = await lobby.enqueue({ roomSlug: "alpha", displayName: "A", now: now() });
    const r2 = await lobby.enqueue({ roomSlug: "alpha", displayName: "B", now: now(1) });
    const r3 = await lobby.enqueue({ roomSlug: "alpha", displayName: "C", now: now(2) });
    await lobby.decide("alpha", r1, "approve", now(3));
    await lobby.decide("alpha", r2, "approve", now(4));
    await lobby.decide("alpha", r3, "approve", now(5));
    const recent = await lobby.recentDecisions("alpha");
    assert.equal(recent.length, 2);
    assert.equal(recent[0]?.requestId, r2);
    assert.equal(recent[1]?.requestId, r3);
  });

  test("list returns only the queue for the given room", async () => {
    const lobby = newLobby();
    await lobby.enqueue({ roomSlug: "alpha", displayName: "Alice", now: now() });
    await lobby.enqueue({ roomSlug: "beta", displayName: "Bob", now: now() });
    assert.equal((await lobby.list("alpha")).length, 1);
    assert.equal((await lobby.list("beta")).length, 1);
  });
});

describe("createRedisLobby", () => {
  function makeRedis(): RedisLike {
    return new RedisMock() as unknown as RedisLike;
  }

  function newLobby(suffix: string, cap?: number): Lobby {
    return createRedisLobby({
      redis: makeRedis(),
      keyPrefix: `lowtime-test-lobby-${suffix}-${Math.random().toString(36).slice(2, 8)}`,
      recentDecisionsCap: cap,
    });
  }

  test("enqueue then list returns the request", async () => {
    const lobby = newLobby("enqueue");
    const id = await lobby.enqueue({ roomSlug: "alpha", displayName: "Alice", now: now() });
    assert.equal(typeof id, "string");
    const items = await lobby.list("alpha");
    assert.equal(items.length, 1);
    assert.equal(items[0]?.displayName, "Alice");
  });

  test("decide marks the request as approved", async () => {
    const lobby = newLobby("decide");
    const id = await lobby.enqueue({ roomSlug: "alpha", displayName: "Bob", now: now() });
    const decided = await lobby.decide("alpha", id, "deny", now(1000));
    assert.equal(decided.ok, true);
    const items = await lobby.list("alpha");
    assert.equal(items.length, 0);
  });

  test("recentDecisions is bounded by the cap", async () => {
    const lobby = newLobby("cap", 2);
    const r1 = await lobby.enqueue({ roomSlug: "alpha", displayName: "A", now: now() });
    const r2 = await lobby.enqueue({ roomSlug: "alpha", displayName: "B", now: now(1) });
    const r3 = await lobby.enqueue({ roomSlug: "alpha", displayName: "C", now: now(2) });
    await lobby.decide("alpha", r1, "approve", now(3));
    await lobby.decide("alpha", r2, "approve", now(4));
    await lobby.decide("alpha", r3, "approve", now(5));
    const recent = await lobby.recentDecisions("alpha");
    assert.equal(recent.length, 2);
  });

  test("list returns only the queue for the given room", async () => {
    const lobby = newLobby("list");
    await lobby.enqueue({ roomSlug: "alpha", displayName: "Alice", now: now() });
    await lobby.enqueue({ roomSlug: "beta", displayName: "Bob", now: now() });
    assert.equal((await lobby.list("alpha")).length, 1);
    assert.equal((await lobby.list("beta")).length, 1);
  });
});
