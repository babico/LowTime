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
  createInMemoryRoomStore,
  type RoomStore,
  type StoredRoom,
} from "./domain/room-store.js";

const DEFAULT_ROOM_TTL_MS = 2 * 60 * 60 * 1000;

export interface BuildAppOptions {
  now?: () => Date;
  roomStore?: RoomStore;
  liveKitConfig?: LiveKitConfig | null;
  passcodeVerifier?: PasscodeVerifier;
  passcodeRateLimiter?: PasscodeRateLimiter;
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
}

export function createRouteContext(options: BuildAppOptions = {}): RouteContext {
  return {
    liveKitConfig: options.liveKitConfig === undefined ? getLiveKitConfig() : options.liveKitConfig,
    now: options.now ?? (() => new Date()),
    roomStore: options.roomStore ?? createInMemoryRoomStore(),
    passcodeVerifier: options.passcodeVerifier ?? createArgon2idPasscodeVerifier(),
    passcodeRateLimiter: options.passcodeRateLimiter ?? createInMemoryPasscodeRateLimiter(),
  };
}

export function createRoomExpiry(now: Date): string {
  return new Date(now.getTime() + DEFAULT_ROOM_TTL_MS).toISOString();
}

export function hasValidHostSecret(room: StoredRoom, hostSecret: string | undefined): boolean {
  return hostSecret != null && hostSecret === room.hostSecret;
}
