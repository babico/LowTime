import type { RoomSlug } from "@lowtime/shared";

import type { PasscodeRateLimiter, RateLimitKey } from "./passcode-rate-limiter.js";
import type { ReclaimRateLimiter } from "./reclaim-rate-limiter.js";
import type { RoomCreateRateLimiter } from "./room-create-rate-limiter.js";

/**
 * Redis-backed rate limiter implementations (Issue #33, slice 1).
 *
 * Each limiter implements the existing in-memory interface so a
 * caller can swap one for the other without changing the route code.
 * The only state kept in Redis is a sorted set of failure
 * timestamps per key plus a separate cooldown value. The tests use
 * `ioredis-mock`; production code wires an `ioredis` client through
 * the same `RedisLike` interface.
 *
 * Key shape:
 *   <prefix>:<rate-limit-internal-key>:failures  ZSET of timestamps
 *   <prefix>:<rate-limit-internal-key>:cooldown  STRING epoch ms
 *
 * The `cooldown` key is a plain string so the limiter can set it
 * with a single SET command and read it in one GET, with no race
 * against the sorted-set prune.
 */

export interface RedisLike {
  zadd(key: string, score: number, member: string): Promise<unknown>;
  zremrangebyscore(key: string, min: number, max: number): Promise<unknown>;
  zcard(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: string, duration: number): Promise<unknown>;
  scan(cursor: string | number, ...args: string[]): Promise<[string, string[]]>;
}

export interface RedisLimiterOptionsBase {
  redis: RedisLike;
  keyPrefix: string;
  windowMs?: number;
  threshold?: number;
  cooldownMs?: number;
  now?: () => number;
}

const DEFAULT_WINDOW_MS = 5 * 60_000;
const DEFAULT_THRESHOLD = 5;
const DEFAULT_COOLDOWN_MS = 60_000;

const KEY_DELIMITER = "\u0001";

function buildKey(prefix: string, internalKey: string): string {
  return `${prefix}:${internalKey}`;
}

function buildFailuresKey(prefix: string, internalKey: string): string {
  return `${prefix}:${internalKey}:failures`;
}

function buildCooldownKey(prefix: string, internalKey: string): string {
  return `${prefix}:${internalKey}:cooldown`;
}

function buildPrefixScanPattern(prefix: string): string {
  return `${prefix}:*`;
}

function internalKeyFromKey(key: RateLimitKey): string {
  return `${key.clientIp}${KEY_DELIMITER}${key.slug}`;
}

async function pruneAndCount(
  redis: RedisLike,
  failuresKey: string,
  at: number,
  windowMs: number,
): Promise<number> {
  const cutoff = at - windowMs;
  await redis.zremrangebyscore(failuresKey, "-inf", String(cutoff));
  const count = await redis.zcard(failuresKey);
  return Number(count);
}

async function readCooldown(redis: RedisLike, cooldownKey: string): Promise<number | null> {
  const raw = await redis.get(cooldownKey);
  if (raw == null) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function listKeysForPrefix(redis: RedisLike, pattern: string): Promise<string[]> {
  const out: string[] = [];
  let cursor = "0";
  for (;;) {
    const [next, batch] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 200);
    cursor = next;
    if (batch.length > 0) {
      out.push(...batch);
    }
    if (cursor === "0") {
      break;
    }
  }
  return out;
}

function clipWindowMs(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : DEFAULT_WINDOW_MS;
}

function clipThreshold(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : DEFAULT_THRESHOLD;
}

function clipCooldownMs(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_COOLDOWN_MS;
}

export type RedisPasscodeRateLimiterOptions = RedisLimiterOptionsBase;

export function createRedisPasscodeRateLimiter(
  options: RedisPasscodeRateLimiterOptions,
): PasscodeRateLimiter {
  const redis = options.redis;
  const prefix = options.keyPrefix;
  const windowMs = clipWindowMs(options.windowMs);
  const threshold = clipThreshold(options.threshold);
  const cooldownMs = clipCooldownMs(options.cooldownMs);
  const now = options.now ?? (() => Date.now());

  function failuresKey(key: RateLimitKey): string {
    return buildFailuresKey(prefix, internalKeyFromKey(key));
  }

  function cooldownKey(key: RateLimitKey): string {
    return buildCooldownKey(prefix, internalKeyFromKey(key));
  }

  return {
    async shouldAllow(key) {
      const at = now();
      const cooldown = await readCooldown(redis, cooldownKey(key));
      if (cooldown != null && at < cooldown) {
        return false;
      }
      if (cooldown != null) {
        await redis.del(cooldownKey(key));
      }
      await pruneAndCount(redis, failuresKey(key), at, windowMs);
      return true;
    },
    async recordFailure(key) {
      const at = now();
      await pruneAndCount(redis, failuresKey(key), at, windowMs);
      await redis.zadd(failuresKey(key), at, `${at}-${Math.random().toString(36).slice(2, 10)}`);
      const count = await redis.zcard(failuresKey(key));
      if (Number(count) >= threshold) {
        await redis.set(
          cooldownKey(key),
          String(at + cooldownMs),
          "PX",
          cooldownMs,
        );
      }
    },
    async recordSuccess(key) {
      await Promise.all([redis.del(failuresKey(key)), redis.del(cooldownKey(key))]);
    },
    async clear(slug: RoomSlug) {
      const keys = await listKeysForPrefix(redis, buildPrefixScanPattern(prefix));
      const targetSuffix = `${KEY_DELIMITER}${slug}`;
      const toDelete = keys.filter((key) => key.includes(targetSuffix));
      if (toDelete.length > 0) {
        await redis.del(...toDelete);
      }
    },
    async getState(key) {
      const at = now();
      const count = await pruneAndCount(redis, failuresKey(key), at, windowMs);
      const cooldown = await readCooldown(redis, cooldownKey(key));
      return {
        failuresInWindow: Number(count),
        cooldownUntil: cooldown != null && cooldown > at ? cooldown : null,
      };
    },
  };
}

export type RedisReclaimRateLimiterOptions = RedisLimiterOptionsBase;

export function createRedisReclaimRateLimiter(
  options: RedisReclaimRateLimiterOptions,
): ReclaimRateLimiter {
  const redis = options.redis;
  const prefix = options.keyPrefix;
  const windowMs = clipWindowMs(options.windowMs);
  const threshold = clipThreshold(options.threshold);
  const cooldownMs = clipCooldownMs(options.cooldownMs);
  const now = options.now ?? (() => Date.now());

  return {
    async shouldAllow(clientIp: string) {
      const at = now();
      const cooldown = await readCooldown(redis, buildCooldownKey(prefix, clientIp));
      if (cooldown != null && at < cooldown) {
        return false;
      }
      if (cooldown != null) {
        await redis.del(buildCooldownKey(prefix, clientIp));
      }
      await pruneAndCount(redis, buildFailuresKey(prefix, clientIp), at, windowMs);
      return true;
    },
    async recordFailure(clientIp: string) {
      const at = now();
      await pruneAndCount(redis, buildFailuresKey(prefix, clientIp), at, windowMs);
      await redis.zadd(
        buildFailuresKey(prefix, clientIp),
        at,
        `${at}-${Math.random().toString(36).slice(2, 10)}`,
      );
      const count = await redis.zcard(buildFailuresKey(prefix, clientIp));
      if (Number(count) >= threshold) {
        await redis.set(buildCooldownKey(prefix, clientIp), String(at + cooldownMs), "PX", cooldownMs);
      }
    },
    async recordSuccess(clientIp: string) {
      await Promise.all([
        redis.del(buildFailuresKey(prefix, clientIp)),
        redis.del(buildCooldownKey(prefix, clientIp)),
      ]);
    },
    async clearAll() {
      const keys = await listKeysForPrefix(redis, buildPrefixScanPattern(prefix));
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    },
  };
}

export type RedisRoomCreateRateLimiterOptions = RedisLimiterOptionsBase;

export function createRedisRoomCreateRateLimiter(
  options: RedisRoomCreateRateLimiterOptions,
): RoomCreateRateLimiter {
  const redis = options.redis;
  const prefix = options.keyPrefix;
  const windowMs = clipWindowMs(options.windowMs);
  const threshold = clipThreshold(options.threshold);
  const cooldownMs = clipCooldownMs(options.cooldownMs);
  const now = options.now ?? (() => Date.now());

  return {
    async shouldAllow(clientIp: string) {
      const at = now();
      const cooldown = await readCooldown(redis, buildCooldownKey(prefix, clientIp));
      if (cooldown != null && at < cooldown) {
        return false;
      }
      if (cooldown != null) {
        await redis.del(buildCooldownKey(prefix, clientIp));
      }
      await pruneAndCount(redis, buildFailuresKey(prefix, clientIp), at, windowMs);
      return true;
    },
    async recordFailure(clientIp: string) {
      const at = now();
      await pruneAndCount(redis, buildFailuresKey(prefix, clientIp), at, windowMs);
      await redis.zadd(
        buildFailuresKey(prefix, clientIp),
        at,
        `${at}-${Math.random().toString(36).slice(2, 10)}`,
      );
      const count = await redis.zcard(buildFailuresKey(prefix, clientIp));
      if (Number(count) >= threshold) {
        await redis.set(buildCooldownKey(prefix, clientIp), String(at + cooldownMs), "PX", cooldownMs);
      }
    },
    async recordSuccess(clientIp: string) {
      await Promise.all([
        redis.del(buildFailuresKey(prefix, clientIp)),
        redis.del(buildCooldownKey(prefix, clientIp)),
      ]);
    },
    async clearAll() {
      const keys = await listKeysForPrefix(redis, buildPrefixScanPattern(prefix));
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    },
    async getState(clientIp: string) {
      const at = now();
      const count = await pruneAndCount(redis, buildFailuresKey(prefix, clientIp), at, windowMs);
      const cooldown = await readCooldown(redis, buildCooldownKey(prefix, clientIp));
      return {
        failuresInWindow: Number(count),
        cooldownUntil: cooldown != null && cooldown > at ? cooldown : null,
      };
    },
  };
}
