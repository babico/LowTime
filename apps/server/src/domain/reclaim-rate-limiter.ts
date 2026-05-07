import type { RoomSlug } from "@lowtime/shared";

/**
 * Identifies a single reclaim rate-limit bucket. Keyed by `(clientIp, slug)`
 * so one noisy client against one room does not lock out unrelated clients
 * or unrelated rooms (Requirement 5.5).
 */
export interface RateLimitKey {
  clientIp: string;
  slug: RoomSlug;
}

export interface ReclaimRateLimiterState {
  failuresInWindow: number;
  cooldownUntil: number | null;
}

/**
 * Tracks failed host-secret submissions against `POST /api/rooms/:slug/reclaim`.
 *
 * Separate from `PasscodeRateLimiter` by design: a host-reclaim flood must
 * not block guest passcode attempts on the same room, and settings-driven
 * passcode rotations must not wipe reclaim-failure state. See
 * docs/09-security-and-abuse.md and the host-reclaim-after-refresh design doc
 * for the rationale.
 */
export interface ReclaimRateLimiter {
  shouldAllow(key: RateLimitKey): boolean;
  recordFailure(key: RateLimitKey): void;
  recordSuccess(key: RateLimitKey): void;
  /** Test-only helper that exposes the current bucket state. */
  getState(key: RateLimitKey): ReclaimRateLimiterState;
}

export interface CreateReclaimRateLimiterOptions {
  /** Sliding window duration in milliseconds. Default 5 minutes. */
  windowMs?: number;
  /** Failure count that triggers cooldown. Default 5. */
  threshold?: number;
  /** Cooldown duration in milliseconds. Default 60 seconds. */
  cooldownMs?: number;
  /** Injected clock for deterministic tests. Defaults to `Date.now`. */
  now?: () => number;
}

interface Bucket {
  failures: number[];
  cooldownUntil: number | null;
}

const DEFAULT_WINDOW_MS = 5 * 60_000;
const DEFAULT_THRESHOLD = 5;
const DEFAULT_COOLDOWN_MS = 60_000;

// Same non-printable separator the passcode limiter uses so a slug containing
// a pipe or other visible separator cannot accidentally collide with another
// (clientIp, slug) pair.
const INTERNAL_KEY_DELIMITER = "\u0001";

function keyFor(key: RateLimitKey): string {
  return `${key.clientIp}${INTERNAL_KEY_DELIMITER}${key.slug}`;
}

export function createInMemoryReclaimRateLimiter(
  options: CreateReclaimRateLimiterOptions = {},
): ReclaimRateLimiter {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const now = options.now ?? (() => Date.now());

  const buckets = new Map<string, Bucket>();

  function getBucket(internalKey: string): Bucket {
    let bucket = buckets.get(internalKey);
    if (bucket == null) {
      bucket = { failures: [], cooldownUntil: null };
      buckets.set(internalKey, bucket);
    }
    return bucket;
  }

  function prune(bucket: Bucket, current: number): void {
    const cutoff = current - windowMs;
    while (bucket.failures.length > 0 && bucket.failures[0] < cutoff) {
      bucket.failures.shift();
    }
    if (bucket.cooldownUntil != null && current >= bucket.cooldownUntil) {
      bucket.cooldownUntil = null;
      bucket.failures.length = 0;
    }
  }

  return {
    shouldAllow(key) {
      const current = now();
      const bucket = getBucket(keyFor(key));
      prune(bucket, current);
      return bucket.cooldownUntil === null;
    },
    recordFailure(key) {
      const current = now();
      const bucket = getBucket(keyFor(key));
      prune(bucket, current);

      if (bucket.cooldownUntil !== null) {
        return;
      }

      bucket.failures.push(current);
      if (bucket.failures.length >= threshold) {
        bucket.cooldownUntil = current + cooldownMs;
      }
    },
    recordSuccess(key) {
      const bucket = buckets.get(keyFor(key));
      if (bucket == null) {
        return;
      }
      bucket.failures.length = 0;
      bucket.cooldownUntil = null;
    },
    getState(key) {
      const current = now();
      const bucket = getBucket(keyFor(key));
      prune(bucket, current);
      return {
        failuresInWindow: bucket.failures.length,
        cooldownUntil: bucket.cooldownUntil,
      };
    },
  };
}
