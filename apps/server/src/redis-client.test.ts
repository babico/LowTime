import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { createRedisClientFromEnv } from "./redis-client.js";
import type { RedisLike } from "./domain/redis-rate-limiter.js";

describe("createRedisClientFromEnv", () => {
  test("returns null when REDIS_URL is not set", () => {
    const saved = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    try {
      const client = createRedisClientFromEnv();
      assert.equal(client, null);
    } finally {
      if (saved != null) process.env.REDIS_URL = saved;
    }
  });

  test("returns null when REDIS_URL is empty", () => {
    const saved = process.env.REDIS_URL;
    process.env.REDIS_URL = "";
    try {
      const client = createRedisClientFromEnv();
      assert.equal(client, null);
    } finally {
      if (saved != null) process.env.REDIS_URL = saved;
    }
  });

  test("returns null when REDIS_URL is whitespace", () => {
    const saved = process.env.REDIS_URL;
    process.env.REDIS_URL = "   ";
    try {
      const client = createRedisClientFromEnv();
      assert.equal(client, null);
    } finally {
      if (saved != null) process.env.REDIS_URL = saved;
    }
  });

  test("returns a client when REDIS_URL is set", () => {
    const saved = process.env.REDIS_URL;
    process.env.REDIS_URL = "redis://localhost:6379";
    try {
      const client = createRedisClientFromEnv();
      assert.notEqual(client, null);
      const _typed: RedisLike | null = client;
      void _typed;
    } finally {
      if (saved != null) process.env.REDIS_URL = saved;
    }
  });
});
