/**
 * Presence tracking for the room lifecycle (Issue #33 slice 2).
 *
 * Pure interface so the in-memory implementation stays the dev
 * default and the Redis-backed implementation can be wired in
 * production without changing any caller. Both implementations
 * use the same shape: per-(room, session) heartbeat value with a
 * TTL-style grace window that the cleanup loop respects.
 */

export type PresenceKey = string;

export function presenceKeyFor(roomSlug: string, sessionId: string): PresenceKey {
  return `${roomSlug}\u0001${sessionId}`;
}

export interface Presence {
  /** Records that a session is currently in a room. */
  markPresent(roomSlug: string, sessionId: string, now: Date): Promise<void>;
  /** Removes a session from a room. Idempotent. */
  markAbsent(roomSlug: string, sessionId: string): Promise<void>;
  /** Returns true if the session is currently considered present. */
  isPresent(roomSlug: string, sessionId: string): Promise<boolean>;
  /**
   * Drops every bucket whose lastSeenAt is older than the grace
   * window. Returns the keys that were removed so the caller can
   * surface them (e.g. emit a `session_expired` counter).
   */
  pruneExpired(now: Date): Promise<PresenceKey[]>;
}

export interface PresenceOptions {
  presenceTtlMs?: number;
  now?: () => number;
}

const DEFAULT_PRESENCE_TTL_MS = 60_000;

function clipTtl(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_PRESENCE_TTL_MS;
}

export function createInMemoryPresence(options: PresenceOptions = {}): Presence {
  const ttlMs = clipTtl(options.presenceTtlMs);
  const now = options.now ?? (() => Date.now());
  const buckets = new Map<PresenceKey, number>();

  function keyOf(roomSlug: string, sessionId: string): PresenceKey {
    return presenceKeyFor(roomSlug, sessionId);
  }

  return {
    async markPresent(roomSlug, sessionId, at) {
      buckets.set(keyOf(roomSlug, sessionId), at.getTime());
    },
    async markAbsent(roomSlug, sessionId) {
      buckets.delete(keyOf(roomSlug, sessionId));
    },
    async isPresent(roomSlug, sessionId) {
      const lastSeenAt = buckets.get(keyOf(roomSlug, sessionId));
      if (lastSeenAt == null) {
        return false;
      }
      return now() - lastSeenAt <= ttlMs;
    },
    async pruneExpired(at) {
      const cutoff = at.getTime() - ttlMs;
      const removed: PresenceKey[] = [];
      for (const [key, lastSeenAt] of buckets) {
        if (lastSeenAt < cutoff) {
          buckets.delete(key);
          removed.push(key);
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
  zrange(key: string, start: number, stop: number): Promise<string[]>;
  zremrangebyscore(key: string, min: number, max: number): Promise<unknown>;
  zcard(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

export interface RedisPresenceOptions extends PresenceOptions {
  redis: RedisLike;
  keyPrefix: string;
}

function presenceRedisKey(prefix: string, key: PresenceKey): string {
  return `${prefix}:p:${key}`;
}

function presenceIndexKey(prefix: string): string {
  return `${prefix}:p-index`;
}

function buildIndexMember(key: PresenceKey): string {
  return key;
}

export function createRedisPresence(options: RedisPresenceOptions): Presence {
  const redis = options.redis;
  const prefix = options.keyPrefix;
  const ttlMs = clipTtl(options.presenceTtlMs);
  const now = options.now ?? (() => Date.now());

  return {
    async markPresent(roomSlug, sessionId, at) {
      const key = presenceKeyFor(roomSlug, sessionId);
      const redisKey = presenceRedisKey(prefix, key);
      const indexKey = presenceIndexKey(prefix);
      const score = at.getTime();
      await Promise.all([
        redis.set(redisKey, String(score), "PX", ttlMs),
        redis.zadd(indexKey, score, buildIndexMember(key)),
      ]);
      // Trim the index of entries that are clearly older than the window.
      await redis.zremrangebyscore(indexKey, 0, score - ttlMs);
    },
    async markAbsent(roomSlug, sessionId) {
      const key = presenceKeyFor(roomSlug, sessionId);
      const redisKey = presenceRedisKey(prefix, key);
      const indexKey = presenceIndexKey(prefix);
      await Promise.all([redis.del(redisKey), redis.zremrangebyscore(indexKey, 0, 0)]);
    },
    async isPresent(roomSlug, sessionId) {
      const value = await redis.get(presenceRedisKey(prefix, presenceKeyFor(roomSlug, sessionId)));
      if (value == null) {
        return false;
      }
      const score = Number.parseInt(value, 10);
      if (!Number.isFinite(score)) {
        return false;
      }
      return now() - score <= ttlMs;
    },
    async pruneExpired(at) {
      const cutoff = at.getTime() - ttlMs;
      const indexKey = presenceIndexKey(prefix);
      // Collect the candidates, drop them from the index, then drop
      // their per-key entries. We use ZRANGE to read the full index
      // here; the index is bounded by the per-room session count so
      // the cost is fine for the small-group beta target.
      const candidates = await redis.zrange(indexKey, 0, -1);
      const expired = candidates.filter((member) => {
        const lastSeenAt = Number.parseInt(member.split("\u0001").pop() ?? "", 10);
        void lastSeenAt;
        return true;
      });
      void expired;
      const scored = await Promise.all(
        candidates.map(async (member) => {
          const redisKey = presenceRedisKey(prefix, member);
          const value = await redis.get(redisKey);
          const score = value != null ? Number.parseInt(value, 10) : Number.NaN;
          return { member, score };
        }),
      );
      const expiredKeys = scored.filter((entry) => Number.isFinite(entry.score) && entry.score < cutoff);
      if (expiredKeys.length > 0) {
        await Promise.all([
          redis.zrem(indexKey, ...expiredKeys.map((entry) => entry.member)),
          redis.del(...expiredKeys.map((entry) => presenceRedisKey(prefix, entry.member))),
        ]);
      }
      return expiredKeys.map((entry) => entry.member as PresenceKey);
    },
  };
}
