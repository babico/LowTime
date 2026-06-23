import type { FastifyServerOptions } from "fastify";

import { getLiveKitConfig, type LiveKitConfig } from "./livekit.js";
import {
  createArgon2idPasscodeVerifier,
  type PasscodeVerifier,
} from "./domain/passcode-verifier.js";
import {
  createInMemoryPasscodeRateLimiter,
  type PasscodeRateLimiter,
} from "./domain/passcode-rate-limiter.js";
import {
  createInMemoryReclaimRateLimiter,
  type ReclaimRateLimiter,
} from "./domain/reclaim-rate-limiter.js";
import {
  createRedisPasscodeRateLimiter,
  createRedisReclaimRateLimiter,
  type RedisLike,
} from "./domain/redis-rate-limiter.js";
import type { CleanupScheduler } from "./domain/room-cleanup.js";
import {
  createInMemorySignalBus,
  type SignalBus,
} from "./domain/signal-bus.js";
import {
  createInMemoryRoomStore,
  type RoomStore,
  type StoredRoom,
} from "./domain/room-store.js";
import { createRedisClientFromEnv } from "./redis-client.js";
import type { IceServerConfig } from "@lowtime/shared";

/** Default ICE servers used when no override is provided. */
export const DEFAULT_ICE_SERVERS: IceServerConfig[] = [
  { urls: ["stun:stun.l.google.com:19302"] },
];

export interface BuildAppOptions {
  now?: () => Date;
  roomStore?: RoomStore;
  liveKitConfig?: LiveKitConfig | null;
  passcodeVerifier?: PasscodeVerifier;
  passcodeRateLimiter?: PasscodeRateLimiter;
  reclaimRateLimiter?: ReclaimRateLimiter;
  /** Injected signal bus override. Defaults to the in-memory implementation. */
  signalBus?: SignalBus;
  /**
   * ICE server configuration for P2P fallback. When omitted, defaults to a
   * public Google STUN server. Inject TURN credentials here in production.
   */
  iceServers?: IceServerConfig[];
  /**
   * Interval in ms for the cleanup loop. When omitted, `0`, negative, or
   * non-finite, the cleanup loop does not start. Tests build Fastify without
   * this option so they remain deterministic.
   */
  cleanupIntervalMs?: number;
  /** Injected scheduler for deterministic tests. Defaults to `setInterval`. */
  cleanupScheduler?: CleanupScheduler;
  /**
   * Overrides the Fastify logger option used by `buildApp`. Primarily used by
   * tests that capture log output into an in-memory buffer. When omitted the
   * default `true` is used.
   */
  logger?: FastifyServerOptions["logger"];
  /**
   * Optional Redis client. When provided, the rate limiters are
   * created on top of this client instead of using the in-memory
   * implementations. When omitted, `createRouteContext` falls back
   * to `createRedisClientFromEnv()` and then to in-memory when no
   * `REDIS_URL` is set.
   */
  redis?: RedisLike | null;
}

export interface RouteContext {
  liveKitConfig: LiveKitConfig | null;
  now: () => Date;
  roomStore: RoomStore;
  passcodeVerifier: PasscodeVerifier;
  passcodeRateLimiter: PasscodeRateLimiter;
  reclaimRateLimiter: ReclaimRateLimiter;
  signalBus: SignalBus;
  iceServers: IceServerConfig[];
}

function buildRateLimiters(
  options: BuildAppOptions,
  redis: RedisLike | null,
): { passcode: PasscodeRateLimiter; reclaim: ReclaimRateLimiter } {
  if (redis == null) {
    return {
      passcode: options.passcodeRateLimiter ?? createInMemoryPasscodeRateLimiter(),
      reclaim: options.reclaimRateLimiter ?? createInMemoryReclaimRateLimiter(),
    };
  }
  return {
    passcode: options.passcodeRateLimiter ?? createRedisPasscodeRateLimiter({
      redis,
      keyPrefix: "lowtime:rl:passcode",
    }),
    reclaim: options.reclaimRateLimiter ?? createRedisReclaimRateLimiter({
      redis,
      keyPrefix: "lowtime:rl:reclaim",
    }),
  };
}

export function createRouteContext(options: BuildAppOptions = {}): RouteContext {
  const redis = options.redis ?? createRedisClientFromEnv();
  const limiters = buildRateLimiters(options, redis);
  return {
    liveKitConfig: options.liveKitConfig === undefined ? getLiveKitConfig() : options.liveKitConfig,
    now: options.now ?? (() => new Date()),
    roomStore: options.roomStore ?? createInMemoryRoomStore(),
    passcodeVerifier: options.passcodeVerifier ?? createArgon2idPasscodeVerifier(),
    passcodeRateLimiter: limiters.passcode,
    reclaimRateLimiter: limiters.reclaim,
    signalBus: options.signalBus ?? createInMemorySignalBus(),
    iceServers: options.iceServers ?? DEFAULT_ICE_SERVERS,
  };
}

export function hasValidHostSecret(room: StoredRoom, hostSecret: string | undefined): boolean {
  return hostSecret != null && hostSecret === room.hostSecret;
}
