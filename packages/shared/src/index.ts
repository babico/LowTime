export type RoomSlug = string;

/** Five minutes. Shared reconnect-window constant used by both server and web client. */
export const RECONNECT_WINDOW_MS = 5 * 60 * 1000;

export type AccessMode = "open" | "lobby" | "passcode";

export type QualityCap = "low" | "balanced" | "high";

export type QualityPreset = "data_saver" | "balanced" | "best_quality";

export type RoomStatus = "created" | "active" | "expiring" | "expired" | "closed";

export type TransportPreference = "sfu" | "p2p";

export type JoinState = "direct" | "waiting" | "denied";

export type JoinDeniedReason = "room_full" | "room_expired" | "passcode_required" | "invalid_passcode";
export type LobbyRequestStatus = "waiting" | "approved" | "denied";

export interface RoomSummary {
  slug: RoomSlug;
  accessMode: AccessMode;
  maxParticipants: number;
  qualityCap: QualityCap;
  allowScreenShare: boolean;
  status: RoomStatus;
  expiresAt: string;
}

export interface RequestedMedia {
  audio: boolean;
  video: boolean;
}

export interface CreateRoomRequest {
  accessMode?: AccessMode;
  maxParticipants?: number;
  qualityCap?: QualityCap;
  allowScreenShare?: boolean;
  passcode?: string;
}

export interface CreateRoomResponse {
  roomSlug: RoomSlug;
  joinUrl: string;
  hostSecret: string;
  expiresAt: string;
  room: RoomSummary;
  passcode?: string;
}

export interface UpdateRoomSettingsRequest {
  accessMode?: AccessMode;
  passcode?: string;
  qualityCap?: QualityCap;
}

export type ResolutionCap = "240p" | "360p" | "480p" | "720p";

export interface AdvancedMediaPrefs {
  maxResolution?: ResolutionCap;
  maxFps?: number;
  maxBitrateKbps?: number;
  audioPriority?: boolean;
  receiveVideo?: boolean;
  audioOnly?: boolean;
}

/**
 * Maps a `ResolutionCap` to its pixel dimensions. Total and idempotent.
 */
export function resolutionCapToPixels(cap: ResolutionCap): {
  width: number;
  height: number;
} {
  switch (cap) {
    case "240p":
      return { width: 320, height: 240 };
    case "360p":
      return { width: 640, height: 360 };
    case "480p":
      return { width: 854, height: 480 };
    case "720p":
      return { width: 1280, height: 720 };
  }
}

export interface UpdateRoomSettingsResponse {
  room: RoomSummary;
}

export interface ReclaimRoomResponse {
  room: RoomSummary;
  lobbyRequests: LobbyRequestSummary[];
}

/**
 * Returns the highest preset a guest can publish given the host-imposed
 * quality cap. The mapping is:
 *
 *   - `low`       → allows only `data_saver`
 *   - `balanced`  → allows `data_saver` and `balanced`
 *   - `high`      → allows all presets
 *
 * Guests may request any preset; this helper clamps their selection to the
 * highest the host permits. Idempotent, total, and pure.
 */
export function clampPresetToCap(preset: QualityPreset, cap: QualityCap): QualityPreset {
  const presetRank: Record<QualityPreset, number> = {
    data_saver: 0,
    balanced: 1,
    best_quality: 2,
  };
  const capRank: Record<QualityCap, number> = {
    low: 0,
    balanced: 1,
    high: 2,
  };
  if (presetRank[preset] <= capRank[cap]) {
    return preset;
  }
  // Inverse lookup: highest preset whose rank equals the cap rank.
  const allowedRank = capRank[cap];
  const fallback = (Object.keys(presetRank) as QualityPreset[]).find(
    (p) => presetRank[p] === allowedRank,
  );
  return fallback ?? "data_saver";
}

export interface JoinRoomRequest {
  displayName: string;
  passcode?: string;
  qualityPreset?: QualityPreset;
  requestedMedia?: RequestedMedia;
}

export interface JoinRoomDirectResponse {
  joinState: "direct";
  sessionId: string;
  transportPreference: TransportPreference;
}

export interface JoinRoomWaitingResponse {
  joinState: "waiting";
  requestId: string;
}

export interface JoinRoomDeniedResponse {
  joinState: "denied";
  reason: JoinDeniedReason;
}

export type JoinRoomResponse =
  | JoinRoomDirectResponse
  | JoinRoomWaitingResponse
  | JoinRoomDeniedResponse;

export interface LobbyRequestSummary {
  requestId: string;
  displayName: string;
  createdAt: string;
}

export interface LobbyRequestStatusWaitingResponse {
  status: "waiting";
}

export interface LobbyRequestStatusApprovedResponse {
  status: "approved";
  sessionId: string;
  transportPreference: TransportPreference;
}

export interface LobbyRequestStatusDeniedResponse {
  status: "denied";
  reason: "host_denied" | "room_expired" | "room_closed" | "lobby_timeout";
}

export type LobbyRequestStatusResponse =
  | LobbyRequestStatusWaitingResponse
  | LobbyRequestStatusApprovedResponse
  | LobbyRequestStatusDeniedResponse;

export interface MediaTokenRequest {
  sessionId: string;
  transportPreference?: TransportPreference;
}

export interface SfuTokenResponse {
  transport: "sfu";
  sfuUrl: string;
  token: string;
  roomName: RoomSlug;
  participantIdentity: string;
  participantName: string;
}

export interface IceServerConfig {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface P2PSessionConfig {
  offerRole: "caller" | "callee";
  iceServers: IceServerConfig[];
}

export interface P2PTokenResponse {
  transport: "p2p";
  p2pSession: P2PSessionConfig;
}

export type MediaTokenResponse = SfuTokenResponse | P2PTokenResponse;
