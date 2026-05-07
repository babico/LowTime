import type { RoomSlug } from "@lowtime/shared";

/**
 * Identifies a single rate-limit bucket. Keyed by the pair `(clientIp, slug)`
 * so that one noisy client against one room does not lock out unrelated
 * clients or unrelated rooms (Requirement 6.4).
 */
export interface RateLimitKey {
  clientIp: string;
  slug: RoomSlug;
}

/** Inspectable state, used by tests and by Property 6 assertions. */
export interface PasscodeRateLimiterState {
  failuresInWindow: number;
  cooldownUntil: number | null;
}

export interface PasscodeRateLimiter {
  /**
   * Returns `true` if a passcode check may proceed for the given key,
   * `false` if the key is currently in cooldown. Does not mutate state.
   */
  shouldAllow(key: RateLimitKey): boolean;
  /** Records a failed passcode attempt for the key. */
  recordFailure(key: RateLimitKey): void;
  /** Records a successful passcode verification, clearing counters. */
  recordSuccess(key: RateLimitKey): void;
  /**
   * Clears every bucket whose key matches the given slug. Used on passcode
   * rotation and access-mode changes (Requirements 8.1 and 8.3).
   */
  clear(slug: RoomSlug): void;
  /** Test-only helper that exposes the current bucket state. */
  getState(key: RateLimitKey): PasscodeRateLimiterState;
}

export interface CreatePasscodeRateLimiterOptions {
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

// Use a non-printable delimiter for the internal key so that a slug containing
// "|" or similar characters cannot accidentally collide with another
// (clientIp, slug) pair. Room slugs are base58; client IPs are dotted quads or
// bracketed IPv6. Neither contains U+0001.
const INTERNAL_KEY_DELIMITER = "\u0001";

function keyFor(key: RateLimitKey): string {
  return `${key.clientIp}${INTERNAL_KEY_DELIMITER}${key.slug}`;
}

export function createInMemoryPasscodeRateLimiter(
  options: CreatePasscodeRateLimiterOptions = {},
): PasscodeRateLimiter {
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
      // Recovery after cooldown resets the failure ring so one overdue check
      // does not immediately re-trip the limiter (Requirement 6.3).
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

      // If a cooldown is already active, additional failures do not extend it
      // and are not appended to the ring; the handler should have short-
      // circuited via `shouldAllow` before reaching this code path.
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
    clear(slug) {
      const suffix = `${INTERNAL_KEY_DELIMITER}${slug}`;
      for (const internalKey of [...buckets.keys()]) {
        if (internalKey.endsWith(suffix)) {
          buckets.delete(internalKey);
        }
      }
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
