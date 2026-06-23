/**
 * Per-IP rate limiter for the room-creation endpoint (Issue #37).
 *
 * Pattern mirrors the existing passcode and reclaim rate limiters:
 * sliding window of failures, cooldown after the threshold trips.
 * Keyed by the client IP only (room creation is global, not per-slug)
 * so that an abusive client cannot bypass the limit by creating a
 * fresh slug each request.
 */

export interface RoomCreateRateLimiterState {
  failuresInWindow: number;
  cooldownUntil: number | null;
}

export interface RoomCreateRateLimiter {
  shouldAllow(clientIp: string): boolean;
  recordFailure(clientIp: string): void;
  recordSuccess(clientIp: string): void;
  clearAll(): void;
  getState(clientIp: string): RoomCreateRateLimiterState;
}

export interface CreateRoomCreateRateLimiterOptions {
  /** Sliding window duration in milliseconds. Default 60s. */
  windowMs?: number;
  /** Failure count that triggers cooldown. Default 5. */
  threshold?: number;
  /** Cooldown duration in milliseconds. Default 60s. */
  cooldownMs?: number;
  /** Injected clock for deterministic tests. Defaults to `Date.now`. */
  now?: () => number;
}

interface Bucket {
  failures: number[];
  cooldownUntil: number | null;
}

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_THRESHOLD = 5;
const DEFAULT_COOLDOWN_MS = 60_000;

export function createInMemoryRoomCreateRateLimiter(
  options: CreateRoomCreateRateLimiterOptions = {},
): RoomCreateRateLimiter {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const now = options.now ?? (() => Date.now());

  const buckets = new Map<string, Bucket>();

  function getBucket(ip: string): Bucket {
    let bucket = buckets.get(ip);
    if (bucket == null) {
      bucket = { failures: [], cooldownUntil: null };
      buckets.set(ip, bucket);
    }
    return bucket;
  }

  function prune(bucket: Bucket, at: number): void {
    const cutoff = at - windowMs;
    bucket.failures = bucket.failures.filter((timestamp) => timestamp > cutoff);
  }

  function shouldAllow(clientIp: string): boolean {
    const bucket = getBucket(clientIp);
    const at = now();

    if (bucket.cooldownUntil != null) {
      if (at < bucket.cooldownUntil) {
        return false;
      }
      // Cooldown expired — reset the bucket so a fresh window starts.
      bucket.cooldownUntil = null;
      bucket.failures = [];
    }

    prune(bucket, at);
    return true;
  }

  function recordFailure(clientIp: string): void {
    const bucket = getBucket(clientIp);
    const at = now();
    prune(bucket, at);
    bucket.failures.push(at);

    if (bucket.failures.length >= threshold && bucket.cooldownUntil == null) {
      bucket.cooldownUntil = at + cooldownMs;
    }
  }

  function recordSuccess(clientIp: string): void {
    const bucket = buckets.get(clientIp);
    if (bucket == null) {
      return;
    }
    bucket.failures = [];
    bucket.cooldownUntil = null;
  }

  function clearAll(): void {
    buckets.clear();
  }

  function getState(clientIp: string): RoomCreateRateLimiterState {
    const bucket = buckets.get(clientIp);
    if (bucket == null) {
      return { failuresInWindow: 0, cooldownUntil: null };
    }
    prune(bucket, now());
    return {
      failuresInWindow: bucket.failures.length,
      cooldownUntil: bucket.cooldownUntil,
    };
  }

  return { shouldAllow, recordFailure, recordSuccess, clearAll, getState };
}
