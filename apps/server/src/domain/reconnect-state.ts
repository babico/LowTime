/**
 * Reconnect window state (Issue #33 slice 4).
 *
 * Pure interface so the in-memory implementation stays the dev
 * default and the Redis-backed implementation can be wired in
 * production. The room store already keeps the per-session
 * lastSeenAt; this module adds the explicit "disconnected at"
 * marker that the reconnect flow checks before the TTL elapses.
 */

export interface ReconnectState {
  markDisconnected(sessionId: string, at: Date): Promise<void>;
  isReconnectable(sessionId: string, now: Date): Promise<boolean>;
  clear(sessionId: string): Promise<void>;
  reapExpired(now: Date): Promise<string[]>;
}

export interface ReconnectStateOptions {
  windowMs?: number;
  now?: () => number;
}

const DEFAULT_WINDOW_MS = 5 * 60_000;

function clipWindow(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_WINDOW_MS;
}

export function createInMemoryReconnectState(options: ReconnectStateOptions = {}): ReconnectState {
  const windowMs = clipWindow(options.windowMs);
  const now = options.now ?? (() => Date.now());
  const buckets = new Map<string, number>();

  return {
    async markDisconnected(sessionId, at) {
      buckets.set(sessionId, at.getTime());
    },
    async isReconnectable(sessionId, at) {
      const disconnectedAt = buckets.get(sessionId);
      if (disconnectedAt == null) {
        return false;
      }
      return at.getTime() - disconnectedAt <= windowMs;
    },
    async clear(sessionId) {
      buckets.delete(sessionId);
    },
    async reapExpired(at) {
      const cutoff = at.getTime() - windowMs;
      const removed: string[] = [];
      for (const [sessionId, disconnectedAt] of buckets) {
        if (disconnectedAt < cutoff) {
          buckets.delete(sessionId);
          removed.push(sessionId);
        }
      }
      return removed;
    },
  };
}

export interface RedisLike {
  set(key: string, value: string, mode: string, duration: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  zadd(key: string, score: number, member: string): Promise<unknown>;
  zrem(key: string, ...members: string[]): Promise<number>;
  zremrangebyscore(key: string, min: number, max: number): Promise<unknown>;
  zrange(key: string, start: number, stop: number): Promise<string[]>;
  zcard(key: string): Promise<number>;
}

export interface RedisReconnectStateOptions extends ReconnectStateOptions {
  redis: RedisLike;
  keyPrefix: string;
}

function keyFor(prefix: string, sessionId: string): string {
  return `${prefix}:r:${sessionId}`;
}

function indexKey(prefix: string): string {
  return `${prefix}:r-index`;
}

export function createRedisReconnectState(options: RedisReconnectStateOptions): ReconnectState {
  const redis = options.redis;
  const prefix = options.keyPrefix;
  const windowMs = clipWindow(options.windowMs);
  const now = options.now ?? (() => Date.now());

  return {
    async markDisconnected(sessionId, at) {
      const score = at.getTime();
      const k = keyFor(prefix, sessionId);
      const idx = indexKey(prefix);
      await Promise.all([
        redis.set(k, String(score), "PX", windowMs),
        redis.zadd(idx, score, sessionId),
      ]);
      await redis.zremrangebyscore(idx, 0, score - windowMs);
    },
    async isReconnectable(sessionId, at) {
      const raw = await redis.get(keyFor(prefix, sessionId));
      if (raw == null) {
        return false;
      }
      const disconnectedAt = Number.parseInt(raw, 10);
      if (!Number.isFinite(disconnectedAt)) {
        return false;
      }
      return at.getTime() - disconnectedAt <= windowMs;
    },
    async clear(sessionId) {
      await Promise.all([
        redis.del(keyFor(prefix, sessionId)),
        redis.zrem(indexKey(prefix), sessionId),
      ]);
    },
    async reapExpired(at) {
      const cutoff = at.getTime() - windowMs;
      const idx = indexKey(prefix);
      const candidates = await redis.zrange(idx, 0, -1);
      const toRemove: string[] = [];
      for (const sessionId of candidates) {
        const value = await redis.get(keyFor(prefix, sessionId));
        if (value == null) {
          toRemove.push(sessionId);
          continue;
        }
        const score = Number.parseInt(value, 10);
        if (!Number.isFinite(score) || score < cutoff) {
          toRemove.push(sessionId);
        }
      }
      if (toRemove.length > 0) {
        await Promise.all([
          redis.zrem(idx, ...toRemove),
          redis.del(...toRemove.map((sessionId) => keyFor(prefix, sessionId))),
        ]);
      }
      void cutoff;
      return toRemove;
    },
  };
}
