import { Redis, type Redis as IORedisType } from "ioredis";

import type { RedisLike } from "./domain/redis-rate-limiter.js";

/**
 * Creates a Redis client from the `REDIS_URL` env var, or returns
 * `null` when the var is unset/empty/whitespace.
 *
 * The caller is responsible for `client.quit()` and for handling
 * connection errors. The returned client uses the same defaults the
 * rate limiters expect: `lazyConnect`, `maxRetriesPerRequest: 1`,
 * and a 1.5s `connectTimeout` so a missing Redis does not block the
 * server startup indefinitely.
 */
export function createRedisClientFromEnv(): RedisLike | null {
  const raw = process.env["REDIS_URL"];
  if (raw == null) return null;
  const url = raw.trim();
  if (url.length === 0) return null;
  return new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 1500,
  }) as unknown as RedisLike;
}
