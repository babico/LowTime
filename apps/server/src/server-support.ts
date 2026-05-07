import { getLiveKitConfig, type LiveKitConfig } from "./livekit.js";
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
}

export interface RouteContext {
  liveKitConfig: LiveKitConfig | null;
  now: () => Date;
  roomStore: RoomStore;
}

export function createRouteContext(options: BuildAppOptions = {}): RouteContext {
  return {
    liveKitConfig: options.liveKitConfig === undefined ? getLiveKitConfig() : options.liveKitConfig,
    now: options.now ?? (() => new Date()),
    roomStore: options.roomStore ?? createInMemoryRoomStore(),
  };
}

export function createRoomExpiry(now: Date): string {
  return new Date(now.getTime() + DEFAULT_ROOM_TTL_MS).toISOString();
}

export function hasValidHostSecret(room: StoredRoom, hostSecret: string | undefined): boolean {
  return hostSecret != null && hostSecret === room.hostSecret;
}
