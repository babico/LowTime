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
}

export interface RouteContext {
  liveKitConfig: LiveKitConfig | null;
  now: () => Date;
  roomStore: RoomStore;
  passcodeVerifier: PasscodeVerifier;
  passcodeRateLimiter: PasscodeRateLimiter;
  reclaimRateLimiter: ReclaimRateLimiter;
  signalBus: SignalBus;
}

export function createRouteContext(options: BuildAppOptions = {}): RouteContext {
  return {
    liveKitConfig: options.liveKitConfig === undefined ? getLiveKitConfig() : options.liveKitConfig,
    now: options.now ?? (() => new Date()),
    roomStore: options.roomStore ?? createInMemoryRoomStore(),
    passcodeVerifier: options.passcodeVerifier ?? createArgon2idPasscodeVerifier(),
    passcodeRateLimiter: options.passcodeRateLimiter ?? createInMemoryPasscodeRateLimiter(),
    reclaimRateLimiter: options.reclaimRateLimiter ?? createInMemoryReclaimRateLimiter(),
    signalBus: options.signalBus ?? createInMemorySignalBus(),
  };
}

export function hasValidHostSecret(room: StoredRoom, hostSecret: string | undefined): boolean {
  return hostSecret != null && hostSecret === room.hostSecret;
}
